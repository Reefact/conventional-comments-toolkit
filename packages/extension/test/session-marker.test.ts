// @vitest-environment happy-dom
// CA-53 — affichage du marqueur de session (§3.6, §5.5, #160) : la dernière ligne
// `[session:<valeur>]` d'un commentaire publié est masquée et remplacée, à sa place, par
// `<icône> session: <valeur en minuscules>`. Purement client, réversible, idempotent ; dans le
// doute, le marqueur reste visible tel qu'écrit.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commentBodyText } from '@cct/adapter-shared';
import { defaultConfig, type EffectiveConfig } from '@cct/core';
import { clearCommentDecorations, decorateComment } from '../src/ui/badges.js';
import { HTML_SHAPE } from './helpers/decorate.js';

const profile = { id: 'github', suggestionInfoString: 'suggestion' };

function body(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function decorate(el: Element, config: EffectiveConfig = defaultConfig(), shape = HTML_SHAPE as typeof HTML_SHAPE | null) {
  decorateComment(el, commentBodyText(el), config, profile, 'en', shape);
}

/** Le texte que le lecteur VOIT : sans ce que l'extension masque par `display: none`. */
function visible(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('.cct-hidden-prefix, .cct-hidden-session, .cct-badge').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const shown = (el: Element) => el.querySelector('.cct-session')?.textContent ?? null;

describe('CA-53 — le marqueur reconnu s’affiche en bas du commentaire, à sa place (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dans son propre paragraphe : icône robot et valeur en minuscules, le texte d’origine masqué', () => {
    const el = body('<p>issue (blocking): Some title</p>\n<p>Detail.</p>\n<p>[session:Melancholy-Coordinated-Value-Object]</p>');
    decorate(el);
    expect(shown(el)).toBe('\u{1F916} session: melancholy-coordinated-value-object');
    expect(visible(el)).not.toContain('[session:');
    expect(visible(el).endsWith('\u{1F916} session: melancholy-coordinated-value-object')).toBe(true);
    // À sa place : dans le dernier paragraphe, juste après le texte masqué.
    expect(el.querySelector('.cct-hidden-session')?.textContent).toBe('[session:Melancholy-Coordinated-Value-Object]');
    expect(el.querySelector('.cct-hidden-session')?.nextElementSibling?.className).toBe('cct-session');
  });

  it('après un saut de ligne dans le même paragraphe', () => {
    const el = body('<p>note: Some title<br>\n[session:Run-7]</p>');
    decorate(el);
    expect(shown(el)).toBe('\u{1F916} session: run-7');
    expect(visible(el)).toBe('Some title \u{1F916} session: run-7');
    // Le sujet mis en avant s’arrête au saut de ligne : la métadonnée n’y entre pas.
    expect(el.querySelector('.cct-subject')?.textContent).toBe('Some title');
  });

  it('sur un commentaire sans label résolu, ou réduit au seul marqueur', () => {
    const plain = body('<p>Just a sentence.</p>\n<p>[session:A]</p>');
    decorate(plain);
    expect(shown(plain)).toBe('\u{1F916} session: a');
    const only = body('<p>[session:Only]</p>');
    decorate(only);
    expect(shown(only)).toBe('\u{1F916} session: only');
  });

  it('la casse d’origine est gardée dans le corps relu : seul l’affichage passe en minuscules', () => {
    const el = body('<p>note: x</p>\n<p>[session:MiXeD]</p>');
    const before = commentBodyText(el);
    decorate(el);
    expect(commentBodyText(el)).toBe(before);
    expect(commentBodyText(el)).toContain('[session:MiXeD]');
  });

  it('l’icône se configure, et un changement d’icône se reporte au passage suivant', () => {
    const el = body('<p>note: x</p>\n<p>[session:a]</p>');
    decorate(el, { ...defaultConfig(), sessionIcon: '\u{1F9ED}' });
    expect(shown(el)).toBe('\u{1F9ED} session: a');
    decorate(el, defaultConfig());
    expect(shown(el)).toBe('\u{1F916} session: a');
    expect(el.querySelectorAll('.cct-session')).toHaveLength(1);
  });

  it('idempotent : un deuxième passage ne change rien au DOM', () => {
    const el = body('<p>issue: x</p>\n<p>[session:a]</p>');
    decorate(el);
    const once = el.innerHTML;
    decorate(el);
    expect(el.innerHTML).toBe(once);
  });

  it.each([
    ['espaces après le marqueur', '<p>note: x</p>\n<p>[session:Run-7]   </p>'],
    ['espaces avant et après, après un saut de ligne', '<p>note: x<br>\n   [session:Run-7] \t </p>'],
  ])('toute la dernière ligne est remplacée, blancs de bordure compris (revue Reefact, PR #163) : %s', (_name, html) => {
    const el = body(html);
    decorate(el);
    const shown = el.querySelector('.cct-session')!;
    // Rien de la ligne d'origine ne reste visible autour de la mention : ni avant, ni après.
    expect(shown.nextSibling).toBeNull();
    const hidden = el.querySelector('.cct-hidden-session')!;
    const before = hidden.previousSibling;
    expect(before === null || before.nodeType !== 3 || !/[ \t]/.test((before as Text).data.split('\n').pop() ?? '')).toBe(true);
    // Le corps relu est inchangé, et un second passage ne change rien.
    const once = el.innerHTML;
    decorate(el);
    expect(el.innerHTML).toBe(once);
    expect(commentBodyText(el)).toContain('[session:Run-7]');
  });

  it('un affichage emporté par la plateforme est reposé au passage suivant', () => {
    const el = body('<p>note: x</p>\n<p>[session:a]</p>');
    decorate(el);
    el.querySelector('.cct-session')!.remove();
    decorate(el);
    expect(shown(el)).toBe('\u{1F916} session: a');
    expect(el.querySelectorAll('.cct-hidden-session')).toHaveLength(1);
  });
});

describe('CA-53 — réversible, et sans effet sur un commentaire sans marqueur', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('un commentaire sans marqueur ne reçoit rien de ce rendu', () => {
    const el = body('<p>note: x</p>\n<p>Last line.</p>');
    decorate(el);
    expect(el.querySelector('.cct-session, .cct-hidden-session')).toBeNull();
  });

  it('défaire (extension inactive) rend le corps exact d’avant', () => {
    const html = '<p>note: x</p>\n<p>[session:Run-7]</p>';
    const el = body(html);
    decorate(el);
    clearCommentDecorations(document);
    // `class=""` : l'attribut vidé que le retrait de la marque d'hôte des badges laisse déjà
    // (`clearCommentDecorations`, avant cette fonctionnalité) — sans effet sur le rendu.
    expect(el.innerHTML.replace(' class=""', '')).toBe(html);
  });

  it('une plateforme qui cesse de déclarer la forme de son corps rendu : le marqueur réapparaît tel qu’écrit', () => {
    const el = body('<p>note: x</p>\n<p>[session:Run-7]</p>');
    decorate(el);
    decorate(el, defaultConfig(), null);
    expect(el.querySelector('.cct-session, .cct-hidden-session')).toBeNull();
    expect(visible(el)).toContain('[session:Run-7]');
  });

  it('un corps dont la dernière ligne n’est plus un marqueur : l’affichage est retiré', () => {
    const el = body('<p>note: x</p>\n<p>[session:a]</p>');
    decorate(el);
    // L'édition publiée remplace le rendu : un paragraphe s'ajoute après le marqueur.
    el.insertAdjacentHTML('beforeend', '\n<p>More text.</p>');
    decorate(el);
    expect(el.querySelector('.cct-session, .cct-hidden-session')).toBeNull();
    expect(visible(el)).toContain('[session:a]');
  });
});

describe('CA-53 — repli : sans projection sûre, le marqueur reste lisible tel qu’écrit', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each([
    ['mis en forme inline', '<p>note: x</p>\n<p><em>[session:a]</em></p>'],
    ['dans une liste', '<p>note: x</p>\n<ul>\n<li>[session:a]</li>\n</ul>'],
    ['dans un bloc de code', '<p>note: x</p>\n<pre><code>[session:a]\n</code></pre>'],
    ['dans une citation', '<p>note: x</p>\n<blockquote>\n<p>[session:a]</p>\n</blockquote>'],
    ['précédé d’un texte mis en forme sur la même ligne', '<p>note: x<br>\n<strong>end</strong> [session:a]</p>'],
  ])('%s', (_name, html) => {
    const el = body(html);
    decorate(el);
    expect(el.querySelector('.cct-session, .cct-hidden-session')).toBeNull();
    expect(visible(el)).toContain('[session:a]');
  });
});

describe('CA-53 — écarts : en-tête à deux tiers d’écart de paragraphe, pied à un écart, quelle que soit l’écriture (§5.5)', () => {
  // La GÉOMÉTRIE est mesurée dans Chromium (`check:session-line` : les deux écritures aux mêmes
  // positions) ; ici, ce que badges.ts pose dans chaque cas, avec une marge de paragraphe de 16 px.
  let style: HTMLStyleElement;
  beforeEach(() => {
    style = document.createElement('style');
    style.textContent = '.gap p { margin: 0 0 16px; }';
    document.head.appendChild(style);
  });
  afterEach(() => {
    style.remove();
    document.body.innerHTML = '';
  });
  const gapped = (html: string) => {
    const el = body(html);
    el.className = 'gap';
    return el;
  };
  const sessionGap = (el: Element) => (el.querySelector('.cct-session') as HTMLElement).style.getPropertyValue('--cct-session-gap');
  const spacerGap = (el: Element) => (el.querySelector('.cct-subject-break') as HTMLElement | null)?.style.getPropertyValue('--cct-paragraph-gap') ?? null;

  it('écrit aéré : la marge du paragraphe du sujet est resserrée à deux tiers, et la sonde ne reste pas', () => {
    const el = gapped('<p>note: x</p>\n<p>Detail.</p>\n<p>[session:a]</p>');
    decorate(el);
    expect((el.querySelector('p') as HTMLElement).style.marginBottom).toBe('10.67px');
    expect(el.querySelectorAll('p')).toHaveLength(3);
    // Le pied ouvre son paragraphe, après un bloc à marge pleine : rien à ajouter.
    expect(sessionGap(el)).toBe('0px');
  });

  it('écrit d’un bloc : l’espaceur du sujet fait deux tiers d’écart, le pied un écart entier', () => {
    const el = gapped('<p>note: x<br>\nDetail.<br>\n[session:a]</p>');
    decorate(el);
    expect(spacerGap(el)).toBe('10.67px');
    expect(sessionGap(el)).toBe('16px');
  });

  it('sujet et marqueur seuls : le pied complète l’écart resserré jusqu’à un écart entier', () => {
    const spaced = gapped('<p>note: x</p>\n<p>[session:a]</p>');
    decorate(spaced);
    expect(sessionGap(spaced)).toBe('5.33px');
    const tight = gapped('<p>note: x<br>\n[session:a]</p>');
    decorate(tight);
    expect(sessionGap(tight)).toBe('5.33px');
  });

  it('la marge resserrée est rendue telle qu’elle était quand l’extension se retire', () => {
    const el = gapped('<p style="color: red">note: x</p>\n<p>Detail.</p>');
    const subject = el.querySelector('p') as HTMLElement;
    decorate(el);
    expect(subject.style.marginBottom).toBe('10.67px');
    clearCommentDecorations(document);
    expect(subject.style.marginBottom).toBe('');
    expect(subject.style.color).toBe('red');
    expect(subject.hasAttribute('data-cct-header-margin')).toBe(false);
    const bare = gapped('<p>note: x</p>\n<p>Detail.</p>');
    decorate(bare);
    clearCommentDecorations(document);
    expect((bare.querySelector('p') as HTMLElement).hasAttribute('style')).toBe(false);
  });

  it('un sujet en dernier bloc n’est pas resserré : sa marge n’écarte rien', () => {
    const el = gapped('<p>note: x</p>');
    decorate(el);
    expect((el.querySelector('p') as HTMLElement).hasAttribute('data-cct-header-margin')).toBe(false);
  });

  it('seule dans le corps, la mention n’a aucun écart', () => {
    const el = gapped('<p>[session:a]</p>');
    decorate(el);
    expect(sessionGap(el)).toBe('0px');
  });
});
