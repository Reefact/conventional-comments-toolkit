// Aucun sélecteur ne cherche ce que la réduction des pages capturées retire.
//
// Les pages capturées se stockent RÉDUITES (`scripts/lib/captured-page-reducer.mjs`) : la page
// brute est perdue. Un candidat qui cite un attribut ou un élément que la réduction ne garde pas
// ne trouve donc rien sur les captures — et une assertion négative (« Cancel n'est pas pris »)
// y passe À TORT, dans un monde que la réduction a fabriqué. Ce garde le refuse, sans page et
// sans navigateur, à la lecture du sélecteur ; et de même pour les attributs que le code de
// l'adaptateur lit par `getAttribute`/`hasAttribute`.
//
// Ce qu'il NE voit PAS : une valeur retirée parce qu'elle avait la forme d'un secret (un `data-*`
// opaque). Celle-là ne se voit qu'avec la page brute, à la réduction
// (`scripts/reduce-captured-pages.mjs`). Un candidat refusé ici se règle de deux façons : il
// cherche autre chose, ou la liste blanche s'élargit (PLATFORM_RULES) — et l'on recapture.
//
// Usage : node scripts/check-reduced-selectors.mjs   (sélecteurs COMPILÉS : `npm run build` d'abord)

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rulesFor, unreachableAttributeReads, unreachableByReduction } from './lib/captured-page-reducer.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ADAPTERS = join(ROOT, 'packages', 'adapters');

// La contre-épreuve d'abord : un garde qui laisse passer ceux-là ne prouve rien ailleurs.
const COUNTER_PROOF = ['link[rel="stylesheet"]', '[nonce]', 'meta[name="request-id"]', 'input[value="x"]'];
const inert = COUNTER_PROOF.filter((s) => unreachableByReduction(s, rulesFor('github')).length === 0);
if (inert.length > 0) {
  console.error(`✗ garde inerte : ${inert.join(', ')} passe(nt) alors que la réduction le(s) retire.`);
  process.exit(1);
}

const problems = [];
let checked = 0;
for (const id of readdirSync(ADAPTERS)) {
  const compiled = join(ADAPTERS, id, 'dist', 'selectors.js');
  if (!existsSync(compiled)) continue; // `shared` n'a pas de sélecteurs
  const rules = rulesFor(id);
  const { selectors } = await import(pathToFileURL(compiled).href);
  for (const [key, chain] of Object.entries(selectors)) {
    for (const candidate of chain.candidates) {
      checked++;
      for (const reason of unreachableByReduction(candidate, rules)) {
        problems.push(`${id} · ${key} ${JSON.stringify(candidate)} — ${reason}`);
      }
    }
  }
  const src = join(ADAPTERS, id, 'src');
  for (const file of readdirSync(src).filter((f) => f.endsWith('.ts'))) {
    for (const name of unreachableAttributeReads(readFileSync(join(src, file), 'utf8'), rules)) {
      problems.push(`${id} · src/${file} lit l'attribut « ${name} », que la réduction retire`);
    }
  }
}

if (problems.length > 0) {
  console.error('✗ ces sélecteurs ou lectures cherchent ce que la réduction des captures retire :');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nChercher autre chose, ou élargir PLATFORM_RULES (scripts/lib/captured-page-reducer.mjs) et recapturer.');
  process.exit(1);
}
console.log(`✓ ${checked} candidats : aucun ne cherche ce que la réduction retire (contre-épreuve vue).`);
