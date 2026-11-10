// CA-53, CA-54 — en-tête et marqueur de session (§3.6, §5.5) — rendu MESURÉ dans un vrai Chromium.
//
// Ce que happy-dom ne sait pas dire : où les lignes sont peintes. La demande (Reefact, #163) est
// géométrique : un commentaire écrit avec des lignes blanches entre préfixe, corps et marqueur,
// et le même écrit d'un bloc, se rendent À L'IDENTIQUE — sujet, corps et mention aux mêmes
// positions. Le corps est à deux tiers d'écart de paragraphe de la ligne du sujet, la mention à
// un écart entier du corps.
//
// Contrôle DIFFÉRENTIEL : sans les écarts posés par badges.ts (variables, marge du paragraphe du
// sujet), les deux écritures doivent différer — sinon la comparaison ne prouverait rien.
//
// Où que soit le marqueur (#169) — au milieu du corps, au-dessus du préfixe, avant un pied de
// signature, en double —, sa ligne est masquée SANS TRACE : chaque variante est comparée à la même
// mise en page écrite avec le marqueur en bas, que les mesures ci-dessus établissent. Mêmes
// positions de tout ce qui se lit, au pixel près, ou la ligne a laissé quelque chose derrière elle.
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
// Sans corps : le pied suit directement la ligne du sujet. L'écart qui existe déjà au-dessus de la
// mention est alors la marge resserrée du sujet (aéré) ou son espaceur (serré) : `sessionGap()`
// doit compléter jusqu'à un écart entier dans les deux cas.
const SHORT = {
  shortSpaced: `<p dir="auto">reviewed: blah-blah-blah</p>\n<p dir="auto">[session:some-session-id]</p>`,
  shortTight: `<p dir="auto">reviewed: blah-blah-blah<br>\n[session:some-session-id]</p>`,
};

// Variante → référence au marqueur en bas. `Lorem` et `More` sont les lignes dont la position
// trahirait une trace ; `Footer` le pied de signature, que la mention doit suivre.
const SHORT_LOREM = 'Lorem ipsum dolor sit amet.';
const ANYWHERE = {
  midParagraph: [
    `<p dir="auto">reviewed: blah</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">[session:a]</p>\n<p dir="auto">More text.</p>`,
    `<p dir="auto">reviewed: blah</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">More text.</p>\n<p dir="auto">[session:a]</p>`,
  ],
  midLine: [
    `<p dir="auto">reviewed: blah<br>\n${SHORT_LOREM}<br>\n[session:a]<br>\nMore text.</p>`,
    `<p dir="auto">reviewed: blah<br>\n${SHORT_LOREM}<br>\nMore text.<br>\n[session:a]</p>`,
  ],
  abovePrefix: [
    `<p dir="auto">[session:a]</p>\n<p dir="auto">reviewed: blah</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">More text.</p>`,
    `<p dir="auto">reviewed: blah</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">More text.</p>\n<p dir="auto">[session:a]</p>`,
  ],
  abovePrefixSameParagraph: [
    `<p dir="auto">[session:a]<br>\nreviewed: blah<br>\n${SHORT_LOREM}<br>\nMore text.</p>`,
    `<p dir="auto">reviewed: blah<br>\n${SHORT_LOREM}<br>\nMore text.<br>\n[session:a]</p>`,
  ],
  duplicate: [
    `<p dir="auto">reviewed: blah</p>\n<p dir="auto">[session:a]</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">More text.<br>\n[session:b]</p>`,
    `<p dir="auto">reviewed: blah</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">More text.</p>\n<p dir="auto">[session:a]</p>`,
  ],
};
const FOOTER = `<p dir="auto">reviewed: blah</p>\n<p dir="auto">${SHORT_LOREM}</p>\n<p dir="auto">[session:a]</p>\n<hr>\n<p dir="auto"><em>Footer line</em></p>`;

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
  ${Object.entries(SHORT).map(([id, html]) => `<div class="markdown-body short" id="${id}">${html}</div>`).join('\n')}
  ${Object.entries(ANYWHERE).map(([id, [variant, reference]]) => `<div class="markdown-body anywhere" id="${id}">${variant}</div><div class="markdown-body anywhere" id="${id}-ref">${reference}</div>`).join('\n')}
  <div class="markdown-body anywhere" id="footer">${FOOTER}</div>
  <script>${bundled.outputFiles[0].text}</script>
</body></html>`);

/** Positions, relatives au haut du corps, de ce que le lecteur voit : la ligne de l'en-tête, la
 * première et la dernière ligne du texte, la mention. Mesure DIFFÉRENTIELLE : avec `undo`, les
 * deux variables d'écart sont retirées — l'état d'avant la demande, dont les deux écritures
 * doivent alors différer, sans quoi la comparaison ne prouverait rien. */
async function measure(undo) {
  return page.evaluate((undo) => {
    const out = {};
    for (const el of document.querySelectorAll('.markdown-body:not(.short):not(.anywhere)')) {
      if (!el.querySelector('.cct-session')) {
        cct.decorateComment(el, cct.commentBodyText(el), cct.defaultConfig(), { id: 'github', suggestionInfoString: 'suggestion' }, 'en', cct.GITHUB_BODY_SHAPE);
      }
      const shown = el.querySelector('.cct-session');
      const spacer = el.querySelector('.cct-subject-break');
      const host = el.querySelector('[data-cct-header-margin]');
      if (host) {
        if (undo) {
          host.dataset.savedMargin = host.style.marginBottom;
          host.style.marginBottom = host.getAttribute('data-cct-header-margin');
        } else if (host.dataset.savedMargin !== undefined) {
          host.style.marginBottom = host.dataset.savedMargin;
        }
      }
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
        normal: 16, // la marge de paragraphe de la feuille ci-dessus
        fontStyle: style.fontStyle,
        display: style.display,
        text: shown.textContent,
      };
    }
    return out;
  }, undo);
}

const short = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.markdown-body.short')) {
    cct.decorateComment(el, cct.commentBodyText(el), cct.defaultConfig(), { id: 'github', suggestionInfoString: 'suggestion' }, 'en', cct.GITHUB_BODY_SHAPE);
    const shown = el.querySelector('.cct-session');
    const subject = document.createRange();
    subject.selectNodeContents(el.querySelector('.cct-subject'));
    const top = el.getBoundingClientRect().top;
    out[el.id] = {
      subject: subject.getClientRects()[0].top - top,
      session: shown.getBoundingClientRect().top + parseFloat(getComputedStyle(shown).paddingTop) - top,
      gap: shown.getBoundingClientRect().top + parseFloat(getComputedStyle(shown).paddingTop) - el.querySelector('p').getBoundingClientRect().bottom,
    };
  }
  return out;
});
// Ce que le lecteur voit, relatif au haut du corps : ligne du sujet, lignes de texte, pied, mention.
const anywhere = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.markdown-body.anywhere')) {
    cct.decorateComment(el, cct.commentBodyText(el), cct.defaultConfig(), { id: 'github', suggestionInfoString: 'suggestion' }, 'en', cct.GITHUB_BODY_SHAPE);
    const top = el.getBoundingClientRect().top;
    const textTop = (needle) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.data.includes(needle) || n.parentElement.closest('.cct-hidden-session, .cct-hidden-session-block')) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        return range.getClientRects()[0].top - top;
      }
      return NaN;
    };
    const shown = el.querySelector('.cct-session');
    const subject = el.querySelector('.cct-subject');
    const subjectRange = document.createRange();
    if (subject) subjectRange.selectNodeContents(subject);
    const footer = el.querySelector('em');
    out[el.id] = {
      subject: subject ? subjectRange.getClientRects()[0].top - top : NaN,
      lorem: textTop('Lorem'),
      more: textTop('More text'),
      session: shown ? shown.getBoundingClientRect().top + parseFloat(getComputedStyle(shown).paddingTop) - top : NaN,
      footerBottom: footer ? footer.closest('p').getBoundingClientRect().bottom - top : NaN,
      height: el.getBoundingClientRect().height,
      last: el.lastElementChild?.className,
      text: shown?.textContent ?? null,
    };
  }
  return out;
});
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
assert('en-tête → texte : deux tiers d’écart de paragraphe', same(spaced.headerGap, (spaced.normal * 2) / 3), `${spaced.headerGap.toFixed(1)} px pour ${spaced.normal} × 2/3`);
assert('texte → mention : un écart de paragraphe', same(spaced.footerGap, spaced.normal), `${spaced.footerGap.toFixed(1)} px pour ${spaced.normal}`);
assert(
  'contre-épreuve : sans les variables d’écart, les deux écritures diffèrent',
  !same(before.spaced.session, before.tight.session) || !same(before.spaced.first, before.tight.first),
  `mention ${before.spaced.session.toFixed(1)} / ${before.tight.session.toFixed(1)} px`
);
assert(
  'sujet et marqueur seuls : même position de la mention, aéré ou serré',
  same(short.shortSpaced.session, short.shortTight.session),
  `${short.shortSpaced.session.toFixed(1)} / ${short.shortTight.session.toFixed(1)} px`
);
assert('sujet et marqueur seuls : un écart de paragraphe sous le sujet', same(short.shortSpaced.gap, 16), `${short.shortSpaced.gap.toFixed(1)} px`);
for (const [id, m] of Object.entries(after)) {
  assert(`${id} : la mention est remplacée, en bloc et en romain`, m.text === '\u{1F916} session: some-session-id' && m.display === 'block' && m.fontStyle === 'normal', `${m.text}, ${m.display}, ${m.fontStyle}`);
}

console.log('\nOù que soit le marqueur (#169) — comparé au même commentaire, marqueur en bas\n');
for (const id of Object.keys(ANYWHERE)) {
  const v = anywhere[id];
  const r = anywhere[`${id}-ref`];
  const keys = ['subject', 'lorem', 'more', 'session', 'height'];
  const off = keys.filter((k) => !same(v[k], r[k]));
  assert(
    `${id} : aucune trace — sujet, texte, mention et hauteur aux positions de la référence`,
    off.length === 0 && Number.isFinite(v.session),
    off.length === 0 ? `mention à ${v.session.toFixed(1)} px` : off.map((k) => `${k} ${v[k].toFixed(1)} / ${r[k].toFixed(1)}`).join(', ')
  );
}
assert('duplicate : la mention dit `#ERROR`', anywhere.duplicate.text === '\u{1F916} session: #ERROR', anywhere.duplicate.text);
assert(
  'pied de signature : la mention passe dessous, à un écart de paragraphe',
  anywhere.footer.last === 'cct-session' && same(anywhere.footer.session - anywhere.footer.footerBottom, 16),
  `${(anywhere.footer.session - anywhere.footer.footerBottom).toFixed(1)} px sous le pied`
);

const failed = results.filter((r) => !r.ok).length;
console.log(`\nMarqueur de session : ${results.length} mesures, ${failed === 0 ? 'toutes conformes' : `${failed} en échec`}.`);
process.exit(failed === 0 ? 0 : 1);
