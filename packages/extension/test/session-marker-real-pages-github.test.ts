// @vitest-environment happy-dom
// CA-53, CA-54 — le marqueur de session (§3.6, §5.5) sur des commentaires RÉELLEMENT publiés et
// rendus par GitHub (#164). Les autres tests du marqueur bâtissent eux-mêmes la forme `<p>`/`<br>`
// qu'ils projettent ; celui-ci la lit dans des pages capturées, pour qu'un écart entre cette
// forme et le rendu réel se voie.
//
// Captures prises le 2026-11-11 par une session Claude in Chrome, extension Conventional Comments
// désactivée, réduites dans le navigateur (skill `plateforme`), dans les deux vues de GitHub
// (`?overview=false` / `?overview=true`) :
//   - `03-*-marqueur-session-pr165.html` : Reefact/conventional-comments-toolkit#165, des
//     commentaires écrits par les skills de revue — forme A réelle (marqueur en dernière ligne,
//     après une ligne vide) et forme H réelle (marqueur, puis `---` et un pied signé) ;
//   - `03-*-marqueur-session-cas-limites.html` : Reefact/just-dummies#557, neuf commentaires de
//     test publiés pour l'occasion, un par cas A à I de #164 (texte exact dans `CASES`).
//
// Forme rendue, MESURÉE sur ces captures, identique dans les deux vues :
//   - le marqueur précédé d'une ligne vide est SON PROPRE `<p>` (A, C, D, E, G, H, I) ;
//   - sans ligne vide (B), il suit un `<br>` puis un saut de ligne dans le même `<p>` ;
//   - la valeur n'est jamais transformée en lien ; les espaces de bord (E) sont retirés ;
//   - dans un bloc de code (F), il vit dans `pre > code` ; dans une citation, dans
//     `blockquote > p`.
// Les corps ont été soumis par le formulaire de la page : leurs fins de ligne sont des CRLF
// (normalisation HTML d'une `<textarea>`), comme celles de tout commentaire tapé dans GitHub.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commentBodyText } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { defaultConfig } from '@cct/core';
import { decorateComment } from '../src/ui/badges.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters', 'github', 'test', 'fixtures', 'pages');
const profile = { id: 'github', suggestionInfoString: 'suggestion' };
const T = 30_000;

const SESSION = 'melancholy-coordinated-value-object';
const MARKER = `[session:${SESSION}]`;
const MENTION = `\u{1F916} session: ${SESSION}`;

/** Les cas de #164 publiés sur Reefact/just-dummies#557 : identifiant du commentaire, marqueurs
 * tels qu'écrits, mention attendue — `null` quand rien ne doit être projeté. */
const CASES = {
  A: { id: 6784829633, markers: [MARKER], mention: MENTION },
  B: { id: 6784834172, markers: [MARKER], mention: MENTION },
  C: { id: 6784835012, markers: [MARKER], mention: MENTION },
  D: { id: 6784835760, markers: [MARKER], mention: MENTION },
  E: { id: 6784836558, markers: [MARKER], mention: MENTION },
  F: { id: 6784837449, markers: [MARKER, MARKER], mention: null },
  G: { id: 6784838215, markers: ['[session:Mixed-Case-Value]'], mention: '\u{1F916} session: mixed-case-value' },
  H: { id: 6784838990, markers: [MARKER], mention: MENTION },
  I: { id: 6784839721, markers: [MARKER, '[session:another-session-value]'], mention: '\u{1F916} session: #ERROR' },
} as const;

/** Les commentaires réels de #165 : la valeur est un GUID, écrit par les skills de revue. */
const REAL = {
  A: { id: 6774156687, marker: '[session:37b31afb-3917-4c0b-9e08-0b8e75b93c54]' },
  H: { id: 6772990866, marker: '[session:37b31afb-3917-4c0b-9e08-0b8e75b93c54]' },
} as const;

const VIEWS = ['conversation', 'overview'] as const;
type View = (typeof VIEWS)[number];

const pages = new Map<string, { adapter: GithubClientAdapter; comments: { element: Element; bodyText: string }[] }>();

/** Une capture, analysée une fois. */
function page(file: string, path: string) {
  let p = pages.get(file);
  if (!p) {
    const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
    Object.defineProperty(doc, 'location', { value: new URL(`https://github.com${path}`), configurable: true });
    const adapter = new GithubClientAdapter({ documentRef: doc });
    p = { adapter, comments: adapter.getRenderedComments() };
    pages.set(file, p);
  }
  return p;
}

/** Le commentaire rendu dont l'ancêtre porte cet identifiant, tel que l'adaptateur le livre. */
function comment(file: string, path: string, id: number) {
  const p = page(file, path);
  const found = p.comments.filter((c) => c.element.closest(`[id="issuecomment-${id}"]`) !== null);
  expect(found, `issuecomment-${id} dans ${file}`).toHaveLength(1);
  return { ...found[0]!, adapter: p.adapter };
}

const edge = (view: View) => [`03-${view}-marqueur-session-cas-limites.html`, '/Reefact/just-dummies/pull/557'] as const;
const real = (view: View) => [`03-${view}-marqueur-session-pr165.html`, '/Reefact/conventional-comments-toolkit/pull/165'] as const;

/** Décore comme le fait la page : la forme vient de l'adaptateur, pas du test. */
function project(c: ReturnType<typeof comment>) {
  decorateComment(c.element, c.bodyText, defaultConfig(), profile, 'en', c.adapter.renderedBodyShape());
  return c.element.querySelector('.cct-session')?.textContent ?? null;
}

/** Le texte que le lecteur voit : sans ce que l'extension masque. */
function visible(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('.cct-hidden-prefix, .cct-hidden-session, .cct-hidden-session-block, .cct-badge').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe.each(VIEWS)('#164 — vue %s, cas limites publiés sur just-dummies#557', (view) => {
  it.each(Object.entries(CASES))('cas %s : commentBodyText() rend chaque marqueur tel qu’écrit', (_, { id, markers }) => {
    const c = comment(...edge(view), id);
    for (const m of new Set(markers)) expect(count(c.bodyText, m)).toBe(markers.filter((x) => x === m).length);
    expect(commentBodyText(c.element)).toBe(c.bodyText);
  }, T);

  it.each(Object.entries(CASES))('cas %s : projection', (key, { id, mention }) => {
    const c = comment(...edge(view), id);
    const shown = project(c);
    expect(shown).toBe(mention);
    if (mention === null) {
      // F : le marqueur d'un bloc de code ou d'une citation n'est pas une ligne de marqueur —
      // rien n'est masqué, les deux restent lisibles.
      expect(c.element.querySelector('.cct-hidden-session, .cct-hidden-session-block')).toBeNull();
      expect(count(visible(c.element), MARKER)).toBe(2);
      return;
    }
    // La mention est le dernier enfant du corps, et aucun marqueur ne reste visible.
    expect(c.element.lastElementChild?.className).toBe('cct-session');
    expect(visible(c.element)).not.toContain('[session:');
    if (key === 'H') {
      // Le marqueur précède le pied : masqué là où il est, la mention posée SOUS le pied.
      const text = visible(c.element);
      expect(text.indexOf('A signature footer line.')).toBeLessThan(text.indexOf(MENTION));
    }
  }, T);
});

describe.each(VIEWS)('#164 — vue %s, commentaires réels de #165', (view) => {
  it.each(Object.entries(REAL))('forme %s : marqueur lu tel qu’écrit, puis projeté', (key, { id, marker }) => {
    const c = comment(...real(view), id);
    expect(count(c.bodyText, marker)).toBe(1);
    expect(project(c)).toBe('\u{1F916} session: 37b31afb-3917-4c0b-9e08-0b8e75b93c54');
    expect(visible(c.element)).not.toContain('[session:');
    expect(c.element.lastElementChild?.className).toBe('cct-session');
    if (key === 'H') {
      const text = visible(c.element);
      expect(text.indexOf('Generated by')).toBeLessThan(text.indexOf('session: 37b31afb'));
    }
  }, T);
});
