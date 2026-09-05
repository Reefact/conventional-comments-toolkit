// Mise en page du composeur (§5.1, §5.3) — MESURÉE dans un vrai Chromium.
//
// Ce que les tests happy-dom savent dire : « la classe est posée », « l'élément est enfant de
// tel autre ». Ce qu'ils ne savent PAS dire, faute de moteur de rendu : où un trait est peint,
// et si un conteneur le rogne. Toute cette page de réglages a été trouvée à l'œil, sur GitHub,
// après trois correctifs qui « devaient » marcher — d'où ce garde, qui mesure au lieu de croire.
//
// Les quatre affirmations tenues ici :
//   1. le trait d'état est rentré dans la boîte SEULEMENT quand un conteneur le rognerait ;
//   2. rentré, il tient dans ce conteneur — donc rien ne le coupe (contre-épreuve : sorti, il
//      déborde, ce qui EST le défaut observé sur `/pull/N/changes`) ;
//   3. le texte du champ garde sa gouttière, sinon il touche le trait (un « m » coupé, vu) ;
//   4. la barre d'outils n'a AUCUN retrait horizontal — elle a été déplacée une fois par erreur
//      pour aligner le texte, et il a fallu la remettre.
//
// Le DOM des deux fixtures est celui MESURÉ sur github.com (2026-09-04) : sur `…/changes`, le
// champ est gainé d'un conteneur Primer en `overflow: hidden` qui épouse sa boîte ; sur la vue
// héritée, rien ne le gaine.

import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(EXECUTABLE)) {
  console.error(`Chromium introuvable : ${EXECUTABLE}\nUne fois par machine :  npx playwright-core install chromium`);
  process.exit(1);
}

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: condition });
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// `ringIsClipped` tel qu'il est LIVRÉ, pas une réécriture.
const bundled = await build({
  stdin: {
    contents: `
      import { ringIsClipped } from './packages/extension/src/ui/stacking.ts';
      globalThis.cct = { ringIsClipped };
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'silent',
});

const css = readFileSync(resolve(root, 'packages/extension/src/styles.css'), 'utf8');
const BARRE = '<div class="cct-toolbar"><div class="cct-toolbar-row"><button class="cct-label-button">issue</button></div></div>';
const PASTILLE = '<div class="cct-feedback"><span class="cct-pastille">✅ Compliant</span></div>';

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage();
await page.setContent(`
  <style>
    body { font: 14px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; width: 700px; }
    /* La gaine mesurée sur la vue des fichiers modifiés : elle épouse le champ et coupe. */
    .gaine { display: inline-flex; overflow: hidden; width: 100%; }
    .gaine textarea { width: 100%; border: 0; padding: 8px; box-sizing: border-box; }
    ${css}
  </style>

  <!-- Vue héritée : l'extension pose son propre retrait, rien ne gaine le champ. -->
  <div class="cct-host" id="herite">
    ${BARRE}
    <textarea class="cct-editor cct-border-ok" id="champ-herite">m</textarea>
    ${PASTILLE}
  </div>

  <!-- Vue des fichiers modifiés : pas de cct-host, et une gaine qui coupe. -->
  <div id="changes">
    ${BARRE}
    <span class="gaine"><textarea class="cct-border-ok" id="champ-changes">m</textarea></span>
    ${PASTILLE}
  </div>
`);
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const m = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  // Ce que fait editor-controller.ts à l'attache, et rien d'autre.
  const rogne = {
    herite: globalThis.cct.ringIsClipped(q('#champ-herite')),
    changes: globalThis.cct.ringIsClipped(q('#champ-changes')),
  };
  if (rogne.changes) q('#champ-changes').classList.add('cct-ring-inset');
  if (rogne.herite) q('#champ-herite').classList.add('cct-ring-inset');

  const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const offset = (e) => parseFloat(getComputedStyle(e).outlineOffset);
  const champC = q('#champ-changes');
  const gaine = q('.gaine');

  return {
    rogne,
    offsetHerite: offset(q('#champ-herite')),
    offsetChanges: offset(champC),
    // Rectangle réellement peint par le trait : la boîte, gonflée du décalage (négatif ici).
    traitChanges: (() => { const r = rect(champC), o = offset(champC);
      return { l: r.l - o, r: r.r + o, t: r.t - o, b: r.b + o }; })(),
    gaineRect: rect(gaine),
    gouttiereHerite: parseFloat(getComputedStyle(q('#champ-herite')).paddingLeft),
    barreRetrait: parseFloat(getComputedStyle(q('#herite .cct-toolbar')).paddingLeft),
    ecartPastille: rect(q('#herite .cct-feedback')).t - rect(q('#champ-herite')).b,
  };
});

console.log('Mise en page du composeur — mesurée dans Chromium\n');

assert('la gaine de `…/changes` est reconnue comme rognante', m.rogne.changes === true);
assert('la vue héritée ne l’est pas', m.rogne.herite === false);
assert('le trait y reste donc dehors', m.offsetHerite === 0, `outline-offset ${m.offsetHerite}px`);
assert('et rentre dans la boîte sous la gaine', m.offsetChanges < 0, `outline-offset ${m.offsetChanges}px`);
assert(
  'rentré, le trait tient dans la gaine : rien ne le rogne',
  m.traitChanges.l >= m.gaineRect.l && m.traitChanges.r <= m.gaineRect.r,
  `trait [${m.traitChanges.l.toFixed(1)}, ${m.traitChanges.r.toFixed(1)}] dans [${m.gaineRect.l.toFixed(1)}, ${m.gaineRect.r.toFixed(1)}]`
);
// Contre-épreuve du défaut d'origine : sorti, le MÊME trait déborde la gaine.
const sorti = { l: m.traitChanges.l + 2 * m.offsetChanges, r: m.traitChanges.r - 2 * m.offsetChanges };
assert(
  'contre-épreuve : dehors, il déborderait — c’est le défaut observé',
  sorti.l < m.gaineRect.l || sorti.r > m.gaineRect.r,
  `il irait à [${sorti.l.toFixed(1)}, ${sorti.r.toFixed(1)}]`
);
assert('le texte garde sa gouttière (≥ 5px)', m.gouttiereHerite >= 5, `${m.gouttiereHerite}px`);
assert('la barre n’a aucun retrait horizontal', m.barreRetrait === 0, `${m.barreRetrait}px`);
assert('la pastille est 2 à 5 px sous le champ', m.ecartPastille >= 2 && m.ecartPastille <= 5, `${m.ecartPastille}px`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées.`);
process.exit(failed.length === 0 ? 0 : 1);
