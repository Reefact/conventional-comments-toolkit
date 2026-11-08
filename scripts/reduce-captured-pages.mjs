import { fileURLToPath } from 'node:url';
// Réduit EN PLACE les pages capturées d'une plateforme à leur forme stockable
// (`scripts/lib/captured-page-reducer.mjs` dit ce qu'elle garde, et pourquoi une liste blanche).
//
// Usage : node scripts/reduce-captured-pages.mjs <id> [--check] [--no-selectors]
//   (pages de packages/adapters/<id>/test/fixtures/pages/ ; sélecteurs COMPILÉS : `npm run
//   build` d'abord.)
//   --check : n'écrit rien, et échoue si une page n'est pas DÉJÀ sous sa forme réduite — ce que
//   doit vérifier qui reçoit des captures (la réduction est un point fixe).
//   --no-selectors : réduire SANS comparaison, pour une plateforme qui n'a pas encore de
//   `selectors.ts`. Refusé si elle en a un. Sans ce drapeau, des sélecteurs introuvables ou
//   illisibles font ÉCHOUER l'outil : la première version avertissait et écrivait quand même,
//   si bien qu'un build oublié livrait des pages sans la comparaison promise (revue Reefact,
//   PR #133).
//
// Se lance sur la machine de qui a capturé, AVANT tout envoi : c'est le seul moment où la page
// brute existe, donc le seul où l'on peut prouver que la réduction n'a rien retiré qu'un
// sélecteur lise. Pour chaque page, et avant d'écrire quoi que ce soit :
//   1. chaque candidat de `selectors.ts` doit trouver les MÊMES éléments avant et après —
//      l'identité, par un marqueur posé sur la page brute, pas le nombre —, et sur chacun les
//      MÊMES valeurs des attributs que l'adaptateur lit par `getAttribute`. L'identité seule
//      laissait passer `href="#issue-1"` réécrit en `/#issue-1` : même élément, autre ancre de
//      fil (revue Codex, PR #133) ;
//   2. réduire la page réduite doit la rendre à l'identique : une réduction qui n'est pas un
//      point fixe dirait autre chose à chaque passage.
// Une page qui échoue à l'un des deux n'est PAS réécrite : elle reste brute, sur cette machine,
// pour qu'on voie ce qui manque — et ne doit pas partir.
//
// Le tout dans Chromium, JavaScript coupé et réseau refusé, par `DOMParser` comme les tests.

import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describeMismatch, reduceAndVerify, reducePage, reductionMismatches } from './lib/captured-page-reducer.mjs';
import { InputsError, loadReductionInputs } from './lib/captured-page-inputs.mjs';
import { findCapturedPageSecrets } from './lib/captured-page-secrets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();
const MARK = 'data-cct-reduce-id';

const check = process.argv.includes('--check');
const noSelectors = process.argv.includes('--no-selectors');
const id = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!id) {
  console.error('Usage : node scripts/reduce-captured-pages.mjs <id> [--check] [--no-selectors]   (github, azdo…)');
  process.exit(2);
}
const dir = join(ROOT, 'packages', 'adapters', id, 'test', 'fixtures', 'pages');
let files = [];
try {
  if (statSync(dir).isDirectory()) files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
} catch {
  // pas de dossier : rien à réduire
}
if (files.length === 0) {
  console.log(`Aucune page dans ${relative(ROOT, dir)} : rien à réduire.`);
  process.exit(0);
}

let inputs;
try {
  inputs = await loadReductionInputs(ROOT, id, { noSelectors });
} catch (err) {
  if (!(err instanceof InputsError)) throw err;
  console.error(err.message);
  process.exit(err.exitCode);
}
const { rules, candidates, reads } = inputs;
if (!candidates) {
  console.log(`⚠ « ${id} » n'a pas de selectors.ts : réduction SANS comparaison avant/après (--no-selectors).`);
}

/** Exécutée dans la page : la vérification PARTAGÉE avec le script de navigateur
 * (`reduceAndVerify`), reçue en source avec `reducePage` — toutes deux autonomes. */
function inPage({ verifySource, reduceSource, args }) {
  const reduce = new Function(`return (${reduceSource})`)();
  const verify = new Function(`return (${verifySource})`)();
  const parse = (text) => new DOMParser().parseFromString(text, 'text/html');
  return verify({ ...args, reduce, parse });
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const context = await browser.newContext({ javaScriptEnabled: false });
await context.route('**/*', (route) => route.abort());
const page = await context.newPage();

let failed = 0;
try {
  for (const file of files) {
    const path = join(dir, file);
    const html = readFileSync(path, 'utf8');
    const r = await page.evaluate(inPage, {
      verifySource: reduceAndVerify.toString(),
      reduceSource: reducePage.toString(),
      args: { html, rules, candidates, reads, mark: MARK },
    });
    const problems = [];
    if (candidates) {
      for (const m of reductionMismatches(candidates, r.before, r.after)) {
        problems.push(describeMismatch(m));
      }
    }
    if (!r.fixedPoint) problems.push('la page réduite, réduite à nouveau, ne revient pas à l’identique');
    for (const s of findCapturedPageSecrets(r.out)) problems.push(`secret connu restant : ${s.kind}`);
    if (check && r.out !== html) problems.push('pas sous sa forme réduite : la réduire la changerait');
    if (problems.length > 0) {
      failed++;
      console.log(`✗ ${file} — ${check ? 'refusée' : 'NON réécrite'} :`);
      for (const p of problems) console.log(`    ${p}`);
      continue;
    }
    if (check) {
      console.log(`✓ ${file} : déjà réduite`);
      continue;
    }
    writeFileSync(path, r.out);
    const top = Object.entries(r.dropped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ');
    const mo = (s) => (s.length / 1e6).toFixed(2);
    console.log(`✓ ${file} : ${mo(html)} Mo → ${mo(r.out)} Mo${top ? ` (retirés : ${top}…)` : ''}`);
  }
} finally {
  await browser.close();
}

if (failed > 0) {
  console.log(`\n✗ ${failed} page(s) non réduite(s) : elles sont encore BRUTES, et ne doivent pas partir.`);
  process.exit(1);
}
if (check) {
  console.log(`\n✓ ${files.length} page(s) déjà sous leur forme réduite.`);
  process.exit(0);
}
console.log(
  `\n✓ ${files.length} page(s) réduite(s).` +
    (candidates
      ? ' Chaque candidat trouve les mêmes éléments avant et après, et les mêmes valeurs lues.'
      : ' SANS comparaison avant/après (--no-selectors) : elle se fera quand les sélecteurs existeront.') +
    '\n  Ensuite : node scripts/check-captured-pages.mjs --audit, puis node scripts/check-captured-pages.mjs.'
);
