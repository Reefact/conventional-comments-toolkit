// Smoke test de sélecteurs (§9.4) sur les pages CAPTURÉES de chaque plateforme, et la question
// qui le rend nécessaire : happy-dom répond-il comme un vrai navigateur ?
//
// Les tests sur pages réelles (`packages/adapters/<id>/test/real-pages.test.ts`) tournent dans
// happy-dom. Ce qu'ils affirment n'est vrai d'un navigateur que si happy-dom trouve, pour CHAQUE
// candidat de CHAQUE chaîne, exactement les éléments qu'y trouverait Chromium : un sélecteur
// mal implémenté — pseudo-classe, combinateur, attribut sensible à la casse — ferait passer un
// test sur un monde qui n'existe pas (CLAUDE.md, « un faux de test est une affirmation sur
// l'environnement »). Ce garde compte donc les deux, et refuse le moindre écart.
//
// Ce qu'il NE dit PAS : qu'une chaîne trouve quelque chose. Un zéro des deux côtés est
// concordant ; ce que la page DOIT porter, ce sont les tests sur pages réelles qui le disent,
// état par état. Ce qu'il ne dit pas non plus : que la page servie AUJOURD'HUI ressemble encore
// à la capture — c'est le rôle du canari en ligne (`check:github-selectors-live`).
//
// Usage : node scripts/check-captured-selectors.mjs [id…]   (défaut : toutes les plateformes
// qui ont des pages capturées). Lit les sélecteurs COMPILÉS : `npm run build` d'abord.

import { chromium } from 'playwright-core';
import { Window } from 'happy-dom';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** Comptes par candidat, dans happy-dom — de la même façon que les tests : `DOMParser`, qui
 * n'exécute aucun script et ne charge aucune ressource. */
function happyDomCounts(html, selectors) {
  const window = new Window();
  try {
    const doc = new window.DOMParser().parseFromString(html, 'text/html');
    const counts = {};
    for (const [key, chain] of Object.entries(selectors)) {
      counts[key] = chain.candidates.map((c) => {
        try {
          return doc.querySelectorAll(c).length;
        } catch (err) {
          return `erreur : ${err.message}`;
        }
      });
    }
    return counts;
  } finally {
    window.happyDOM.abort();
    window.close();
  }
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
// JavaScript coupé et réseau refusé : la capture est déjà la page RENDUE, et la rejouer la
// réécrirait sous nos yeux. Les deux moteurs lisent ainsi le même arbre.
const context = await browser.newContext({ javaScriptEnabled: false });
await context.route('**/*', (route) => route.abort());
const mismatches = [];
let compared = 0;
try {
  for (const id of ids) {
    const url = pathToFileURL(join(ADAPTERS, id, 'dist', 'selectors.js')).href;
    const { selectors } = await import(url);
    for (const file of capturedPages(id)) {
      const html = readFileSync(file, 'utf8');
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const expected = happyDomCounts(html, selectors);
      // `querySelectorAll` dans la page, et non `page.locator()` : le moteur de Playwright a sa
      // propre syntaxe et traverse les racines fantômes, ce que l'adaptateur ne fait pas. On
      // compare ce que l'adaptateur verrait, pas ce que verrait un outil de test.
      const inChromium = await page.evaluate((all) => {
        const out = {};
        for (const [key, candidates] of Object.entries(all)) {
          out[key] = candidates.map((c) => {
            try {
              return document.querySelectorAll(c).length;
            } catch (err) {
              return `erreur : ${err.message}`;
            }
          });
        }
        return out;
      }, Object.fromEntries(Object.entries(selectors).map(([k, c]) => [k, c.candidates])));
      for (const [key, chain] of Object.entries(selectors)) {
        for (const [i, candidate] of chain.candidates.entries()) {
          compared++;
          if (inChromium[key][i] !== expected[key][i]) {
            mismatches.push(
              `${relative(ROOT, file)} · ${chain.name} · ${candidate} : Chromium ${inChromium[key][i]}, happy-dom ${expected[key][i]}`
            );
          }
        }
      }
      await page.close();
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
console.log(`\n✓ happy-dom et Chromium concordent : ${compared} comptes (${ids.join(', ')}).`);
