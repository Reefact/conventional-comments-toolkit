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
// Quatre faits sont mesurés ici, dont deux conditionnent le correctif :
//   A. un onglet déjà ouvert ne reçoit PAS le script enregistré ;
//   B. un onglet ouvert ensuite le reçoit — l'enregistrement lui-même est bien correct ;
//   C. `tabs.query({url})` filtre SANS la permission `tabs`, la permission d'hôte suffisant ;
//   D. `executeScript` atteint l'onglet déjà ouvert.
// C et D disent que rattraper les onglets ouverts ne coûte aucune permission nouvelle.
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
    host_permissions: [`http://127.0.0.1:${PORT}/*`],
    background: { service_worker: 'bg.js' },
  })
);
writeFileSync(join(ext, 'bg.js'), 'self.__ready = true;\n');
writeFileSync(join(ext, 'cs.js'), 'document.title = "INJECTED:" + document.title;\n');

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<title>page</title><body>hello</body>');
}).listen(PORT);

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
} finally {
  await context.close();
  server.close();
  rmSync(ext, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées`);
if (failed.length > 0) {
  console.error(`\nÉchec : ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
