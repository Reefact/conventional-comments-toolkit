// Ce que le SCRIPT DE CONTENU envoie et écrit — garde statique (§10).
//
// Deux règles, et chacune vient d'un défaut réellement livré, pas d'une précaution
// abstraite (revue Codex, PR #31) :
//
// 1. UNE REQUÊTE EMPORTE PLUS QUE SON CORPS. `PRIVACY.md` affirme que seuls les compteurs
//    listés quittent le navigateur ; sans `referrerPolicy`, l'URL complète de la page de
//    revue partait dans le `Referer`, et cette phrase était fausse. `npm run check:beacon`
//    le MESURE dans un vrai navigateur ; ce garde-ci vérifie que le code livré pose bien la
//    politique — sans quoi la mesure ne porterait que sur la sonde du test.
//
// 2. UNE CLÉ DE STOCKAGE ÉCRITE DEPUIS UN ONGLET EST UNE QUESTION DE CONCURRENCE. Deux
//    onglets écrivent la même clé ; un `set()` direct est un « dernier écrivain gagne » qui
//    efface l'autre. Ce dépôt a écrit DEUX files d'attente à un seul écrivain contre ce
//    hasard précis (background.ts, options.ts, PR #29) puis, quelques semaines plus tard,
//    a écrasé `selectorFailures` naïvement. La règle rend la question obligatoire : tout
//    `set()` du bundle de contenu passe par `storage.ts`, où elle est posée une fois.
//
// Ce garde ne lit PAS le bundle mais les sources : il désigne des fichiers à corriger.

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'packages', 'extension', 'src');

/** Le bundle du script de contenu (cf. packages/extension/build.mjs) : content.ts et tout
 * ce qu'il importe. `background.ts` et `options/` en sont exclus — ils s'exécutent dans un
 * contexte unique, où la concurrence entre onglets n'existe pas, et portent déjà leurs
 * propres files d'attente. */
const CONTENT_BUNDLE = new Set([
  'content.ts',
  'content-internal.ts',
  'editor-controller.ts',
  'config-resolver.ts',
  'host-platform.ts',
  'telemetry.ts',
  'guard.ts',
  'storage.ts',
]);

function isContentBundleFile(rel) {
  return CONTENT_BUNDLE.has(rel) || rel.startsWith('ui/');
}

function sources(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

const failures = [];

/** Le bloc d'options d'un `fetch(` — du `{` qui suit l'URL à son `}` apparié. */
function fetchOptionBlocks(text) {
  const blocks = [];
  const re = /\bfetch\s*\(/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const open = text.indexOf('{', match.index);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          blocks.push({ index: match.index, body: text.slice(open, i + 1) });
          break;
        }
      }
    }
  }
  return blocks;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

for (const file of sources(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/');
  const text = readFileSync(file, 'utf8');

  // Règle 1 — partout dans l'extension : une requête d'origine tierce déclare sa politique
  // de référent. `no-cors` est le marqueur de ce cas : on ne l'emploie que pour émettre
  // vers une origine qui ne nous répondra pas.
  for (const { index, body } of fetchOptionBlocks(text)) {
    if (!/mode\s*:\s*'no-cors'/.test(body)) continue;
    if (/referrerPolicy\s*:\s*'no-referrer'/.test(body)) continue;
    failures.push(
      `${rel}:${lineOf(text, index)} — fetch en \`no-cors\` sans \`referrerPolicy: 'no-referrer'\` : ` +
        `l'URL de la page partirait dans le Referer (mesuré par npm run check:beacon).`
    );
  }

  // Règle 2 — bundle du script de contenu seulement.
  if (!isContentBundleFile(rel) || rel === 'storage.ts') continue;
  // `?.` avant l'appel compte comme un appel : `storage?.local?.set?.(…)` est la forme
  // effectivement écrite dans ce dépôt, et une première version du motif la laissait passer.
  const re = /storage\??\.(local|sync)\??\.set\s*(?:\?\.)?\s*\(/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    failures.push(
      `${rel}:${lineOf(text, match.index)} — écriture directe \`storage.${match[1]}.set\` depuis le ` +
        `bundle de contenu : passer par src/storage.ts, où la question « deux onglets écrivent-ils ` +
        `cette clé ? » est posée une fois pour toutes.`
    );
  }
}

if (failures.length > 0) {
  console.error(`Sorties du script de contenu : ${failures.length} écart(s).\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Sorties du script de contenu : referer déclaré, écritures de stockage centralisées.");
