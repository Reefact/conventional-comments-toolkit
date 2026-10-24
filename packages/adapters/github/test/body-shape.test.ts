// @vitest-environment happy-dom
// §5.5 — la forme du corps rendu est une AFFIRMATION de l'adaptateur (§9.2.3), et celle de
// GitHub est une mesure : `<p>` pour une ligne de Markdown ordinaire, `<br>` pour une fin de
// ligne simple (MESURÉ à plusieurs reprises sur github.com). Elle a vécu dans le paquet partagé
// sous un nom générique, offerte à toute plateforme comme défaut ; ce test la fixe là où elle
// vit désormais, pour que les tests de badges qui s'appuient sur une forme `<p>`/`<br>` ne
// changent pas de sens en silence si elle dérivait.
import { describe, expect, it } from 'vitest';
import { GITHUB_BODY_SHAPE, GithubClientAdapter } from '../src/index.js';

describe('§5.5 / §9.2.3 — la forme mesurée de GitHub', () => {
  it('vaut <p> pour le paragraphe et <br> pour la fin de ligne', () => {
    expect(GITHUB_BODY_SHAPE.paragraphTags).toEqual(['P']);
    expect(GITHUB_BODY_SHAPE.lineBreakTag).toBe('BR');
  });

  it('est ce que l’adaptateur répond, et non un défaut du code partagé', () => {
    expect(new GithubClientAdapter({ documentRef: document }).renderedBodyShape()).toBe(GITHUB_BODY_SHAPE);
  });
});
