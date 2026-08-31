// Fumée MV3 (§9.4) — l'extension EMPAQUETÉE, chargée dans un vrai Chromium.
//
// Pourquoi ce fichier existe : quatre défauts consécutifs livrés en revue sur la PR #29
// avaient tous la même forme — « le navigateur ne se comporte pas comme le code le
// suppose » —, et aucun test unitaire ne pouvait les voir. Ils testent le code contre des
// faux `chrome` écrits par la même personne qui a écrit le code : le faux encode la
// croyance, le test la confirme. Un faux exposait `chrome.permissions` à un script de
// contenu, contexte où Chrome ne l'expose pas ; la répartition des hôtes y était donc
// TOUJOURS vide en production, sans une erreur ni un test rouge.
//
// Ce que ce fichier vérifie n'est donc pas « le code fait ce qu'il dit », mais « le
// navigateur est bien celui que le code suppose ». Il s'arrête à la première assertion
// fausse, et sort en code non nul.
//
// CE QU'IL NE PEUT PAS VÉRIFIER, et il faut le dire plutôt que le laisser croire : le
// monde isolé d'un script de contenu n'est pas atteignable ici. `chrome.scripting
// .executeScript` exige une permission d'hôte sur la cible, et le manifeste n'en déclare
// aucune de façon statique depuis la PR #28 (`content_scripts` suffit à l'injection, mais
// pas à l'exécution programmatique). La surface d'API réellement offerte à un script de
// contenu reste donc contrôlée statiquement, sur le bundle, par
// `scripts/check-context-apis.mjs`. Ce fichier-ci en vérifie la PRÉMISSE, côté service
// worker.

import { chromium } from 'playwright-core';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const EXTENSION = resolve(here, '..', 'packages', 'extension', 'dist-ext');
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(EXTENSION)) {
  console.error(`Bundle absent : ${EXTENSION}\nLancez d'abord :  npm run build:extension`);
  process.exit(1);
}

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: condition });
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Le service worker met plusieurs secondes à démarrer à froid, et une SONDE UNIQUE ment :
 * la première version de ce fichier concluait « chrome.permissions absent » puis
 * « répartition jamais publiée », deux fois à tort, faute d'attendre. D'où cette attente
 * active partout où l'on observe un effet asynchrone. */
async function waitFor(probe, { timeoutMs = 15000, everyMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

const profile = mkdtempSync(join(tmpdir(), 'cct-mv3-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: EXECUTABLE,
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--no-sandbox',
  ],
});

try {
  console.log("Fumée MV3 — l'extension empaquetée dans un vrai Chromium\n");

  // 1. L'extension se charge, et son service worker démarre. Sans cela, rien d'autre du
  //    produit n'a de sens : un manifeste invalide échouerait ici, et nulle part ailleurs.
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  assert('le service worker de l’extension démarre', Boolean(worker), worker?.url());
  if (!worker) throw new Error('service worker absent : le reste des assertions est sans objet');

  const ready = await waitFor(() =>
    worker.evaluate(() => typeof chrome?.permissions?.getAll === 'function').catch(() => false)
  );

  // 2. LA PRÉMISSE DE TOUTE L'ARCHITECTURE : `chrome.permissions` est exposé au service
  //    worker. C'est ce qui justifie que le croisement origines × étiquettes vive là-bas
  //    plutôt que dans le script de contenu (cf. src/host-platform.ts).
  assert('le service worker voit chrome.permissions (§2)', Boolean(ready));

  // 3. La contrepartie : les API que `scripts/check-context-apis.mjs` interdit au bundle du
  //    script de contenu doivent être ABSENTES de ce contexte. Ce garde-là est rapide mais
  //    repose sur une liste écrite à la main ; si Chrome venait à exposer l'une d'elles aux
  //    scripts de contenu, la liste deviendrait fausse sans que rien ne le signale. On ne
  //    peut pas interroger un monde isolé ici (voir l'en-tête), mais on peut au moins
  //    vérifier que ces API existent bien côté worker : une entrée qui n'existe NULLE PART
  //    est une entrée périmée, à retirer de la liste plutôt qu'à traîner comme un totem.
  const workerSurface = await worker.evaluate(() =>
    ['permissions', 'tabs', 'scripting', 'storage', 'runtime'].reduce(
      (acc, name) => ({ ...acc, [name]: typeof chrome?.[name] === 'object' }),
      {}
    )
  );
  assert(
    'les API réservées au worker y sont bien présentes',
    workerSurface.permissions && workerSurface.tabs && workerSurface.scripting,
    JSON.stringify(workerSurface)
  );

  // 4. Le worker publie la répartition des hôtes au démarrage — c'est cette valeur, et elle
  //    seule, que le script de contenu peut lire. Sa PRÉSENCE est ce que la P1 livrée
  //    rendait impossible.
  const published = await waitFor(
    () =>
      worker
        .evaluate(
          () =>
            new Promise((res) =>
              chrome.storage.local.get(['extraHostsByPlatform'], (i) =>
                res(i.extraHostsByPlatform ?? null)
              )
            )
        )
        .catch(() => null),
    { timeoutMs: 20000 }
  );
  assert(
    'le worker publie extraHostsByPlatform dans storage.local',
    published !== null && Array.isArray(published.github) && Array.isArray(published.azdo),
    JSON.stringify(published)
  );

  // 5. La page d'options se charge, et son sélecteur de plateforme n'a AUCUNE valeur par
  //    défaut. Un `<option>` pré-sélectionné y étiquetait un domaine Azure DevOps en
  //    « github » sans que personne ne l'ait choisi (PR #29) : c'est une régression qui se
  //    voit dans le HTML rendu, pas dans le code.
  const optionsUrl = `${worker.url().replace(/\/background\.js$/, '')}/options.html`;
  const page = await context.newPage();
  await page.goto(optionsUrl, { waitUntil: 'load' });
  const options = await page.evaluate(() => ({
    platform: document.getElementById('host-platform')?.value ?? '(sélecteur absent)',
    hasHostInput: Boolean(document.getElementById('host-input')),
  }));
  assert(
    'la page d’options n’impose aucune plateforme par défaut',
    options.platform === '' && options.hasHostInput,
    `valeur du sélecteur : "${options.platform}"`
  );

  // 6. Le RELAIS de configuration d'organisation répond. C'est la prémisse du correctif du
  //    `configUrl` : un script de contenu reste soumis au CORS de sa page (doc Chrome) et
  //    ne peut pas lire un document hébergé hors de la plateforme affichée ; il passe donc
  //    par `chrome.runtime.sendMessage` et le worker lit à sa place.
  //
  //    Ce qui se vérifie ici est le PROTOCOLE — le listener renvoie bien `true` et répond
  //    de façon asynchrone, et la réponse arrive — sous les deux formes de `sendMessage`,
  //    parce que la documentation de Chrome ne dit PAS laquelle est disponible ici : elle
  //    décrit la forme promesse sans se prononcer sur le devenir du rappel. `relayOrgConfig
  //    Read()` gère donc les deux, et cette assertion dit laquelle a effectivement répondu
  //    plutôt que de le supposer.
  //
  //    CE QUE CE N'EST PAS : une vérification du CORS. La page d'options est une page
  //    d'extension, pas un script de contenu ; le monde isolé reste inatteignable ici (voir
  //    l'en-tête). L'URL sondée n'est désignée par aucun plancher — le worker doit donc la
  //    refuser sans la lire, ce qui teste aussi ce contrôle-là, et sans toucher au réseau.
  const probeUrl = 'https://relay-probe.invalid/organisation.json';
  const relay = await page.evaluate(async (url) => {
    const withCallback = await new Promise((res) => {
      const timer = setTimeout(() => res({ answered: false }), 8000);
      try {
        chrome.runtime.sendMessage({ kind: 'cct-fetch-config', url }, (response) => {
          void chrome.runtime.lastError;
          clearTimeout(timer);
          res({ answered: true, status: response?.status ?? null });
        });
      } catch (e) {
        clearTimeout(timer);
        res({ answered: false, threw: String(e) });
      }
    });
    let withPromise = { answered: false };
    try {
      const returned = chrome.runtime.sendMessage({ kind: 'cct-fetch-config', url });
      if (returned && typeof returned.then === 'function') {
        const response = await returned;
        withPromise = { answered: true, status: response?.status ?? null };
      }
    } catch (e) {
      withPromise = { answered: false, threw: String(e) };
    }
    return { withCallback, withPromise };
  }, probeUrl);
  assert(
    'le relais cct-fetch-config répond, et refuse une URL qu’aucun plancher ne désigne',
    (relay.withCallback.answered && relay.withCallback.status === 'unreachable') ||
      (relay.withPromise.answered && relay.withPromise.status === 'unreachable'),
    JSON.stringify(relay)
  );
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} assertions vérifiées dans un vrai MV3.`
);
if (failed.length > 0) {
  console.error(`\nÉchecs :\n${failed.map((f) => `  - ${f.name}`).join('\n')}`);
  process.exit(1);
}
