// Le script de navigateur (`build-page-reducer.mjs`) fait-il EXACTEMENT ce que fait l'outil en
// ligne de commande ? Mesuré dans Chromium, sur le script tel qu'il sera livré, exécuté dans une
// page ouverte comme le ferait l'outil `javascript_tool` de Claude in Chrome.
//
//   1. Sur chaque capture du dépôt (déjà réduite) : le fichier téléchargé est identique au fichier,
//      octet pour octet — la réduction est un point fixe, dans les deux voies.
//   2. Sur une page BRUTE synthétique, chargée de ce que la réduction doit retirer : le fichier
//      téléchargé est identique à ce que produit la voie en ligne de commande sur le même HTML,
//      et ne garde aucun secret connu.
//   3. Contre-épreuves : un candidat qui ne trouve plus le même élément, des classes `cct-`
//      (extension Conventional Comments active), une page qui interdit toute politique Trusted
//      Types — chaque fois, un refus et AUCUN téléchargement. Et sous `require-trusted-types-for`,
//      la politique propre au script permet bien la réduction.
//
// Ce qu'il ne dit PAS : que `javascript_tool` exécute le script comme `page.evaluate` (par le
// protocole de débogage, hors des politiques de la page). C'est à vérifier au premier usage réel ;
// le skill `plateforme` le dit.
//
// Usage : node scripts/check-page-reducer.mjs   (sélecteurs COMPILÉS : `npm run build` d'abord)

import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPageReducer, reduceAndVerify, reducePage, rulesFor } from './lib/captured-page-reducer.mjs';
import { loadReductionInputs } from './lib/captured-page-inputs.mjs';
import { findCapturedPageSecrets } from './lib/captured-page-secrets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADAPTERS = join(ROOT, 'packages', 'adapters');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();
const ORIGIN = 'https://captured.page.test';

// Ce que la réduction doit retirer, sous chacune de ses formes connues.
// Du texte de la page, qui ne doit apparaître dans aucun résumé rendu à l'agent.
const PAGE_TEXT = ['SENTINEL-TITLE-7f3a', 'ce nom ne dit pas'];

const RAW = `<!DOCTYPE html>
<html lang="en" data-auth-token="t0ken" style="x"><head><title>SENTINEL-TITLE-7f3a</title>
<meta name="request-id" content="r1"><meta name="release" content="v1">
<link rel="stylesheet" href="/a.css"><script nonce="n">var s = 1;</script><style>p{}</style>
</head><body>
<!-- commentaire -->
<div id="c" class="comment" data-testid="comment-body" data-session-id="S" nonce="n">
  <p>issue: ce nom ne dit pas ce qu'il contient</p>
  <a id="anchor" href="#issuecomment-1">permalien</a>
  <a id="signed" href="https://cdn.test/x?sig=abc#frag">fichier</a>
  <div data-load-url="comments?token=abc" data-deferred-content-url="/o/r/pull/1/threads/2?x=1"></div>
  <input type="hidden" name="authenticity_token" value="secret"><button type="submit" value="Comment">Comment</button>
  <svg class="octicon"><path d="M0 0"></path></svg>
  <template><form><input type="hidden" value="t"></form></template>
</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const failures = [];
const fail = (what) => failures.push(what);
/** Une ligne de progrès, imprimée seulement si la section n'a rien ajouté aux échecs : un garde
 * qui écrit « identique » au-dessus de son propre échec trompe qui lit vite. */
const section = (since, text) => {
  if (failures.length === since) console.log(text);
};

/** Sert `html` à une URL, avec l'en-tête CSP voulu, exécute le script de réduction dans la page
 * et rend `{ result, downloaded }` — `downloaded` nul si rien n'a été téléchargé. */
async function runInPage(html, script, csp) {
  return (await runAllInPage(html, [script], csp))[0];
}

/** Plusieurs scripts dans la MÊME page, l'un après l'autre — les captures successives d'états
 * ouverts sans recharger le document. */
async function runAllInPage(html, scripts, csp) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', (route) =>
    route.request().url() === `${ORIGIN}/page`
      ? route.fulfill({
          status: 200,
          // L'encodage dans l'EN-TÊTE, comme le sert une plateforme : la réduction retire le
          // `<meta charset>`, et sans lui Chromium lirait la page en windows-1252 (mesuré : « · »
          // devenait « Â· »).
          contentType: 'text/html; charset=utf-8',
          headers: csp ? { 'content-security-policy': csp } : {},
          body: html,
        })
      : route.abort()
  );
  try {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/page`, { waitUntil: 'domcontentloaded' });
    const runs = [];
    for (const script of scripts) {
      const download = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
      const result = await page.evaluate(script);
      const d = await download;
      const downloaded = d ? readFileSync(await d.path(), 'utf8') : null;
      const live = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
      runs.push({ result, downloaded, suggested: d?.suggestedFilename() ?? null, live });
      // Rien de la page dans AUCUN résumé, accepté ou refusé (revue Reefact, PR #135).
      for (const marker of PAGE_TEXT) {
        if (JSON.stringify(result).includes(marker)) fail(`le résumé rendu contient du texte de la page : « ${marker} »`);
      }
    }
    return runs;
  } finally {
    await context.close();
  }
}

/** La voie en ligne de commande, sur le même HTML : la vérification partagée, dans une page sans
 * JavaScript, par `DOMParser` — comme `reduce-captured-pages.mjs`. */
async function cliReduce(html, inputs) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    return await page.evaluate(
      ({ verifySource, reduceSource, args }) => {
        const reduce = new Function(`return (${reduceSource})`)();
        const verify = new Function(`return (${verifySource})`)();
        return verify({ ...args, reduce, parse: (t) => new DOMParser().parseFromString(t, 'text/html') }).out;
      },
      { verifySource: reduceAndVerify.toString(), reduceSource: reducePage.toString(), args: { html, ...inputs, mark: 'data-cct-reduce-id' } }
    );
  } finally {
    await context.close();
  }
}

try {
  // 1. Les captures du dépôt : le script de navigateur les rend à l'identique.
  let since = failures.length;
  let pages = 0;
  for (const id of readdirSync(ADAPTERS)) {
    const dir = join(ADAPTERS, id, 'test', 'fixtures', 'pages');
    if (!existsSync(dir)) continue;
    const inputs = await loadReductionInputs(ROOT, id);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
      const html = readFileSync(join(dir, file), 'utf8');
      const { result, downloaded, suggested } = await runInPage(html, buildPageReducer({ ...inputs, file }));
      pages++;
      if (!result?.ok) fail(`${id}/${file} : refusée — ${JSON.stringify(result?.problems)}`);
      else if (downloaded !== html) fail(`${id}/${file} : le fichier téléchargé diffère de la capture`);
      else if (suggested !== file) fail(`${id}/${file} : téléchargé sous « ${suggested} »`);
    }
  }
  section(since, `  ${pages} capture(s) : téléchargées à l'identique par le script de navigateur.`);

  // 2. Une page brute : même octets que la voie en ligne de commande, aucun secret connu.
  since = failures.length;
  const raw = { rules: rulesFor('github'), candidates: { anchor: ['#anchor'], body: ['[data-testid="comment-body"]'] }, reads: ['href'] };
  const run = await runInPage(RAW, buildPageReducer({ ...raw, file: '01-test-page-brute.html' }));
  if (!run.result?.ok || run.downloaded === null) fail(`page brute : refusée — ${JSON.stringify(run.result?.problems)}`);
  else {
    const cli = await cliReduce(run.live, raw);
    if (run.downloaded !== cli) fail('page brute : le script de navigateur et la ligne de commande divergent');
    const secrets = findCapturedPageSecrets(run.downloaded);
    if (secrets.length > 0) fail(`page brute : secret(s) restant(s) — ${secrets.map((s) => s.kind).join(', ')}`);
    for (const leak of ['t0ken', 'sig=abc', 'token=abc', 'var s = 1', 'request-id']) {
      if (run.downloaded.includes(leak)) fail(`page brute : « ${leak} » a survécu`);
    }
    if (JSON.stringify(run.result).includes('<')) fail('page brute : le résumé rendu contient du HTML');
  }
  section(since, '  page brute : identique à la voie en ligne de commande, sans secret.');

  // 3. Contre-épreuves : refus, et rien de téléchargé.
  since = failures.length;
  const refused = async (label, html, inputs, csp) => {
    const r = await runInPage(html, buildPageReducer({ ...inputs, file: '99-test-refus.html' }), csp);
    if (r.result?.ok !== false) fail(`${label} : accepté`);
    if (r.downloaded !== null) fail(`${label} : téléchargé malgré le refus`);
    return r.result?.problems ?? [];
  };
  await refused('écart avant/après', RAW, { ...raw, candidates: { session: ['[data-session-id]'] } });
  await refused('extension active', RAW.replace('class="comment"', 'class="comment cct-toolbar"'), raw);
  const tt = await refused('Trusted Types sans aucune politique', RAW, raw, "require-trusted-types-for 'script'; trusted-types 'none'");
  if (!tt.some((p) => p.startsWith('erreur'))) fail('Trusted Types sans aucune politique : refus sans erreur explicite');
  const withTt = await runInPage(RAW, buildPageReducer({ ...raw, file: '01-test-page-brute.html' }), "require-trusted-types-for 'script'");
  if (!withTt.result?.ok || withTt.downloaded !== run.downloaded) fail('sous Trusted Types, la politique du script ne permet pas la réduction');
  // Deux captures dans la même page, sous une politique nommée SANS 'allow-duplicates' : la
  // seconde retrouve la politique de la première (revue Codex, PR #135).
  const twice = await runAllInPage(
    RAW,
    [buildPageReducer({ ...raw, file: '01-test-page-brute.html' }), buildPageReducer({ ...raw, file: '02-test-page-brute.html' })],
    "require-trusted-types-for 'script'; trusted-types cct-reduce-capture"
  );
  if (!twice.every((t) => t.result?.ok && t.downloaded === run.downloaded)) {
    fail(`deux captures dans la même page sous Trusted Types : ${JSON.stringify(twice.map((t) => t.result))}`);
  }
  // Un secret connu dans le TEXTE survit à la liste blanche : refusé avant d'écrire, comme la
  // ligne de commande le refuse — son genre dit, sa valeur jamais (revue Codex, PR #135).
  const secretInText = RAW.replace('</body>', '<p>{"clientToken":"SECRET-VALUE-91"}</p></body>');
  const secretProblems = await refused('secret connu dans le texte', secretInText, raw);
  if (!secretProblems.some((p) => p.startsWith('secret connu restant'))) fail('secret connu dans le texte : refus sans le dire');
  if (JSON.stringify(secretProblems).includes('SECRET-VALUE-91')) fail('secret connu dans le texte : la valeur est dans le résumé');
  // Un exemple de code ÉCHAPPÉ qui montre une classe cct- n'est pas l'extension (revue Codex, PR #135).
  const example = await runInPage(
    RAW.replace('</body>', '<pre>&lt;div class="cct-toolbar"&gt;&lt;/div&gt;</pre></body>'),
    buildPageReducer({ ...raw, file: '01-test-exemple-echappe.html' })
  );
  if (!example.result?.ok || example.downloaded === null) fail(`exemple de code échappé : refusé — ${JSON.stringify(example.result?.problems)}`);
  section(
    since,
    '  contre-épreuves : écart, extension active, secret dans le texte, Trusted Types sans politique — refus sans téléchargement ;\n' +
      '  politique propre (deux captures dans la même page), exemple de code échappé : acceptés ; aucun texte de la page dans les résumés.'
  );
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error('\n✗ le script de navigateur ne fait pas ce que fait la ligne de commande :');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('\n✓ script de navigateur et ligne de commande : même réduction, mêmes refus.');
