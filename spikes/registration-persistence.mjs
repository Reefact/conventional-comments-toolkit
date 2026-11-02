// Persistance de l'inscription du script de contenu à travers un REDÉMARRAGE du navigateur (#118).
//
// Le défaut : sur github.com, l'extension ne faisait plus rien — ni badge, ni bandeau, ni garde
// d'envoi (§5.4) — après chaque redémarrage de Chrome, jusqu'à l'ouverture de la page d'options.
// Deux comportements du navigateur se combinaient, qu'aucun faux `chrome` ne peut établir :
//
//   1. `updateContentScripts` sans `persistAcrossSessions` fait passer l'inscription à `false`
//      (`registerContentScripts` sans le champ la laisse à `true`), et une inscription à `false`
//      disparaît au redémarrage ;
//   2. sans écouteur `runtime.onStartup`, le service worker ne démarre PAS au lancement du
//      navigateur : rien ne repose l'inscription perdue.
//
// Ce fichier mesure donc deux choses, et sort en code non nul à la première fausse :
//
//   A. LES PRÉMISSES, sur deux extensions minimales que le fichier écrit lui-même — ce que
//      Chromium fait d'une inscription selon l'appel et le champ, et quand il démarre un worker.
//      `test/background.test.ts` en tient un faux (`restartBrowser`) : ces mesures en sont la
//      source, et le jour où Chromium change, c'est ici que ça se voit.
//   B. LE PRODUIT, sur l'extension EMPAQUETÉE (`packages/extension/dist-ext`) : la séquence
//      relevée dans l'archive de l'owner — inscription, changement d'étiquette, redémarrage —,
//      puis une page servie chargée au lancement suivant doit recevoir le script, et le journal
//      d'inscription doit montrer chacune des deux moitiés du correctif à l'œuvre.
//
// LE PIÈGE QUI A FAIT RATER LA PREMIÈRE MESURE, et que ce fichier contourne : une extension
// chargée par `--load-extension` est RÉINSTALLÉE à chaque lancement (`onInstalled`, raison
// `install`), ce qui efface toutes ses inscriptions dynamiques, persistantes ou non. Un
// redémarrage mesuré ainsi mesure le harnais, pas Chrome. Or l'extension s'installe chez ses
// utilisateurs par « Load unpacked » (`docs/extension-setup-en.md`), qui n'est pas réinstallé au
// lancement. Le premier lancement charge donc par `--load-extension`, puis l'entrée du profil est
// réécrite en extension non empaquetée (emplacement 8 → 4, mode développeur), et le second
// lancement se fait SANS `--load-extension`. Cette réécriture est une affirmation sur le format du
// profil : elle est contrôlée à chaque exécution (aucune réinstallation, extension active), et le
// fichier échoue si elle ne tient plus.
//
// CE QU'IL NE PEUT PAS VÉRIFIER : une installation depuis le Chrome Web Store, et un
// redémarrage avec restauration de session (onglets rouverts au lancement). Le premier n'a pas
// de chemin local ; le second est couvert par l'injection dans les onglets ouverts que fait la
// passe de démarrage (`spikes/open-tab-injection.mjs`), pas par ce fichier.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGED = resolve(here, '..', 'packages', 'extension', 'dist-ext');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();
const PORT = 8746;
const ORIGIN = `http://127.0.0.1:${PORT}`;

if (!existsSync(PACKAGED)) {
  console.error(`Bundle absent : ${PACKAGED}\nLancez d'abord :  npm run build && npm run build:extension`);
  process.exit(1);
}

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: condition });
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(probe, { timeoutMs = 15000, everyMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await sleep(everyMs);
  }
}

const work = mkdtempSync(join(tmpdir(), 'cct-persist-'));

// --- Les deux extensions minimales -------------------------------------------------------

/** Journal sérialisé dans `storage.local` : deux écritures concurrentes en perdraient une. */
const LOGGER = `
let queue = Promise.resolve();
function log(event) {
  queue = queue
    .then(() => chrome.storage.local.get({ log: [] }))
    .then(({ log }) => chrome.storage.local.set({ log: [...log, event] }));
  return queue;
}
log('worker-start');
chrome.runtime.onInstalled.addListener((d) => log('installed:' + d.reason));
`;

/** Une page de l'extension qui LIT sans démarrer le worker — mesuré : l'ouvrir ne le démarre pas. */
const PROBE_JS = `(async () => {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const { log } = await chrome.storage.local.get({ log: [] });
  document.documentElement.setAttribute('data-result', JSON.stringify({ scripts, log }));
})();`;

function writeMinimal(dir, name, background) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name,
      version: '1.0.0',
      background: { service_worker: 'bg.js' },
      permissions: ['scripting', 'storage'],
      host_permissions: ['http://127.0.0.1/*'],
    })
  );
  writeFileSync(join(dir, 'bg.js'), LOGGER + background);
  writeFileSync(join(dir, 'probe.html'), '<!doctype html><title>probe</title><script src="probe.js"></script>');
  writeFileSync(join(dir, 'probe.js'), PROBE_JS);
  for (const id of ['a', 'b', 'c']) {
    writeFileSync(join(dir, `cs-${id}.js`), `document.documentElement.setAttribute('data-spike-${id}', '1');`);
  }
}

// `premises` : SANS écouteur onStartup. Trois inscriptions, chacune par un chemin :
//   a — register seul ; b — register puis update SANS le champ (ce que faisait le worker) ;
//   c — register puis update AVEC persistAcrossSessions: true (le correctif).
const PREMISES = join(work, 'premises');
writeMinimal(
  PREMISES,
  'cct persist premises',
  `
globalThis.spikeSetup = async (origin) => {
  const base = (id) => ({ id, matches: [origin + '/' + id + '/*'], js: ['cs-' + id + '.js'], runAt: 'document_idle' });
  await chrome.scripting.registerContentScripts([base('a'), base('b'), base('c')]);
  await chrome.scripting.updateContentScripts([base('b')]);
  await chrome.scripting.updateContentScripts([{ ...base('c'), persistAcrossSessions: true }]);
  return chrome.scripting.getRegisteredContentScripts();
};
`
);
// `startup` : identique, plus un écouteur onStartup — la seule différence entre les deux.
const STARTUP = join(work, 'startup');
writeMinimal(STARTUP, 'cct persist startup', `chrome.runtime.onStartup.addListener(() => log('startup'));\n`);

// --- L'extension empaquetée, avec un hôte local accordé ----------------------------------

// Une permission d'hôte OPTIONNELLE exige un geste de l'utilisateur ; le manifeste de la COPIE
// la déclare donc d'office, comme le fait `spikes/open-tab-injection.mjs`. Le reste du bundle est
// celui qui est livré.
const PRODUCT = join(work, 'product');
cpSync(PACKAGED, PRODUCT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(PRODUCT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
writeFileSync(join(PRODUCT, 'manifest.json'), JSON.stringify(manifest));

// --- Pages locales -----------------------------------------------------------------------

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>${req.url}</title><p>page`);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// --- Lancements ----------------------------------------------------------------------------

const PROFILE = join(work, 'profile');
const ALL = [PREMISES, STARTUP, PRODUCT];
const BASE_ARGS = ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'];

async function launch(loadFromCommandLine) {
  const args = [...BASE_ARGS];
  if (loadFromCommandLine) {
    args.push(`--disable-extensions-except=${ALL.join(',')}`, `--load-extension=${ALL.join(',')}`);
  }
  // Playwright passe `--disable-extensions` par défaut : sans `--load-extension` pour le
  // contredire, aucune extension du profil ne se chargerait.
  return chromium.launchPersistentContext(PROFILE, {
    executablePath: EXECUTABLE,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args,
  });
}

/** L'identifiant de chaque extension, par le nom de son manifeste lu dans son worker — le profil
 * n'écrit ses `Preferences` qu'à la fermeture du navigateur. */
async function extensionIds(context) {
  const byName = Object.fromEntries(
    ALL.map((dir) => [JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).name, dir])
  );
  const ids = {};
  for (const worker of context.serviceWorkers()) {
    const name = await worker.evaluate(() => chrome.runtime.getManifest().name);
    if (byName[name]) ids[byName[name]] = new URL(worker.url()).host;
  }
  return ids;
}

/** « Load unpacked » : emplacement 4 au lieu de 8 (ligne de commande), mode développeur. Le
 * HMAC qui protège `extensions` ne couvre plus l'entrée réécrite ; Chrome le recalcule. */
function rewriteAsUnpacked() {
  const file = join(PROFILE, 'Default', 'Preferences');
  const prefs = JSON.parse(readFileSync(file, 'utf8'));
  for (const entry of Object.values(prefs.extensions.settings)) if (entry.location === 8) entry.location = 4;
  prefs.extensions.ui = { ...(prefs.extensions.ui ?? {}), developer_mode: true };
  delete prefs.protection?.macs?.extensions;
  writeFileSync(file, JSON.stringify(prefs));
}

async function workerOf(context, id, timeoutMs = 15000) {
  return waitFor(() => context.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${id}/`)) ?? null, {
    timeoutMs,
  });
}

async function probe(context, id) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/probe.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-result'), null, { timeout: 5000 });
  const result = JSON.parse(await page.evaluate(() => document.documentElement.getAttribute('data-result')));
  await page.close();
  return result;
}

/** Le script de contenu de l'extension `id` est-il dans la page ? Le monde isolé d'un script de
 * contenu n'est pas atteignable par Playwright, mais il crée un contexte d'exécution dont
 * l'origine est celle de l'extension — ce que liste le menu des contextes de DevTools, où #118
 * a été observé. */
async function hasContentScriptContext(context, url, id) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const origins = new Set();
  cdp.on('Runtime.executionContextCreated', ({ context: c }) => origins.add(c.origin));
  await cdp.send('Runtime.enable');
  await page.goto(url);
  const found = await waitFor(() => origins.has(`chrome-extension://${id}`), { timeoutMs: 5000 });
  await page.close();
  return found === true;
}

const registrationLogOf = (worker) =>
  worker.evaluate(() => chrome.storage.local.get('registrationLog').then((items) => items.registrationLog ?? []));

let failed = false;
let context = null;
try {
  // ===== Lancement 1 : installation, inscriptions =====
  console.log('Lancement 1 — installation et inscriptions');
  context = await launch(true);
  // Chaque worker démarre à l'installation ; on attend les trois avant de lire le profil.
  await waitFor(() => context.serviceWorkers().length >= ALL.length);
  const ids = await extensionIds(context);
  assert('les trois extensions sont installées', ALL.every((dir) => ids[dir]), JSON.stringify(ids));

  const premisesWorker = await workerOf(context, ids[PREMISES]);
  const setup = await premisesWorker.evaluate((origin) => globalThis.spikeSetup(origin), ORIGIN);
  const persist = Object.fromEntries(setup.map((s) => [s.id, s.persistAcrossSessions]));
  assert('register sans le champ → persistAcrossSessions: true', persist.a === true, JSON.stringify(persist));
  assert('update SANS le champ → persistAcrossSessions: false', persist.b === false);
  assert('update AVEC persistAcrossSessions: true → true', persist.c === true);

  // Le produit : la séquence de l'archive de l'owner. L'étiquette pose l'inscription
  // (`register`), une seconde écriture des étiquettes la met à jour (`update`).
  const productWorker = await workerOf(context, ids[PRODUCT]);
  await productWorker.evaluate(() => chrome.storage.local.set({ hostPlatforms: { '127.0.0.1': 'github' } }));
  await waitFor(async () => (await registrationLogOf(productWorker)).some((e) => e.calls.some((c) => c.op === 'register')));
  await productWorker.evaluate(() =>
    chrome.storage.local.set({ hostPlatforms: { '127.0.0.1': 'github', 'spike.invalid': 'github' } })
  );
  const updated = await waitFor(async () =>
    (await registrationLogOf(productWorker)).find((e) => e.calls.some((c) => c.op === 'update'))
  );
  assert(
    'produit : le changement d’étiquette met l’inscription à jour, et elle reste persistante',
    updated?.after?.present === true && updated?.after?.persist === true,
    JSON.stringify(updated?.after ?? null)
  );
  assert(
    'produit : une page servie reçoit le script avant le redémarrage',
    await hasContentScriptContext(context, `${ORIGIN}/served/`, ids[PRODUCT])
  );
  await context.close();
  context = null;

  // ===== Lancement 2 : le navigateur redémarre, extensions installées comme « Load unpacked » =====
  rewriteAsUnpacked();
  console.log('Lancement 2 — redémarrage, sans --load-extension');
  const restartedAt = new Date().toISOString();
  context = await launch(false);

  // Le produit d'abord, avant que quoi que ce soit d'autre ne touche au navigateur : une page
  // servie, chargée au lancement, doit recevoir le script — c'est le symptôme de #118.
  assert(
    'produit : une page servie reçoit le script au lancement suivant',
    await hasContentScriptContext(context, `${ORIGIN}/served-after-restart/`, ids[PRODUCT])
  );

  // Les prémisses. Laisser au navigateur le temps de démarrer ce qu'il démarre de lui-même.
  await sleep(6000);
  const premises = await probe(context, ids[PREMISES]);
  const startup = await probe(context, ids[STARTUP]);
  assert(
    'harnais : aucune extension n’a été réinstallée au second lancement',
    !premises.log.slice(2).some((e) => e.startsWith('installed')) && !startup.log.slice(2).some((e) => e.startsWith('installed')),
    JSON.stringify({ premises: premises.log, startup: startup.log })
  );
  const kept = premises.scripts.map((s) => s.id).sort();
  assert('après redémarrage, l’inscription passée à false a disparu, les deux à true restent', kept.join() === 'a,c', JSON.stringify(kept));
  const injected = {};
  for (const id of ['a', 'b', 'c']) {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/${id}/`);
    injected[id] = Boolean(
      await waitFor(() => page.evaluate((k) => document.documentElement.hasAttribute(`data-spike-${k}`), id), {
        timeoutMs: 2000,
      })
    );
    await page.close();
  }
  assert('et l’injection suit : a et c injectés, b non', injected.a && !injected.b && injected.c, JSON.stringify(injected));
  const starts = (log) => log.filter((e) => e === 'worker-start').length;
  assert('sans écouteur onStartup, le worker ne démarre PAS au lancement', starts(premises.log) === 1, JSON.stringify(premises.log));
  assert(
    'avec un écouteur onStartup, il démarre au lancement, et l’événement lui parvient',
    starts(startup.log) === 2 && startup.log.includes('startup'),
    JSON.stringify(startup.log)
  );

  // Le produit, moitié par moitié. L'état que le redémarrage a laissé se lit de deux façons :
  // la première passe d'inscription du second lancement l'a relu AVANT de reposer quoi que ce
  // soit (`before`) ; et si aucune passe n'a couru — pas de worker —, l'inscription telle qu'elle
  // est, lue depuis une page de l'extension, EST cet état. Rien ici ne réveille le worker exprès :
  // c'est précisément ce que la moitié `onStartup` doit faire seule.
  const worker2 = await workerOf(context, ids[PRODUCT], 2000);
  assert('produit : le worker tourne après le lancement, sans rien ouvrir', worker2 !== null);
  const extPage = await context.newPage();
  await extPage.goto(`chrome-extension://${ids[PRODUCT]}/manifest.json`);
  const live = await extPage.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  const after = (
    await extPage.evaluate(() => chrome.storage.local.get('registrationLog').then((i) => i.registrationLog ?? []))
  ).filter((e) => e.at >= restartedAt);
  await extPage.close();
  const ours = live.find((script) => script.id === 'cct-hosts');
  const survived = after[0]?.before ?? { present: ours !== undefined, persist: ours?.persistAcrossSessions ?? null };
  assert(
    'produit : l’inscription a survécu au redémarrage (persistAcrossSessions)',
    survived.present === true && survived.persist === true,
    JSON.stringify({ ...survived, readFrom: after[0] ? 'first pass after restart' : 'live registration' })
  );
  assert(
    'produit : le lancement du navigateur a déclenché une passe (runtime.onStartup)',
    after.some((e) => e.cause === 'browser-start'),
    JSON.stringify(after.map((e) => e.cause))
  );
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await context?.close().catch(() => {});
  server.close();
  rmSync(work, { recursive: true, force: true });
}

const ko = results.filter((r) => !r.ok);
console.log(`\n${results.length - ko.length}/${results.length} vérifications passées.`);
process.exit(failed || ko.length > 0 ? 1 : 0);
