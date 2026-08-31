// Garde du repo : chaque bundle de l'extension ne doit référencer que les API que son
// CONTEXTE D'EXÉCUTION expose réellement.
//
// Ce garde existe à cause d'un défaut livré en revue (PR #29) : `content-internal.ts`
// appelait `chrome.permissions.getAll()`. Or ce module est bundlé dans `content.js`, qui
// s'exécute comme SCRIPT DE CONTENU — un contexte où Chrome n'expose pas cette API. Le
// code ne levait pas : `chrome.permissions` y est simplement `undefined`, l'optional
// chaining rendait `undefined`, et la fonction résolvait des listes VIDES. En clair,
// l'extension ne s'activait sur aucun domaine d'entreprise, silencieusement.
//
// Rien ne l'a vu :
//   - le typage passait — `declare const chrome` décrit ce qu'on CROIT disponible ;
//   - les tests passaient — ils installaient un faux `chrome` complet, c'est-à-dire un
//     monde inventé où l'API existait ;
//   - la revue de code passait — l'appel est parfaitement plausible à la lecture.
// Seul le bundle produit, confronté à la liste de ce que le contexte expose, le montre.
//
// C'est un contrôle TEXTUEL sur l'artefact LIVRÉ, délibérément : c'est `dist-ext/` que le
// navigateur charge, pas les sources. Un jour où le bundler inline, renomme ou déplace du
// code, c'est encore le bundle qui fait foi.
//
// La liste d'API interdites ci-dessous est une AFFIRMATION SUR LE NAVIGATEUR, donc
// exactement le genre de chose que ce dépôt ne doit pas tenir de mémoire : elle est
// vérifiée contre un vrai Chromium par `spikes/mv3-smoke.mjs`, qui échoue si l'une d'elles
// s'avère en fait disponible. Le garde rapide ci-dessous et le test lent là-bas forment
// une paire : l'un contrôle le code, l'autre contrôle la prémisse de l'un.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'packages', 'extension', 'dist-ext');

/** Espaces de noms `chrome.*` que Chrome n'expose PAS aux scripts de contenu. Un script de
 * contenu ne voit qu'une poignée d'API (`storage`, `i18n`, `dom`, et un sous-ensemble de
 * `runtime`) ; tout le reste passe par un message au service worker. */
const FORBIDDEN_IN_CONTENT_SCRIPT = [
  'permissions',
  'tabs',
  'scripting',
  'windows',
  'management',
  'webRequest',
  'declarativeNetRequest',
  'cookies',
  'alarms',
  'action',
  'contextMenus',
];

/** Chaque bundle, avec ce qui lui est interdit et pourquoi. `background.js` (service
 * worker) et `options.js` (page d'extension) ont, eux, accès à tout ce que le manifeste
 * déclare : rien à interdire ici, mais l'entrée reste pour que l'ajout d'un bundle se
 * pose la question plutôt que de passer inaperçu. */
const BUNDLES = [
  {
    file: 'content.js',
    context: 'script de contenu',
    forbidden: FORBIDDEN_IN_CONTENT_SCRIPT,
  },
  { file: 'background.js', context: 'service worker', forbidden: [] },
  { file: 'options.js', context: "page d'options", forbidden: [] },
];

if (!existsSync(dist)) {
  console.error(
    `Bundle absent : ${dist}\nCe garde porte sur l'artefact livré — lancez d'abord :\n  npm run build:extension`
  );
  process.exit(1);
}

const violations = [];
for (const bundle of BUNDLES) {
  const path = join(dist, bundle.file);
  if (!existsSync(path)) {
    console.error(`Bundle attendu mais absent : ${path}`);
    process.exit(1);
  }
  const source = readFileSync(path, 'utf8');
  for (const api of bundle.forbidden) {
    // `chrome.permissions`, `chrome?.permissions`, `chrome!.permissions`, et la forme
    // indexée `chrome['permissions']` — un bundler peut produire l'une ou l'autre.
    const dotted = new RegExp(`chrome\\s*[?!]?\\s*\\.\\s*${api}\\b`);
    const indexed = new RegExp(`chrome\\s*[?!]?\\s*\\[\\s*['"\`]${api}['"\`]`);
    const line = source.split('\n').findIndex((l) => dotted.test(l) || indexed.test(l));
    if (line !== -1) {
      violations.push({ bundle: bundle.file, context: bundle.context, api, line: line + 1 });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `API indisponibles dans leur contexte d'exécution : ${violations.length} référence(s).\n` +
      violations
        .map(
          (v) =>
            `  - ${v.bundle}:${v.line} — chrome.${v.api} n'existe pas dans un ${v.context}`
        )
        .join('\n') +
      "\n\nCe n'est pas une erreur de typage : l'objet est `undefined` à l'exécution, donc\n" +
      "l'appel ne lève pas — il rend silencieusement une valeur vide. Faites porter cet\n" +
      'appel par le service worker, et transmettez le résultat par `chrome.storage` ou par\n' +
      'un message (voir `EXTRA_HOSTS_KEY` dans src/host-platform.ts pour le motif en place).'
  );
  process.exit(1);
}

const checked = BUNDLES.filter((b) => b.forbidden.length > 0)
  .map((b) => `${b.file} (${b.forbidden.length} API)`)
  .join(', ');
console.log(`Contextes d'exécution : aucune API hors contexte — ${checked} vérifié.`);
