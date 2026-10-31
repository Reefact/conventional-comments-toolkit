// @vitest-environment happy-dom
// Le relevé de page d'une ligne du journal (§9.4) : ce qu'il y avait à la place de ce qu'on
// cherchait. Ces tests bâtissent leur DOM à la main : ils jugent ce que le relevé EXTRAIT d'une
// structure donnée, pas ce que GitHub rend — c'est l'affaire des pages capturées de l'adaptateur.

import { describe, expect, it } from 'vitest';
import { pageSkeleton, printElement, selectorEvidence, selectorSteps, traceCandidates } from '../src/evidence.js';

function page(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
}

describe('selectorSteps — un préfixe par sélecteur composé', () => {
  it.each([
    ['button', ['button']],
    ['a b', ['a', 'a b']],
    ['a > b  c', ['a', 'a > b', 'a > b  c']],
    ['a>b', ['a', 'a>b']],
    ['a + b ~ c', ['a', 'a + b', 'a + b ~ c']],
    // Ni un espace entre crochets, ni dans des guillemets, ni dans `:not(…)` ne coupe.
    ['[data-x="a b"] button:not(.c d)', ['[data-x="a b"]', '[data-x="a b"] button:not(.c d)']],
    ['[class~="x"] y', ['[class~="x"]', '[class~="x"] y']],
    // Une liste de sélecteurs n'a pas de préfixe qui veuille dire quelque chose.
    ['a b, c d', ['a b, c d']],
  ])('%s', (selector, steps) => {
    expect(selectorSteps(selector)).toEqual(steps);
  });
});

describe('traceCandidates — jusqu’où chaque candidat trouve quelque chose', () => {
  const doc = page(`
    <div data-testid="mergebox-partial">
      <div data-component="ButtonGroup"><button data-variant="default">Merge</button></div>
    </div>`);

  it('dit à quel sélecteur composé la recherche s’arrête', () => {
    const trace = traceCandidates(doc, [
      '[data-testid="mergebox-partial"] [data-component="ButtonGroup"] button[data-variant="primary"]',
      '.merge-message button.btn-group-merge',
    ]);
    expect(trace.map((t) => t.steps)).toEqual([
      [1, 1, 0],
      [0, 0],
    ]);
  });

  it('compte -1 pour un préfixe que le navigateur refuse, sans lever', () => {
    expect(traceCandidates(doc, ['button:::nope'])[0]!.steps).toEqual([-1]);
  });
});

describe('selectorEvidence — l’ancêtre atteint, et ce qu’il contient à la place', () => {
  it('relève les boutons sous l’ancêtre le plus profond, avec leur libellé et leur variante', () => {
    const doc = page(`
      <div data-testid="mergebox-partial">
        <div data-component="ButtonGroup">
          <button data-variant="default" disabled>  Merge
             when ready </button>
        </div>
      </div>`);
    const evidence = selectorEvidence(doc, [
      '[data-testid="mergebox-partial"] [data-component="ButtonGroup"] button[data-variant="primary"]',
    ]);
    expect(evidence.subject).toBeUndefined();
    expect(evidence.anchor).toMatchObject({ tag: 'div', attrs: { 'data-component': 'ButtonGroup' } });
    expect(evidence.nearby).toEqual([
      {
        tag: 'button',
        attrs: { 'data-variant': 'default', disabled: '' },
        label: 'Merge when ready',
        ancestors: ['div[data-component="ButtonGroup"]', 'div[data-testid="mergebox-partial"]'],
      },
    ]);
  });

  it('sans aucun ancêtre atteint : la trace seule, ni ancêtre ni voisins', () => {
    const evidence = selectorEvidence(page('<p>rien</p>'), ['.a .b']);
    expect(evidence).toEqual({ trace: [{ candidate: '.a .b', steps: [0, 0] }] });
  });

  it('cherché dans un élément, le relevé le nomme', () => {
    const doc = page('<div data-testid="review-thread" id="thread-123456"><p>texte</p></div>');
    const thread = doc.querySelector('[data-testid="review-thread"]')!;
    const evidence = selectorEvidence(thread, ['.comment-body']);
    expect(evidence.subject).toEqual({ tag: 'div', attrs: { id: 'thread-#', 'data-testid': 'review-thread' } });
  });
});

describe('printElement — l’interface, jamais le contenu', () => {
  it('ne lit ni la valeur d’un champ, ni son texte, ni celui d’un élément qui n’est pas un bouton', () => {
    const doc = page(`
      <form action="/comments/issues?token=secret">
        <input name="issue[title]" value="praise: un commentaire privé">
        <textarea id="convert-to-issue-body-6442405642" name="issue[body]" aria-label="Issue body">texte privé</textarea>
        <a role="link" href="#">lien privé</a>
      </form>`);
    const prints = [...doc.querySelectorAll('input, textarea, a')].map(printElement);
    const json = JSON.stringify(prints);
    expect(json).not.toContain('privé');
    expect(json).not.toContain('secret');
    expect(prints[1]).toEqual({
      tag: 'textarea',
      attrs: { id: 'convert-to-issue-body-#', name: 'issue[body]', 'aria-label': 'Issue body' },
      ancestors: ['form[action="/comments/issues"]'],
    });
  });

  it('masque les empreintes hexadécimales, et borne les classes', () => {
    const doc = page(
      '<textarea id="new_inline_comment_diff-b4a859224d8b10404706a2_4397910058_" class="a b c d e f g h"></textarea>'
    );
    expect(printElement(doc.querySelector('textarea')!).attrs).toEqual({
      id: 'new_inline_comment_diff-#_#_',
      class: 'a b c d e f',
    });
  });

  it('ne retient que les ancêtres qui portent une marque, quatre au plus', () => {
    const doc = page(`
      <details-dialog aria-label="Reference in new issue"><div><div role="group"><section id="s1">
        <div data-testid="t"><div data-component="C"><div><button>OK</button></div></div></div>
      </section></div></div></details-dialog>`);
    expect(printElement(doc.querySelector('button')!).ancestors).toEqual([
      'div[data-component="C"]',
      'div[data-testid="t"]',
      'section[id="s1"]',
      'div[role="group"]',
    ]);
  });
});

describe('pageSkeleton — tout l’arbre, réduit à l’interface', () => {
  it('un élément par ligne, indenté par sa profondeur, attributs de la liste fermée seulement', () => {
    const doc = page(`
      <div data-testid="mergebox-partial" style="color: red" onclick="x()">
        <button data-variant="primary" title="t">Merge</button>
        <svg aria-hidden="true"><path d="M0 0L10 10"></path></svg>
      </div>`);
    expect(pageSkeleton(doc.body)).toBe(
      [
        'body',
        ' div data-testid="mergebox-partial"',
        '  button data-variant="primary" «Merge»',
        // Le dessin d'une icône n'est pas parcouru.
        '  svg',
      ].join('\n')
    );
  });

  it('ne garde ni valeur, ni texte de champ ou de commentaire, ni script', () => {
    const doc = page(`
      <form action="/comments/issues?token=secret">
        <input name="issue[title]" value="praise: un commentaire privé">
        <textarea name="issue[body]">texte privé</textarea>
        <p class="comment-body">commentaire privé</p>
        <script>window.csrf = "secret"</script>
      </form>`);
    const skeleton = pageSkeleton(doc.body);
    expect(skeleton).not.toContain('privé');
    expect(skeleton).not.toContain('secret');
    expect(skeleton).toContain(' form action="/comments/issues"');
    expect(skeleton).not.toContain('script');
  });

  it('résume la suite d’un parent trop long, et s’arrête au plafond d’éléments', () => {
    const doc = page(`<table><tbody>${'<tr><td></td></tr>'.repeat(5)}</tbody></table>`);
    const rows = pageSkeleton(doc.body, { maxChildren: 2, maxElements: 100 }).split('\n');
    expect(rows.filter((r) => r.trim() === 'tr')).toHaveLength(2);
    expect(rows).toContain('   … +3');

    const capped = pageSkeleton(doc.body, { maxChildren: 100, maxElements: 4 }).split('\n');
    expect(capped).toHaveLength(5);
    expect(capped.at(-1)).toBe('… 4+');
  });
});
