// @vitest-environment happy-dom
// §4.3, §5.4 — les touches qui publient sur cette plateforme, déclarées par SON adaptateur
// (`submitKeystrokes`, contrat du 2026-11-10). Changer une touche ici ne touche aucune autre
// plateforme : le garde partagé n'en connaît aucune.
import { describe, expect, it } from 'vitest';
import type { EditorHandle } from '@cct/adapter-shared';
import { AzdoClientAdapter } from '../src/index.js';

describe('§5.4 — touches d’envoi déclarées', () => {
  it('Ctrl/⌘+Entrée au champ ; Entrée, Ctrl+Entrée et Espace sur un bouton d’envoi, MESURÉS le 2026-11-10 (le bouton publie sur la touche, sans `click`)', () => {
    const editor = { id: 'e', element: document.createElement('textarea') } as unknown as EditorHandle;
    expect(new AzdoClientAdapter({ documentRef: document }).submitKeystrokes(editor)).toEqual({
      field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' }],
      control: [
        { key: 'Enter', modifiers: 'any' },
        { key: ' ', modifiers: 'any' },
      ],
    });
  });
});
