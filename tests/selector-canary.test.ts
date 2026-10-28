// Le verdict du canari des sélecteurs, sur des comptes fabriqués : ce qu'il annonce comme une
// chaîne vide, et ce qu'il refuse d'annoncer comme tel.
import { describe, expect, it } from 'vitest';
import { canaryVerdict, GITHUB_CANARY_PAGES } from '../scripts/lib/selector-canary.mjs';
import { selectors } from '../packages/adapters/github/src/selectors.js';

const chains = {
  a: { name: 'chain-a', candidates: ['#new', '.old'] },
  b: { name: 'chain-b', candidates: ['.only'] },
};

describe('canari des sélecteurs — verdict', () => {
  it("retient le PREMIER candidat qui trouve quelque chose, celui qu'emploierait l'adaptateur", () => {
    const { found, empty } = canaryVerdict(chains, ['a'], { a: [0, 3] });
    expect(empty).toEqual([]);
    expect(found).toEqual([{ key: 'a', name: 'chain-a', candidate: '.old', count: 3 }]);
  });

  it("annonce une chaîne dont aucun candidat ne trouve rien, et elle seule", () => {
    const { found, empty } = canaryVerdict(chains, ['a', 'b'], { a: [1, 0], b: [0] });
    expect(found.map((f: { key: string }) => f.key)).toEqual(['a']);
    expect(empty).toEqual([{ key: 'b', name: 'chain-b' }]);
  });

  it("range une chaîne inconnue à part : c'est le canari qui est faux, pas la plateforme", () => {
    const { empty, unknown } = canaryVerdict(chains, ['renamed'], {});
    expect(empty).toEqual([]);
    expect(unknown).toEqual(['renamed']);
  });

  it('ne nomme que des chaînes qui existent dans selectors.ts', () => {
    for (const page of GITHUB_CANARY_PAGES) {
      expect(canaryVerdict(selectors, page.chains, {}).unknown).toEqual([]);
    }
  });
});
