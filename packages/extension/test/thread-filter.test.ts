// @vitest-environment happy-dom
// §5.5 — le filtre par label est un CONTRÔLE, et il vit avec ce qu'il contrôle : en tête
// des fils de discussion, plus dans le bandeau. Ce fichier couvre la barre elle-même ; son
// montage dans la page est couvert par pr-chrome-navigation.test.ts, et le masquage des
// fils par replay-residuals.test.ts.

import { describe, expect, it } from 'vitest';
import { applyLabelFilter, clearLabelFilter, renderThreadFilter } from '../src/ui/thread-filter.js';

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

  it('masque en `!important`, et rend un display en ligne ordinaire sans priorité', () => {
    // GitHub pose `d-block` (`display: block !important`) sur chaque fil : un `display: none`
    // en ligne SANS priorité y perd contre la feuille, et le fil reste affiché alors que
    // l'attribut dit « masqué » (constaté sur la PR #331, vues replié ET déplié). happy-dom ne
    // sait pas rejouer ce duel de cascade ; ce test fige donc la seule chose qui le gagne —
    // la priorité — et `spikes/thread-filter.mjs` mesure le duel dans un vrai Chromium.
    const el = document.createElement('div');
    el.style.display = 'grid';
    const rendered = [{ id: 't1', element: el }];
    const labels = new Map<string, string | null>([['t1', 'praise']]);

    applyLabelFilter(rendered, labels, 'issue');
    expect(el.style.display).toBe('none');
    expect(el.style.getPropertyPriority('display')).toBe('important');

    applyLabelFilter(rendered, labels, null);
    expect(el.style.display).toBe('grid');
    expect(el.style.getPropertyPriority('display')).toBe('');
  });

  it('rend un display en ligne déjà `!important` AVEC sa priorité, sur « tous » comme au nettoyage', () => {
    // Revue de la PR : le marqueur ne gardait que la valeur, et la restauration réaffectait
    // `style.display`, ce qui perdait l'`!important` d'origine — face à `d-block`, le `grid`
    // (ou le `none`) posé par la plateforme revenait battu par la feuille.
    for (const restore of [
      (r: { id: string; element: Element }[], l: Map<string, string | null>) => applyLabelFilter(r, l, null),
      (r: { id: string; element: Element }[]) => clearLabelFilter(r),
    ]) {
      const el = document.createElement('div');
      el.style.setProperty('display', 'grid', 'important');
      const rendered = [{ id: 't1', element: el }];
      const labels = new Map<string, string | null>([['t1', 'praise']]);

      applyLabelFilter(rendered, labels, 'issue');
      expect(el.style.display).toBe('none');
      expect(el.style.getPropertyPriority('display')).toBe('important');

      restore(rendered, labels);
      expect(el.style.display).toBe('grid');
      expect(el.style.getPropertyPriority('display')).toBe('important');
    }
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
