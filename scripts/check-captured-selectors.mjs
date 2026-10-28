// Smoke test de sélecteurs (§9.4) sur les pages CAPTURÉES de chaque plateforme, et la question
// qui le rend nécessaire : happy-dom trouve-t-il les MÊMES éléments qu'un vrai navigateur ?
//
// Les tests sur pages réelles (`packages/adapters/<id>/test/real-pages.test.ts`) tournent dans
// happy-dom. Ce qu'ils affirment n'est vrai d'un navigateur que si happy-dom trouve, pour CHAQUE
// candidat de CHAQUE chaîne, exactement les éléments qu'y trouverait Chromium. Mesuré : il ne
// connaît ni `:enabled`, ni `:any-link`, ni `:placeholder-shown`, et tient pour `:empty` tout
// élément sans enfant ÉLÉMENT, texte compris. Un candidat de ce genre ferait passer un test sur
// un monde qui n'existe pas (CLAUDE.md, « un faux de test est une affirmation sur
// l'environnement »). Ce garde compare donc l'identité de chaque élément trouvé, des deux côtés
// (scripts/lib/selector-parity.mjs dit pourquoi pas seulement leur nombre).
//
// Ce qu'il NE dit PAS : qu'une chaîne trouve quelque chose. Un vide des deux côtés est
// concordant ; ce que la page DOIT porter, ce sont les tests sur pages réelles qui le disent,
// état par état. Ni que la page servie AUJOURD'HUI ressemble encore à la capture — c'est le rôle
// du canari en ligne (`check:github-selectors-live`).
//
// Usage : node scripts/check-captured-selectors.mjs [id…]   (défaut : toutes les plateformes
// qui ont des pages capturées). Lit les sélecteurs COMPILÉS : `npm run build` d'abord.

import { chromium } from 'playwright-core';
import { Window } from 'happy-dom';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COUNTER_PROOF, matchPaths, parityMismatches } from './lib/selector-parity.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ADAPTERS = join(ROOT, 'packages', 'adapters');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();

function capturedPages(id) {
  const dir = join(ADAPTERS, id, 'test', 'fixtures', 'pages');
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => join(dir, f));
}

const requested = process.argv.slice(2);
const ids = (requested.length > 0 ? requested : readdirSync(ADAPTERS)).filter((id) => capturedPages(id).length > 0);
if (ids.length === 0) {
  console.log('Aucune page capturée (packages/adapters/<id>/test/fixtures/pages/) : rien à comparer.');
  process.exit(0);
}

/** Le relevé de happy-dom, de la même façon que les tests : `DOMParser`, qui n'exécute aucun
 * script et ne charge aucune ressource. */
function inHappyDom(html, candidates) {
  const window = new Window();
  try {
    return matchPaths(new window.DOMParser().parseFromString(html, 'text/html'), candidates);
  } finally {
    window.happyDOM.abort();
    window.close();
  }
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
// JavaScript coupé et réseau refusé : la capture est déjà la page RENDUE, et la rejouer la
// réécrirait sous nos yeux. `page.evaluate` s'exécute malgré tout, dans un monde à part.
const context = await browser.newContext({ javaScriptEnabled: false });
await context.route('**/*', (route) => route.abort());

/** Le relevé de Chromium : `querySelectorAll` dans la page, et non `page.locator()`, dont le
 * moteur a sa propre syntaxe et traverse les racines fantômes — ce que l'adaptateur ne fait pas. */
async function inChromium(html, candidates) {
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(
      ({ source, candidates }) => new Function(`return (${source})`)()(document, candidates),
      { source: matchPaths.toString(), candidates }
    );
  } finally {
    await page.close();
  }
}

const mismatches = [];
let compared = 0;
try {
  // La contre-épreuve d'abord : un garde qui ne voit pas cet écart-là ne prouve rien ailleurs.
  const proof = parityMismatches(
    COUNTER_PROOF.candidates,
    await inChromium(COUNTER_PROOF.html, COUNTER_PROOF.candidates),
    inHappyDom(COUNTER_PROOF.html, COUNTER_PROOF.candidates)
  );
  if (proof.length === 0) {
    console.error(
      '✗ garde inerte : la contre-épreuve (même nombre, éléments différents) ne produit aucun écart.'
    );
    process.exit(1);
  }
  console.log('  contre-épreuve : un écart de même cardinalité est bien détecté.');

  for (const id of ids) {
    const { selectors } = await import(pathToFileURL(join(ADAPTERS, id, 'dist', 'selectors.js')).href);
    const candidates = Object.fromEntries(Object.entries(selectors).map(([k, c]) => [k, c.candidates]));
    for (const file of capturedPages(id)) {
      const html = readFileSync(file, 'utf8');
      const found = parityMismatches(candidates, await inChromium(html, candidates), inHappyDom(html, candidates));
      compared += Object.values(candidates).flat().length;
      for (const m of found) {
        const count = (v) => (Array.isArray(v) ? `${v.length} élément(s)` : v);
        mismatches.push(
          `${relative(ROOT, file)} · ${selectors[m.key].name} · ${m.candidate} : ` +
            `Chromium ${count(m.left)}, happy-dom ${count(m.right)}` +
            (m.firstDiff ? `, premier écart au chemin ${m.firstDiff}` : '')
        );
      }
      console.log(`  ${relative(ROOT, file)}`);
    }
  }
} finally {
  await browser.close();
}

if (mismatches.length > 0) {
  console.error(`\n✗ happy-dom et Chromium ne trouvent pas les mêmes éléments (${mismatches.length} écart(s)) :\n`);
  for (const m of mismatches) console.error(`  ${m}`);
  console.error(
    '\nLes tests sur pages réelles tournent dans happy-dom : sur ces candidats, ils ne disent rien' +
      " d'un navigateur. Choisir un candidat que les deux évaluent de la même façon."
  );
  process.exit(1);
}
console.log(`\n✓ happy-dom et Chromium trouvent les mêmes éléments : ${compared} candidats comparés (${ids.join(', ')}).`);
