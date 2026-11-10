// @vitest-environment happy-dom
// §4.3, §5.4 — les touches qui publient sur cette plateforme, déclarées par SON adaptateur
// (`submitKeystrokes`, contrat du 2026-11-10). Changer une touche ici ne touche aucune autre
// plateforme : le garde partagé n'en connaît aucune.
import { describe, expect, it } from 'vitest';
import type { EditorHandle } from '@cct/adapter-shared';
import { GithubClientAdapter } from '../src/index.js';

describe('§5.4 — touches d’envoi déclarées', () => {
  it('Ctrl/⌘+Entrée au champ, rien sur les boutons : exactement la règle que le garde partagé appliquait avant la déclaration par plateforme — comportement inchangé', () => {
    const editor = { id: 'e', element: document.createElement('textarea') } as unknown as EditorHandle;
    expect(new GithubClientAdapter({ documentRef: document }).submitKeystrokes(editor)).toEqual({ field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' }], control: [] });
  });
});
