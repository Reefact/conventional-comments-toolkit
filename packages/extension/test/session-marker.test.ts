// @vitest-environment happy-dom
// CA-53 — affichage du marqueur de session (§3.6, §5.5, #160) : la dernière ligne
// `[session:<valeur>]` d'un commentaire publié est masquée et remplacée, à sa place, par
// `<icône> session: <valeur en minuscules>`. Purement client, réversible, idempotent ; dans le
// doute, le marqueur reste visible tel qu'écrit.

import { afterEach, describe, expect, it } from 'vitest';
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

describe('CA-53 — écart au-dessus de la mention : le double de l’écart normal (§5.5)', () => {
  // La GÉOMÉTRIE est mesurée dans Chromium (`check:session-line`) ; ici, la valeur que
  // `sessionGap()` pose, selon que la mention ouvre son paragraphe ou suit un saut de ligne.
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const gap = (el: Element) => (el.querySelector('.cct-session') as HTMLElement).style.getPropertyValue('--cct-session-gap');

  it('paragraphe à part : la marge du paragraphe précédent compte déjà pour un écart, il en ajoute un', () => {
    const el = body('<p style="margin-bottom: 16px">note: x</p>\n<p style="margin-bottom: 16px">Detail.</p>\n<p>[session:a]</p>');
    decorate(el);
    expect(gap(el)).toBe('16px');
  });

  it('après un saut de ligne : aucun écart n’existe, il en pose deux', () => {
    const el = body('<p style="margin-bottom: 16px">note: x</p>\n<p>Detail.<br>\n[session:a]</p>');
    decorate(el);
    expect(gap(el)).toBe('32px');
  });

  it('seule dans le corps : rien au-dessus, aucun écart', () => {
    const el = body('<p>[session:a]</p>');
    decorate(el);
    expect(gap(el)).toBe('0px');
  });

  it('sans écart normal lisible, `1em` en tient lieu', () => {
    const own = body('<p>note: x</p>\n<p>[session:a]</p>');
    decorate(own);
    expect(gap(own)).toBe('1em');
    const br = body('<p>note: x<br>\n[session:a]</p>');
    decorate(br);
    expect(gap(br)).toBe('2em');
  });
});
