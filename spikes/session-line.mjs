// En-tête et marqueur de session (§3.6, §5.5) — rendu MESURÉ dans un vrai Chromium.
//
// Ce que happy-dom ne sait pas dire : où les lignes sont peintes. La demande (Reefact, #163) est
// géométrique : un commentaire écrit avec des lignes blanches entre préfixe, corps et marqueur,
// et le même écrit d'un bloc, se rendent À L'IDENTIQUE — sujet, corps et mention aux mêmes
// positions —, chaque séparation valant un écart de paragraphe.
//
// Contrôle DIFFÉRENTIEL : sans les variables d'écart posées par badges.ts, les deux écritures
// doivent différer — sinon la comparaison ne prouverait rien.
//
// Le style de plateforme (marge de paragraphe de 16 px, dernière marge nulle) est une
// APPROXIMATION de github.com ; les assertions portent sur des rapports à l'écart normal MESURÉ
// sur la même page, pas sur des pixels absolus.

import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();

if (!existsSync(EXECUTABLE)) {
  console.error(`Chromium introuvable : ${EXECUTABLE}\nUne fois par machine :  npx playwright-core install chromium`);
  process.exit(1);
}

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: condition });
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// `decorateComment` tel qu'il est LIVRÉ, sur la forme de corps que GitHub déclare.
const bundled = await build({
  stdin: {
    contents: `
      import { decorateComment } from './packages/extension/src/ui/badges.ts';
      import { GITHUB_BODY_SHAPE } from '@cct/adapter-github';
      import { commentBodyText } from '@cct/adapter-shared';
      import { defaultConfig } from '@cct/core';
      globalThis.cct = { decorateComment, defaultConfig, GITHUB_BODY_SHAPE, commentBodyText };
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

// Les deux écritures de la demande (Reefact, #163), telles qu'un rendu Markdown les produit :
// - « aérée » : lignes blanches (espaces compris) autour de chaque bloc — le rendu n'en garde
//   aucune trace, chaque bloc devient un paragraphe ;
// - « serrée » : tout d'un bloc, chaque fin de ligne simple devient un `<br>`.
// Elles doivent se rendre à l'identique, en-tête comme pied.
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin vel justo a quam scelerisque fringilla. Nam congue mattis egestas. Sed eu porta enim. In luctus justo lobortis imperdiet laoreet.';
const CASES = {
  spaced: `<p dir="auto">reviewed: blah-blah-blah</p>\n<p dir="auto">${LOREM}</p>\n<p dir="auto">[session:some-session-id]</p>`,
  tight: `<p dir="auto">reviewed: blah-blah-blah<br>\n${LOREM}<br>\n[session:some-session-id]</p>`,
};

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head><style>
  body { font: 14px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; width: 600px; }
  .markdown-body { padding: 8px; }
  .markdown-body p { margin: 0 0 16px; }
  .markdown-body > *:last-child { margin-bottom: 0; }
  ${css}
</style></head><body>
  ${Object.entries(CASES).map(([id, html]) => `<div class="markdown-body" id="${id}">${html}</div>`).join('\n')}
  <script>${bundled.outputFiles[0].text}</script>
</body></html>`);

/** Positions, relatives au haut du corps, de ce que le lecteur voit : la ligne de l'en-tête, la
 * première et la dernière ligne du texte, la mention. Mesure DIFFÉRENTIELLE : avec `undo`, les
 * deux variables d'écart sont retirées — l'état d'avant la demande, dont les deux écritures
 * doivent alors différer, sans quoi la comparaison ne prouverait rien. */
async function measure(undo) {
  return page.evaluate((undo) => {
    const out = {};
    for (const el of document.querySelectorAll('.markdown-body')) {
      if (!el.querySelector('.cct-session')) {
        cct.decorateComment(el, cct.commentBodyText(el), cct.defaultConfig(), { id: 'github', suggestionInfoString: 'suggestion' }, 'en', cct.GITHUB_BODY_SHAPE);
      }
      const shown = el.querySelector('.cct-session');
      const spacer = el.querySelector('.cct-subject-break');
      for (const [node, name] of [[shown, '--cct-session-gap'], [spacer, '--cct-paragraph-gap']]) {
        if (!node) continue;
        if (undo) {
          node.dataset.saved = node.style.getPropertyValue(name);
          node.style.removeProperty(name);
        } else if (node.dataset.saved !== undefined) {
          node.style.setProperty(name, node.dataset.saved);
        }
      }
      const top = el.getBoundingClientRect().top;
      const lorem = [...el.querySelectorAll('p')].flatMap((p) => [...p.childNodes]).find((n) => n.nodeType === 3 && n.data.includes('Lorem'));
      const range = document.createRange();
      range.selectNodeContents(lorem);
      const lines = [...range.getClientRects()];
      const subject = document.createRange();
      subject.selectNodeContents(el.querySelector('.cct-subject'));
      const style = getComputedStyle(shown);
      const blocks = [...el.querySelectorAll(':scope > p')].map((p) => p.getBoundingClientRect());
      out[el.id] = {
        headerGap: blocks.length === 3 ? blocks[1].top - blocks[0].bottom : NaN,
        footerGap: blocks.length === 3 ? shown.getBoundingClientRect().top + parseFloat(style.paddingTop) - blocks[1].bottom : NaN,
        subject: subject.getClientRects()[0].top - top,
        first: lines[0].top - top,
        last: lines[lines.length - 1].top - top,
        session: shown.getBoundingClientRect().top + parseFloat(style.paddingTop) - top,
        height: el.getBoundingClientRect().height,
        normal: parseFloat(getComputedStyle(el.querySelector('p')).marginBottom) || 16,
        italic: style.fontStyle,
        display: style.display,
        text: shown.textContent,
      };
    }
    return out;
  }, undo);
}

const after = await measure(false);
const before = await measure(true);
await browser.close();

console.log('Marqueur de session et en-tête — mesurés dans un vrai Chromium\n');
const { spaced, tight } = after;
const same = (a, b) => Math.abs(a - b) <= 1;
for (const [k, label] of [
  ['subject', 'ligne de l’en-tête'],
  ['first', 'première ligne du texte'],
  ['last', 'dernière ligne du texte'],
  ['session', 'mention de session'],
  ['height', 'hauteur du commentaire'],
]) {
  assert(`même position, écriture aérée ou serrée : ${label}`, same(spaced[k], tight[k]), `${spaced[k].toFixed(1)} / ${tight[k].toFixed(1)} px`);
}
// Les écarts eux-mêmes, entre BOÎTES de blocs sur l'écriture aérée — de ligne à ligne, la
// hauteur d'une ligne entrerait dans la mesure, et celle de l'en-tête dépend des badges.
assert('en-tête → texte : un écart de paragraphe', same(spaced.headerGap, spaced.normal), `${spaced.headerGap.toFixed(1)} px pour ${spaced.normal}`);
assert('texte → mention : un écart de paragraphe', same(spaced.footerGap, spaced.normal), `${spaced.footerGap.toFixed(1)} px pour ${spaced.normal}`);
assert(
  'contre-épreuve : sans les variables d’écart, les deux écritures diffèrent',
  !same(before.spaced.session, before.tight.session) || !same(before.spaced.first, before.tight.first),
  `mention ${before.spaced.session.toFixed(1)} / ${before.tight.session.toFixed(1)} px`
);
for (const [id, m] of Object.entries(after)) {
  assert(`${id} : la mention est remplacée, en bloc et en italique`, m.text === '\u{1F916} session: some-session-id' && m.display === 'block' && m.italic === 'italic', `${m.text}, ${m.display}, ${m.italic}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nMarqueur de session : ${results.length} mesures, ${failed === 0 ? 'toutes conformes' : `${failed} en échec`}.`);
process.exit(failed === 0 ? 0 : 1);
