import { describe, expect, it } from 'vitest';
import { computePrefixInsertion } from '@cct/adapter-shared';

describe('§5.1 / CA-02 — insertion et remplacement de préfixe', () => {
  it('CA-02 : clic todo sur "issue (blocking): le nom est ambigu" conserve décoration et sujet', () => {
    // `decorations` OMIS = « je ne me prononce pas », ce que la barre envoie quand on clique
    // un label sans avoir touché au sélecteur. C'est ce cas-là que CA-02 décrit. Un `[]`
    // explicite dit désormais « aucune » et RETIRE la décoration : les deux sens vivaient
    // auparavant dans la même valeur, et « conserver » l'emportait toujours.
    const { nextValue, caret } = computePrefixInsertion('issue (blocking): le nom est ambigu', {
      label: 'todo',
    });
    expect(nextValue).toBe('todo (blocking): le nom est ambigu');
    // Curseur en fin de préfixe (§5.1).
    expect(nextValue.slice(0, caret)).toBe('todo (blocking): ');
  });

  it('remplace le label en apportant une nouvelle décoration', () => {
    const { nextValue } = computePrefixInsertion('issue (blocking): sujet', {
      label: 'suggestion',
      decorations: ['non-blocking'],
    });
    expect(nextValue).toBe('suggestion (non-blocking): sujet');
  });

  it('insère un préfixe sans détruire le texte déjà saisi', () => {
    const { nextValue, caret, delta } = computePrefixInsertion('le nom est ambigu', {
      label: 'issue',
      decorations: [],
    });
    expect(nextValue).toBe('issue: le nom est ambigu');
    expect(caret).toBe('issue: '.length);
    expect(delta).toBe('issue: '.length);
  });

  it('second clic sur un label déjà actif : retrait (toggle, §5.1)', () => {
    const { nextValue, removed } = computePrefixInsertion('issue: le nom est ambigu', {
      label: 'issue',
      decorations: [],
    }, { toggle: true });
    expect(removed).toBe(true);
    expect(nextValue).toBe('le nom est ambigu');
  });

  it('le delta permet de restaurer une sélection décalée (§5.1, CA-02)', () => {
    // "issue: " (7) → "todo: " (6) : delta = -1.
    const { delta } = computePrefixInsertion('issue: le nom est ambigu', { label: 'todo', decorations: [] });
    expect(delta).toBe('todo: '.length - 'issue: '.length);
  });
});
