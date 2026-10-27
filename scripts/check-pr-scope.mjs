// Garde du repo : une PR touche UNE plateforme, OU le code partagé — jamais les deux. La règle
// et ses raisons vivent dans `lib/pr-scope.mjs` ; ce fichier ne fait que lire le diff.
//
// Usage : `node scripts/check-pr-scope.mjs [base] [head]` — par défaut `origin/main` et `HEAD`.
// Le diff est pris à TROIS points (`base...head`) : ce que la branche apporte depuis qu'elle a
// quitté la base, et non ce que la base a reçu depuis, qui n'est pas l'affaire de la PR.
//
// Les plateformes sont DÉRIVÉES des dossiers de `packages/adapters/`, jamais écrites ici : un
// adaptateur GitLab sera couvert sans qu'on touche au garde. Elles sont lues dans les arbres de
// la base ET de la tête, pas dans la copie de travail : un adaptateur supprimé reste une
// plateforme, dont les fichiers supprimés sont classés comme tels.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { platformIds, prScopeVerdict } from './lib/pr-scope.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [base = 'origin/main', head = 'HEAD'] = process.argv.slice(2);

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const adapterDirs = (rev) =>
  git('ls-tree', '-d', '--name-only', rev, 'packages/adapters/').split('\n').filter(Boolean);
const ids = platformIds(adapterDirs(base), adapterDirs(head));

// `--no-renames` : un déplacement apparaît comme une suppression et un ajout, si bien que ses
// DEUX extrémités sont classées — déplacer un fichier partagé dans un adaptateur touche le
// partagé.
const out = git('diff', '--name-status', '--no-renames', `${base}...${head}`);
const files = out
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split('\t');
    return { path, added: status === 'A' };
  });

const verdict = prScopeVerdict(files, ids);
const label = {
  neutral: 'documentation, tests ou outillage seulement',
  shared: 'code partagé seulement',
  platform: `plateforme ${verdict.platforms.join(', ')} seulement`,
  'new-platform': `création de la plateforme ${verdict.platforms[0]}`,
  contract: 'PR de contrat : code partagé et toutes les plateformes',
  mixed: `${verdict.platforms.join(', ')}${verdict.shared.length ? ' et code partagé' : ''}`,
}[verdict.kind];

console.log(`Périmètre de ${base}...${head} (${files.length} fichier(s)) : ${label}.`);
if (verdict.ok) process.exit(0);

console.error('\nPérimètre refusé :');
for (const r of verdict.reasons) console.error(`  - ${r}`);
for (const p of verdict.platforms) {
  console.error(`\n  ${p} :`);
  for (const f of verdict.groups[`platform:${p}`]) console.error(`    ${f}`);
}
if (verdict.shared.length) {
  console.error('\n  partagé :');
  for (const f of verdict.shared) console.error(`    ${f}`);
}
console.error(
  '\nScinder la PR : le changement du code partagé d’abord, seul, puis celui de la plateforme.'
);
process.exit(1);
