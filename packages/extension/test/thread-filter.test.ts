// @vitest-environment happy-dom
// §5.5 — le filtre par label est un CONTRÔLE, et il vit avec ce qu'il contrôle : en tête
// des fils de discussion, plus dans le bandeau. Ce fichier couvre la barre elle-même ; son
// montage dans la page est couvert par pr-chrome-navigation.test.ts, et le masquage des
// fils par replay-residuals.test.ts.

import { describe, expect, it } from 'vitest';
import { applyLabelFilter, renderThreadFilter } from '../src/ui/thread-filter.js';

function bar(selected: string | null, onSelect: (id: string | null) => void = () => {}): HTMLElement {
  return renderThreadFilter({ labels: ['issue', 'question', 'nitpick'], lang: 'fr', selected, onSelect });
}

function chips(root: HTMLElement): { label: string; pressed: boolean; text: string }[] {
  return [...root.querySelectorAll('.cct-filter-chip')].map((el) => ({
    label: (el as HTMLElement).dataset['label'] ?? '',
    pressed: el.getAttribute('aria-pressed') === 'true',
    text: el.textContent ?? '',
  }));
}

describe('§5.5 — une barre de puces en tête des fils', () => {
  it('propose « tous » puis un label par puce, dans l’ordre reçu', () => {
    expect(chips(bar(null)).map((c) => c.label)).toEqual(['', 'issue', 'question', 'nitpick']);
    expect(chips(bar(null))[0]!.text).toBe('tous');
  });

  it('l’état actif est LU, pas seulement vu (§10) : aria-pressed, jamais la couleur seule', () => {
    const pressed = chips(bar('question')).filter((c) => c.pressed);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.label).toBe('question');
  });

  it('« tous » est la puce active quand aucun label n’est sélectionné', () => {
    const pressed = chips(bar(null)).filter((c) => c.pressed);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.label).toBe('');
  });

  it('le clic remonte le label choisi, et null pour « tous »', () => {
    const seen: (string | null)[] = [];
    const root = bar('issue', (id) => seen.push(id));
    for (const chip of root.querySelectorAll('.cct-filter-chip')) chip.dispatchEvent(new Event('click'));
    expect(seen).toEqual([null, 'issue', 'question', 'nitpick']);
  });

  it('porte un rôle et un nom accessibles — un groupe de contrôles, pas un décor (§10)', () => {
    const root = bar(null);
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-label')).toBe('Filtrer les fils par label');
  });

  it('masque les fils dont le label diffère, et rétablit tout sur « tous »', () => {
    const issue = document.createElement('div');
    const praise = document.createElement('div');
    const rendered = [
      { id: 't1', element: issue },
      { id: 't2', element: praise },
    ];
    const labels = new Map<string, string | null>([
      ['t1', 'issue'],
      ['t2', 'praise'],
    ]);

    applyLabelFilter(rendered, labels, 'issue');
    expect(issue.style.display).toBe('');
    expect(praise.style.display).toBe('none');

    applyLabelFilter(rendered, labels, null);
    expect(praise.style.display).toBe('');
  });

  it('un fil sans label résolu n’est retenu par aucun filtre, mais revient sur « tous »', () => {
    // `analyze()` ne résout rien sur un préfixe non reconnu : le fil n'appartient à aucun
    // label, donc à aucune sélection — le masquer est la seule réponse cohérente, et il ne
    // doit pas rester caché quand le filtre retombe.
    const unlabelled = document.createElement('div');
    const rendered = [{ id: 't1', element: unlabelled }];
    const labels = new Map<string, string | null>([['t1', null]]);

    applyLabelFilter(rendered, labels, 'issue');
    expect(unlabelled.style.display).toBe('none');

    applyLabelFilter(rendered, labels, null);
    expect(unlabelled.style.display).toBe('');
  });
});
