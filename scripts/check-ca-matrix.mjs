// Garde-fou de la règle du chantier (CLAUDE.md, §11) : « tout critère d'acceptation
// raisonnablement automatisable est couvert par un test qui cite son identifiant ; la
// correspondance vit dans docs/ca-matrix.md ». Trois vérifications, dans cet ordre :
//
//   1. la matrice couvre tous les CA de la spécification (§11) ;
//   2. chaque identifiant listé apparaît littéralement dans au moins un test — c'est ce
//      qui rend la matrice vérifiable plutôt que déclarative ;
//   3. chaque fichier de test nommé par la matrice existe — une ligne qui renvoie à un
//      fichier renommé ment plus qu'elle n'informe.
//
// Usage : node scripts/check-ca-matrix.mjs   (sort 1 si la matrice a divergé du code)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MATRIX = join(ROOT, 'docs/ca-matrix.md');
const SPEC = join(ROOT, 'specifications-fr.md');
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'dist-ext', '.git', 'coverage']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const allFiles = [...walk(join(ROOT, 'packages')), ...walk(join(ROOT, 'tests'))];
const testFiles = allFiles.filter((f) => f.endsWith('.test.ts') && !f.includes('/dist'));
const testSources = new Map(testFiles.map((f) => [f, readFileSync(f, 'utf8')]));

const matrix = readFileSync(MATRIX, 'utf8');
// La spécification est la référence : les CA qu'elle énonce au §11 sont ceux à couvrir.
const specIds = [...new Set([...readFileSync(SPEC, 'utf8').matchAll(/`(CA-\d{2})`/g)].map((m) => m[1]))].sort();
const rowIds = new Set([...matrix.matchAll(/^\|\s*(CA-\d{2})\s*\|/gm)].map((m) => m[1]));

const problems = [];

for (const id of specIds) {
  if (!rowIds.has(id)) problems.push(`${id} : énoncé au §11 de la spécification, absent de docs/ca-matrix.md`);
}

for (const id of [...rowIds].sort()) {
  const citedIn = testFiles.filter((f) => testSources.get(f).includes(id));
  if (citedIn.length === 0) {
    problems.push(`${id} : listé dans la matrice mais cité par aucun test (grep "${id}" dans packages/*/test, tests/)`);
  }
}

// Fichiers de test nommés dans les cellules : jetons entre accents graves finissant par
// .test.ts, résolus par suffixe de chemin — la matrice les écrit relativement à packages/.
const named = new Set([...matrix.matchAll(/`([^`]*\.test\.ts)`/g)].map((m) => m[1]));
for (const token of [...named].sort()) {
  const exists = testFiles.some((f) => relative(ROOT, f).endsWith(token));
  if (!exists) problems.push(`fichier nommé par la matrice introuvable : ${token}`);
}

if (problems.length > 0) {
  console.error(`✗ la matrice des CA a divergé du code (${problems.length} problème(s)) :\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `✓ matrice des CA cohérente — ${specIds.length} critères de la spécification, ` +
    `${rowIds.size} lignes, ${named.size} fichiers de test nommés, tous cités et présents`
);
