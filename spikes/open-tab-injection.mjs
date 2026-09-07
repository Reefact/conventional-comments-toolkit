// Ce qu'un ENREGISTREMENT DYNAMIQUE atteint — mesuré, jamais rappelé (§9.4).
//
// `chrome.scripting.registerContentScripts()` ne s'applique qu'aux chargements SUIVANTS :
// un document déjà chargé ne reçoit rien. Cette phrase est le genre d'affirmation sur le
// navigateur que ce dépôt ne s'autorise plus à écrire de mémoire — d'où ce fichier.
//
// L'enjeu n'est pas un cas de bord : c'est le parcours principal du produit. On arrive sur
// la page d'options depuis un onglet de plateforme, par l'icône de la barre d'outils ;
// « Activer » accorde la permission et enregistre le script ; et c'est précisément
// l'onglet d'origine qui restait inerte jusqu'à un rechargement. Aucun test unitaire ne
// pouvait le voir : un faux `chrome.scripting` fait ce qu'on lui dit de faire, et dira
// toujours que l'enregistrement a réussi.
//
// Six faits sont mesurés ici, chacun conditionnant une partie du correctif :
//   A. un onglet déjà ouvert ne reçoit PAS le script enregistré ;
//   B. un onglet ouvert ensuite le reçoit — l'enregistrement lui-même est bien correct ;
//   C. `tabs.query({url})` filtre SANS la permission `tabs`, la permission d'hôte suffisant ;
//   D. `executeScript` atteint l'onglet déjà ouvert.
// C et D disent que rattraper les onglets ouverts ne coûte aucune permission nouvelle.
//
// Les deux derniers portent sur la RÉPÉTITION du rattrapage, qui a lieu à chaque réveil du
// service worker et à chaque republication des hôtes :
//   E. `insertCSS` n'est PAS idempotente — trois insertions identiques demandent trois
//      `removeCSS` pour disparaître, donc un onglet de longue vie accumulait une copie de
//      la feuille par réveil. Le marqueur du script de contenu ne protège que `bootstrap()` ;
//   F. `executeScript({func})` partage le MONDE ISOLÉ du script de contenu, donc lit ce
//      marqueur — ce qui permet de demander « cet onglet l'a-t-il déjà ? » sans rien
//      injecter, et de ne rattraper que les documents qui en ont besoin.
// E dit pourquoi le rattrapage doit être conditionnel ; F dit avec quoi le conditionner.
//
// CE QU'IL NE VÉRIFIE PAS : l'idempotence du script de contenu lui-même, quand les deux
// chemins d'injection visent le même document. Elle vit dans le monde isolé du script, que
// cette sonde n'atteint pas plus que `mv3-smoke.mjs` ; c'est
// `packages/extension/test/content-entry.test.ts` qui la mesure, sur le point d'entrée.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8741;
/** Une seconde origine, couverte par la permission d'hôte mais JAMAIS par l'enregistrement :
 * elle donne un onglet dont on sait qu'il n'a pas le script, sans quoi la mesure F ne
 * pourrait pas montrer que la sonde distingue — seulement qu'elle s'exécute. */
const PORT_HORS = 8744;
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// Extension SONDE, et non l'extension livrée : ce qui est mesuré est une RÈGLE du
// navigateur, indépendante du produit. Une sonde permet d'observer l'injection par un effet
// trivial (le titre du document) plutôt qu'en cherchant à atteindre le monde isolé du vrai
// script de contenu, que Playwright ne voit pas. `host_permissions` est ici statique parce
// que la question posée ne porte pas sur la façon dont la permission est arrivée.
const ext = mkdtempSync(join(tmpdir(), 'cct-opentab-ext-'));
writeFileSync(
  join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'cct open-tab probe',
    version: '1.0.0',
    permissions: ['scripting'], // PAS `tabs` : c'est le fait C.
    host_permissions: [`http://127.0.0.1:${PORT}/*`, `http://127.0.0.1:${PORT_HORS}/*`],
    background: { service_worker: 'bg.js' },
  })
);
writeFileSync(join(ext, 'bg.js'), 'self.__ready = true;\n');
// Le faux script de contenu pose le même marqueur que le vrai, dans le même monde isolé :
// c'est ce que la mesure F interroge.
writeFileSync(
  join(ext, 'cs.js'),
  'document.title = "INJECTED:" + document.title;\nglobalThis.__cctContentScriptLoaded = true;\n'
);
// Une règle dont l'effet se LIT depuis la page : `document.styleSheets` n'expose pas les
// feuilles posées par `insertCSS`, une première version de cette mesure y avait vu 0 avant
// comme après et n'aurait rien conclu du tout.
writeFileSync(join(ext, 'sheet.css'), 'body { color: rgb(1, 2, 3); }\n');

function serve(port) {
  return createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>page</title><body>hello</body>');
  }).listen(port);
}
const server = serve(PORT);
const serverHors = serve(PORT_HORS);

const profile = mkdtempSync(join(tmpdir(), 'cct-opentab-prof-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: EXECUTABLE,
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
});

/** Le service worker démarre à froid, et l'injection est asynchrone : une sonde unique
 * mentirait dans les deux sens. */
async function waitFor(probe, { timeoutMs = 10000, everyMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

try {
  console.log("Injection dans les onglets déjà ouverts — règles mesurées dans un vrai Chromium\n");

  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  assert('le service worker de la sonde démarre', Boolean(worker), worker?.url());
  if (!worker) throw new Error('pas de service worker');

  // L'onglet est ouvert AVANT tout enregistrement : c'est la situation du parcours réel.
  const opened = await context.newPage();
  await opened.goto(`http://127.0.0.1:${PORT}/`);
  const before = await opened.title();
  assert("l'onglet ouvert avant l'enregistrement n'est pas injecté", before === 'page', before);

  const registered = await worker.evaluate(async (port) => {
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: 'probe',
          matches: [`http://127.0.0.1:${port}/*`],
          js: ['cs.js'],
          runAt: 'document_idle',
        },
      ]);
      return 'ok';
    } catch (error) {
      return `THREW: ${error.message}`;
    }
  }, PORT);
  assert("l'enregistrement dynamique réussit", registered === 'ok', registered);

  // A. Attente ACTIVE d'un changement qui ne doit pas venir : conclure « pas injecté » sur
  //    une sonde immédiate serait conclure trop tôt. Le fait mesuré est qu'après ce délai,
  //    et alors que B montre l'enregistrement actif, le titre n'a toujours pas bougé.
  const changed = await waitFor(async () => (await opened.title()) !== 'page', { timeoutMs: 3000 });
  const afterRegister = await opened.title();
  assert(
    'A. un enregistrement dynamique n’atteint PAS un onglet déjà chargé',
    changed === null && afterRegister === 'page',
    afterRegister
  );

  // B. Contre-épreuve indispensable : sans elle, A passerait aussi bien si l'enregistrement
  //    n'avait rien enregistré du tout, et le fichier ne prouverait rien.
  const fresh = await context.newPage();
  await fresh.goto(`http://127.0.0.1:${PORT}/`);
  const freshTitle = await waitFor(async () => {
    const t = await fresh.title();
    return t.startsWith('INJECTED:') ? t : null;
  });
  assert(
    'B. un onglet ouvert APRÈS l’enregistrement, lui, reçoit le script',
    freshTitle === 'INJECTED:page',
    freshTitle ?? (await fresh.title())
  );

  // C. Le filtre `url` de tabs.query est documenté comme exigeant la permission `tabs` OU
  //    une permission d'hôte sur les onglets visés. La sonde ne déclare pas `tabs` : ce qui
  //    passe ici ne peut passer que par la permission d'hôte.
  const queried = await worker.evaluate(async (port) => {
    try {
      const tabs = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
      return { n: tabs.length, withUrl: tabs.every((t) => typeof t.url === 'string') };
    } catch (error) {
      return `THREW: ${error.message}`;
    }
  }, PORT);
  assert(
    'C. tabs.query({url}) filtre sans la permission `tabs` (permission d’hôte)',
    typeof queried === 'object' && queried.n === 2 && queried.withUrl,
    JSON.stringify(queried)
  );

  // D. Le rattrapage lui-même.
  const executed = await worker.evaluate(async (port) => {
    const tabs = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
    const target = tabs.find((t) => t.title === 'page') ?? tabs[0];
    try {
      await chrome.scripting.executeScript({ target: { tabId: target.id }, files: ['cs.js'] });
      return 'ok';
    } catch (error) {
      return `THREW: ${error.message}`;
    }
  }, PORT);
  const caught = await waitFor(async () => {
    const t = await opened.title();
    return t.startsWith('INJECTED:') ? t : null;
  });
  assert(
    'D. executeScript atteint l’onglet déjà ouvert',
    executed === 'ok' && caught === 'INJECTED:page',
    `${executed} / ${caught ?? (await opened.title())}`
  );
  // E. La répétition. `insertCSS` a un pendant `removeCSS` : si trois insertions
  //    identiques ne se défont pas d'un seul retrait, c'est qu'il y en a bien trois.
  const cssStack = await worker.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
    const color = () =>
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, func: () => getComputedStyle(document.body).color })
        .then((r) => r[0].result);
    const base = await color();
    for (let i = 0; i < 3; i += 1) {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['sheet.css'] });
    }
    const applied = await color();
    await chrome.scripting.removeCSS({ target: { tabId: tab.id }, files: ['sheet.css'] });
    const afterOne = await color();
    await chrome.scripting.removeCSS({ target: { tabId: tab.id }, files: ['sheet.css'] });
    await chrome.scripting.removeCSS({ target: { tabId: tab.id }, files: ['sheet.css'] });
    return { base, applied, afterOne, afterThree: await color() };
  }, PORT);
  assert(
    'E. insertCSS s’EMPILE — trois insertions demandent trois removeCSS',
    cssStack.base === 'rgb(0, 0, 0)' &&
      cssStack.applied === 'rgb(1, 2, 3)' &&
      cssStack.afterOne === 'rgb(1, 2, 3)' &&
      cssStack.afterThree === 'rgb(0, 0, 0)',
    JSON.stringify(cssStack)
  );

  // F. De quoi rendre le rattrapage conditionnel. Les DEUX réponses comptent : un `true`
  //    partout dirait seulement que la sonde s'exécute, pas qu'elle distingue quoi que ce
  //    soit.
  const horsPage = await context.newPage();
  await horsPage.goto(`http://127.0.0.1:${PORT_HORS}/`);
  const worlds = await worker.evaluate(async ([servi, hors]) => {
    const probe = async (pattern) => {
      const [tab] = await chrome.tabs.query({ url: pattern });
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => globalThis.__cctContentScriptLoaded === true,
      });
      return result;
    };
    return {
      servi: await probe(`http://127.0.0.1:${servi}/*`),
      hors: await probe(`http://127.0.0.1:${hors}/*`),
    };
  }, [PORT, PORT_HORS]);
  assert(
    'F. executeScript({func}) lit le marqueur du script de contenu, et DISTINGUE',
    worlds.servi === true && worlds.hors === false,
    JSON.stringify(worlds)
  );
} finally {
  await context.close();
  server.close();
  serverHors.close();
  rmSync(ext, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées`);
if (failed.length > 0) {
  console.error(`\nÉchec : ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
