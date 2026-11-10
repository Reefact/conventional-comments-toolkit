// Marqueur de session affiché (§3.6, §5.5) — écart MESURÉ dans un vrai Chromium.
//
// Ce que happy-dom ne sait pas dire : à quelle distance du texte qui la précède la mention
// `🤖 session: …` est peinte. La demande (Reefact, #163) est géométrique : le DOUBLE de l'écart
// normal entre deux paragraphes, que le marqueur soit écrit dans son propre paragraphe ou juste
// après un saut de ligne, et quel que soit le nombre de lignes blanches autour — le rendu
// Markdown les replie, le corps rendu n'en garde aucune trace.
//
// Contrôle DIFFÉRENTIEL : la même mesure sans la variable d'écart posée par `sessionGap()` doit
// donner autre chose que le double — sinon elle ne prouverait rien.
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

// Le HTML qu'un rendu Markdown produit : les lignes blanches, même faites d'espaces, ne laissent
// aucun nœud — c'est pourquoi un seul cas « paragraphe à part » couvre « une » comme « dix » lignes
// blanches avant le marqueur.
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin vel justo a quam scelerisque fringilla.';
const CASES = {
  own: `<p dir="auto">reviewed: blah-blah-blah</p>\n<p dir="auto" class="before">${LOREM}</p>\n<p dir="auto">[session:some-session-id]</p>`,
  br: `<p dir="auto">reviewed: blah-blah-blah</p>\n<p dir="auto" class="before">${LOREM}<br>\n[session:some-session-id]</p>`,
};

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head><style>
  body { font: 14px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; width: 600px; }
  .markdown-body p { margin: 0 0 16px; }
  .markdown-body > *:last-child { margin-bottom: 0; }
  ${css}
</style></head><body>
  ${Object.entries(CASES).map(([id, html]) => `<div class="markdown-body" id="${id}">${html}</div>`).join('\n')}
  <script>${bundled.outputFiles[0].text}</script>
</body></html>`);

const measured = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.markdown-body')) {
    cct.decorateComment(el, cct.commentBodyText(el), cct.defaultConfig(), { id: 'github', suggestionInfoString: 'suggestion' }, 'en', cct.GITHUB_BODY_SHAPE);
    const shown = el.querySelector('.cct-session');
    const before = el.querySelector('.before');
    const [first, second] = el.querySelectorAll('p');
    // Bas du texte qui précède : la boîte du paragraphe quand la mention ouvre le sien, sinon la
    // boîte de ligne du texte (même paragraphe, après un saut de ligne).
    const text = document.createRange();
    text.selectNodeContents(before.firstChild);
    // La DERNIÈRE ligne peinte : le texte peut se replier sur plusieurs lignes.
    const rects = [...text.getClientRects()];
    const glyphs = rects[rects.length - 1];
    const lineHeight = parseFloat(getComputedStyle(before).lineHeight);
    const inSame = before.contains(shown);
    const textBottom = inSame ? glyphs.bottom + (lineHeight - glyphs.height) / 2 : before.getBoundingClientRect().bottom;
    const gap = () => shown.getBoundingClientRect().top + parseFloat(getComputedStyle(shown).paddingTop) - textBottom;
    const style = getComputedStyle(shown);
    const withGap = gap();
    // Contre-épreuve : sans la variable posée par sessionGap(), l'écart retombe sur le défaut CSS.
    const saved = shown.style.getPropertyValue('--cct-session-gap');
    shown.style.removeProperty('--cct-session-gap');
    shown.style.setProperty('padding-top', '0px');
    const withoutGap = gap();
    shown.style.removeProperty('padding-top');
    shown.style.setProperty('--cct-session-gap', saved);
    out[el.id] = {
      normal: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
      withGap,
      withoutGap,
      italic: style.fontStyle,
      display: style.display,
      text: shown.textContent,
    };
  }
  return out;
});
await browser.close();

console.log('Marqueur de session affiché — mesuré dans un vrai Chromium\n');
for (const [id, m] of Object.entries(measured)) {
  const label = id === 'own' ? 'paragraphe à part' : 'après un saut de ligne';
  assert(`${label} : la mention est remplacée`, m.text === '\u{1F916} session: some-session-id', m.text);
  assert(`${label} : écart au-dessus = 2 × l’écart normal (± 1 px)`, Math.abs(m.withGap - 2 * m.normal) <= 1, `${m.withGap.toFixed(1)} px pour un écart normal de ${m.normal} px`);
  assert(`${label} : contre-épreuve, sans la variable l’écart n’est pas le double`, Math.abs(m.withoutGap - 2 * m.normal) > 1, `${m.withoutGap.toFixed(1)} px`);
  assert(`${label} : bloc, en italique`, m.display === 'block' && m.italic === 'italic', `${m.display}, ${m.italic}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nMarqueur de session : ${results.length} mesures, ${failed === 0 ? 'toutes conformes' : `${failed} en échec`}.`);
process.exit(failed === 0 ? 0 : 1);
