// @vitest-environment happy-dom
// §5.5 — le filtre local masque la CARTE entière d'un fil de l'Overview de GitHub, pas seulement
// ses commentaires (#199). Le `review-thread` ne porte que les commentaires : masqué seul, il
// laissait à l'écran le nom du fichier et le diff, sans commentaire. Sur les captures de la
// section Comments dans ses trois modes : `All` (élément de chronologie), `Unresolved` et `Mine`
// (`article`, Reefact/deskmate#2).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { applyLabelFilter } from '../src/ui/thread-filter.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters', 'github', 'test', 'fixtures', 'pages');
const T = 30_000;

function load(file: string, path: string): { adapter: GithubClientAdapter; doc: Document } {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://github.com${path}`), configurable: true });
  return { adapter: new GithubClientAdapter({ documentRef: doc }), doc };
}

/** Le texte que la page montre encore : les sous-arbres `display: none` en ligne retirés. */
function visibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[style*="display: none"]')) hidden.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ');
}

describe('§5.5 — le filtre masque la carte entière du fil, en-tête de fichier et diff compris (#199)', () => {
  it.each([
    ['03-overview-commentaires-prefixes.html', '/Reefact/just-dummies/pull/548', 'Line 13'], // les deux fils portent sur le même fichier
    ['03-overview-commentaires-prefixes-unresolved.html', '/Reefact/deskmate/pull/2', 'src/Http/ResilientHttpClient.cs'],
    ['03-overview-commentaires-prefixes-mine.html', '/Reefact/deskmate/pull/2', 'src/Http/ResilientHttpClient.cs'],
  ])('%s : label choisi, puis retour à « tous »', (file, path, firstMarker) => {
    const { adapter, doc } = load(file, path);
    const rendered = adapter.getRenderedThreadElements();
    expect(rendered).toHaveLength(2);
    const [first, second] = rendered as [(typeof rendered)[0], (typeof rendered)[0]];
    const labels = new Map<string, string | null>([
      [first.id, 'question'],
      [second.id, 'issue'],
    ]);
    const main = doc.querySelector('#overview-comments')!.closest('section')!;
    expect(visibleText(main)).toContain(firstMarker);

    applyLabelFilter(rendered, labels, 'issue');
    // Le fil écarté disparaît avec son en-tête (fichier, ligne) ; l'autre reste entier.
    expect(visibleText(main)).not.toContain(firstMarker);
    expect(visibleText(second.element)).toContain('Line');

    applyLabelFilter(adapter.getRenderedThreadElements(), labels, null);
    expect(visibleText(main)).toContain(firstMarker);
    expect((first.element as HTMLElement).style.display).toBe('');
  }, T);
});

describe('§5.5 — une carte qui porterait DEUX fils n’est jamais masquée (#199)', () => {
  // Jamais vu sur les captures : un garde, pour que masquer un fil ne cache pas son voisin.
  it('le fil reste l’élément masqué', () => {
    const doc = new DOMParser().parseFromString(
      `<div data-testid="timeline-item">
         <div data-testid="review-thread" id="a">issue: a</div>
         <div data-testid="review-thread" id="b">question: b</div>
       </div>`,
      'text/html'
    );
    Object.defineProperty(doc, 'location', { value: new URL('https://github.com/acme/demo/pull/1'), configurable: true });
    const rendered = new GithubClientAdapter({ documentRef: doc }).getRenderedThreadElements();
    expect(rendered.map((t) => t.element.id)).toEqual(['a', 'b']);
  });
});
