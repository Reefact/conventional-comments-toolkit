// Ligne du sujet (§5.5) — MESURÉE dans un vrai Chromium, jamais déduite d'un test happy-dom.
//
// Ce que les tests unitaires savent dire : « les badges sont enfants du même élément que le
// sujet ». Ce qu'ils ne savent PAS dire, faute de moteur de rendu : « les badges et le sujet
// sont sur la MÊME ligne ». Entre les deux il y a une affirmation sur le navigateur — un
// élément `inline-block` posé en tête d'un paragraphe partage la ligne du texte qui suit —, et
// le CLAUDE.md de ce dépôt dit quoi en faire : l'ouvrir, pas s'en souvenir. C'est le fond même
// de la demande à l'origine de ce rendu (« le sujet devrait être aligné avec les badges, en
// gras, à leur droite ») : si elle est fausse, tout le reste est du décor.
//
// Le contrôle est DIFFÉRENTIEL : le même commentaire est rendu deux fois, une fois avec les
// badges dans le paragraphe du sujet (ce que fait `decorateComment`) et une fois avec les
// badges au-dessus de lui (l'agencement d'avant). La géométrie doit distinguer les deux —
// sinon la mesure ne prouve rien, elle constate seulement qu'une page s'affiche.
//
// Le style de plateforme reproduit ici (marges de paragraphe) est une APPROXIMATION assumée de
// celui de github.com : aucune assertion ci-dessous n'en dépend, toutes portent sur des
// positions RELATIVES entre nœuds d'un même rendu.

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

// `decorateComment` tel qu'il est LIVRÉ, pas une réécriture : même source que le bundle MV3.
const bundled = await build({
  stdin: {
    contents: `
      import { decorateComment } from './packages/extension/src/ui/badges.ts';
      import { defaultConfig } from '@cct/core';
      globalThis.cct = { decorateComment, defaultConfig };
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

// Corps du commentaire de la capture d'origine : préfixe, sujet, puis une seconde ligne dans le
// MÊME paragraphe (un simple retour à la ligne devient un `<br>` chez GitHub), puis un second
// paragraphe — de quoi voir à la fois la ligne du sujet et ce qui doit rester en dessous.
const COMMENT = '<p dir="auto">nitpick (test): subject<br>\ndiscussion</p><p dir="auto">second paragraph</p>';
// Le corps qui reprend au paragraphe SUIVANT : la plateforme l'espace déjà, rien ne doit s'y
// ajouter (« s'il y en a déjà un, pas besoin d'en rajouter un autre »).
const SPACED = '<p dir="auto">nitpick (test): subject</p><p dir="auto">discussion</p>';
// Un sujet LONG, qui ne tient pas sur la fin de la ligne entamée par les badges : c'est le cas
// où les mises en page « rétrécies à la demande » basculent tout entières sous les badges.
const LONG =
  '<p dir="auto">nitpick (test): un sujet assez long pour dépasser la largeur restante de la ligne et devoir se replier</p>';

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage();
await page.setContent(`
  <style>
    body { font: 14px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; width: 700px; }
    td { display: block; padding: 8px; }
    td p { margin: 0 0 16px; }
    td p:last-child { margin-bottom: 0; }
    ${css}
  </style>
  <table><tr><td class="comment-body" id="after">${COMMENT}</td></tr></table>
  <table><tr><td class="comment-body" id="before">${COMMENT}</td></tr></table>
  <table><tr><td class="comment-body" id="spaced">${SPACED}</td></tr></table>
  <div style="width: 380px"><table><tr><td class="comment-body" id="long">${LONG}</td></tr></table></div>
  <table><tr><td class="comment-body" id="probe">${COMMENT}</td></tr></table>
`);
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const measured = await page.evaluate(() => {
  const profile = { id: 'github', suggestionInfoString: 'suggestion' };
  const config = globalThis.cct.defaultConfig();

  // Rendu livré.
  const after = document.getElementById('after');
  globalThis.cct.decorateComment(after, after.textContent, config, profile, 'en');

  const spaced = document.getElementById('spaced');
  globalThis.cct.decorateComment(spaced, spaced.textContent, config, profile, 'en');

  const long = document.getElementById('long');
  globalThis.cct.decorateComment(long, long.textContent, config, profile, 'en');

  // Sonde des deux techniques ÉCARTÉES pour la respiration, rejouées ici plutôt que rappelées
  // de mémoire : le jour où l'une d'elles marcherait, ce commentaire doit devenir faux bruyamment.
  const probe = document.getElementById('probe');
  globalThis.cct.decorateComment(probe, probe.textContent, config, profile, 'en');
  probe.querySelector('.cct-subject-break').remove(); // on retire la solution retenue…

  // Agencement d'AVANT, reconstitué à la main sur le même corps : les mêmes badges, mais
  // enfants du corps et non du paragraphe, et un sujet sans mise en avant. C'est le témoin.
  const before = document.getElementById('before');
  const witness = [...after.querySelectorAll('.cct-badge')].map((b) => b.cloneNode(true));
  before.prepend(...witness);

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 };
  };
  const of = (root, sel) => box(root.querySelector(sel));
  // Le second paragraphe sert de repère de flux : il doit rester SOUS tout le reste.
  const secondParagraph = (root) => box(root.querySelectorAll('p')[1]);

  // « discussion » n'a pas de nœud à lui : on le mesure par un Range sur le texte qui suit le
  // <br>, seul moyen d'obtenir la position d'un fragment de texte sans en changer le rendu.
  // L'espaceur `.cct-subject-break` s'intercale entre les deux : c'est le premier nœud de TEXTE
  // qu'on cherche, pas le frère immédiat.
  const textAfterBreak = (root) => {
    let node = root.querySelector('br').nextSibling;
    while (node !== null && node.nodeType !== 3) node = node.nextSibling;
    return node;
  };
  const afterBreak = (root) => {
    const text = textAfterBreak(root);
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.data.length);
    const r = range.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 };
  };
  const firstLineOf = (root) => {
    const p = root.querySelector('p');
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    // Fin de la première ligne = juste avant le <br>.
    range.setEndBefore(root.querySelector('br'));
    const r = range.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 };
  };

  const lineGap = (root) => root.querySelector('.cct-subject').getBoundingClientRect().top === 0
    ? NaN
    : afterBreak(root).top - root.querySelector('.cct-subject').getBoundingClientRect().top;
  // …et on mesure ce que chaque candidat écarté ferait à sa place.
  const probeGaps = { none: lineGap(probe) };
  const styleProbe = document.createElement('style');
  styleProbe.textContent = '#probe br { display: block; margin-bottom: 10px; }';
  document.head.appendChild(styleProbe);
  probeGaps.marginOnBr = lineGap(probe);
  // La bascule ne se voit que sur un sujet qui NE TIENT PAS sur la fin de la ligne entamée :
  // court, un inline-block y reste sagement. C'est donc `#long` qu'on sonde ici, pas `#probe`.
  styleProbe.textContent = '#long .cct-subject { display: inline-block; margin-bottom: 10px; }';
  probeGaps.inlineBlockKeepsLongSubjectOnBadgeLine = (() => {
    const b = long.querySelector('.cct-badge-label').getBoundingClientRect();
    const s = long.querySelector('.cct-subject').getBoundingClientRect();
    return s.top < b.bottom && b.top < s.bottom;
  })();
  styleProbe.remove();

  return {
    probeGaps,
    spaced: {
      hasBreak: spaced.querySelector('.cct-subject-break') !== null,
      subject: of(spaced, '.cct-subject'),
      body: box(spaced.querySelectorAll('p')[1]),
    },
    long: {
      label: of(long, '.cct-badge-label'),
      subject: of(long, '.cct-subject'),
    },
    after: {
      label: of(after, '.cct-badge-label'),
      lastBadge: box([...after.querySelectorAll('.cct-badge')].at(-1)),
      subject: of(after, '.cct-subject'),
      subjectGapFromBadge:
        after.querySelector('.cct-subject').getBoundingClientRect().left -
        [...after.querySelectorAll('.cct-badge')].at(-1).getBoundingClientRect().right,
      badgeToBadgeGap:
        after.querySelectorAll('.cct-badge')[1].getBoundingClientRect().left -
        after.querySelectorAll('.cct-badge')[0].getBoundingClientRect().right,
      hasBreak: after.querySelector('.cct-subject-break') !== null,
      subjectWeight: getComputedStyle(after.querySelector('.cct-subject')).fontWeight,
      paragraphWeight: getComputedStyle(after.querySelectorAll('p')[1]).fontWeight,
      discussion: afterBreak(after),
      second: secondParagraph(after),
      body: box(after),
    },
    before: {
      label: of(before, '.cct-badge-label'),
      firstLine: firstLineOf(before),
      second: secondParagraph(before),
      body: box(before),
    },
  };
});
await browser.close();

const { after, before, spaced, long, probeGaps } = measured;
const overlaps = (a, b) => a.top < b.bottom && b.top < a.bottom;

assert(
  'le badge de label et le sujet sont sur la MÊME ligne',
  overlaps(after.label, after.subject),
  `badge ${after.label.top.toFixed(1)}–${after.label.bottom.toFixed(1)}, sujet ${after.subject.top.toFixed(1)}–${after.subject.bottom.toFixed(1)}`
);
assert(
  'le sujet est À DROITE du dernier badge, sans le chevaucher',
  after.subject.left >= after.lastBadge.right,
  `sujet x=${after.subject.left.toFixed(1)}, dernier badge x=${after.lastBadge.right.toFixed(1)}`
);
assert(
  'le sujet est plus gras que le texte qui suit',
  Number(after.subjectWeight) > Number(after.paragraphWeight),
  `${after.subjectWeight} contre ${after.paragraphWeight}`
);
assert(
  'l’écart badge → sujet vaut le DOUBLE de l’écart entre deux badges',
  Math.abs(after.subjectGapFromBadge - 2 * after.badgeToBadgeGap) < 0.5,
  `${after.subjectGapFromBadge.toFixed(1)}px contre ${after.badgeToBadgeGap.toFixed(1)}px entre badges`
);
assert(
  'un sujet LONG reste sur la ligne des badges — il ne bascule pas dessous',
  after.label.top < after.subject.bottom && long.subject.top < long.label.bottom && long.label.top < long.subject.bottom,
  `badge ${long.label.top.toFixed(1)}–${long.label.bottom.toFixed(1)}, sujet ${long.subject.top.toFixed(1)}–${long.subject.bottom.toFixed(1)}`
);
assert(
  'la suite du paragraphe reste SOUS la ligne du sujet, jamais à côté',
  after.discussion.top >= after.subject.bottom - 1,
  `discussion y=${after.discussion.top.toFixed(1)}, sujet bas=${after.subject.bottom.toFixed(1)}`
);
assert(
  'le second paragraphe garde son espacement de bloc sous le premier',
  after.second.top > after.discussion.bottom,
  `second p y=${after.second.top.toFixed(1)}, discussion bas=${after.discussion.bottom.toFixed(1)}`
);

// La respiration sous la ligne du sujet — posée seulement quand le corps reprend sur la ligne
// SUIVANTE du même paragraphe, jamais quand la plateforme espace déjà les blocs.
assert(
  'la respiration écarte réellement le corps de la ligne du sujet',
  after.hasBreak && after.discussion.top - after.subject.top > probeGaps.none,
  `${(after.discussion.top - after.subject.top).toFixed(1)}px, contre ${probeGaps.none.toFixed(1)}px sans elle`
);
assert(
  'aucune respiration ajoutée quand le corps reprend au paragraphe SUIVANT',
  !spaced.hasBreak && spaced.body.top > spaced.subject.bottom,
  `corps y=${spaced.body.top.toFixed(1)}, sujet bas=${spaced.subject.bottom.toFixed(1)}`
);

// Les deux techniques ÉCARTÉES, remesurées à chaque exécution. Elles ne sont pas fausses « de
// mémoire » : elles le sont ici, dans ce navigateur, aujourd'hui.
assert(
  '(écartée) une marge sur le <br>, même en display:block, ne déplace RIEN',
  Math.abs(probeGaps.marginOnBr - probeGaps.none) < 0.5,
  `${probeGaps.marginOnBr.toFixed(1)}px contre ${probeGaps.none.toFixed(1)}px sans règle`
);
assert(
  '(écartée) inline-block sur le sujet fait basculer un sujet LONG sous les badges',
  !probeGaps.inlineBlockKeepsLongSubjectOnBadgeLine,
  'la boîte rétrécie-à-la-demande ne tient plus sur la ligne entamée'
);

// Le témoin : sans le déplacement, la première ligne du texte tombe SOUS les badges. C'est ce
// que montrait la capture à l'origine de ce rendu, et c'est ce que la mesure doit distinguer.
assert(
  '(témoin) badges en frères du paragraphe : le texte repart à la ligne sous eux',
  !overlaps(before.label, before.firstLine) && before.firstLine.top >= before.label.bottom - 1,
  `badge bas=${before.label.bottom.toFixed(1)}, première ligne y=${before.firstLine.top.toFixed(1)}`
);
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nLigne du sujet : ${results.length} mesures, toutes conformes.`
    : `\n${failed.length} mesure(s) en échec.`
);
process.exit(failed.length === 0 ? 0 : 1);
