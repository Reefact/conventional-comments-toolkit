// Le garde `check:bundle-isolation` mis en échec sur des listes fabriquées. Sa première version
// ignorait les modules imbriqués d'un adaptateur (`dist/ui/editor.js`), et restait vert sur la
// violation qu'il existe pour voir (revue Reefact, PR #76).
import { describe, expect, it } from 'vitest';
import { forbiddenAdapterInputs } from '../scripts/lib/bundle-isolation.mjs';

const ids = ['azdo', 'github'];

describe('§9.1 — le service worker et la page d’options n’embarquent que des fiches', () => {
  it('refuse un module imbriqué d’un adaptateur', () => {
    expect(forbiddenAdapterInputs(['packages/adapters/github/dist/ui/editor.js'], ids)).toEqual([
      'packages/adapters/github/dist/ui/editor.js',
    ]);
  });

  it('refuse l’adaptateur lui-même, en dist comme en src', () => {
    const inputs = ['packages/adapters/azdo/dist/index.js', 'packages/adapters/github/src/selectors.ts'];
    expect(forbiddenAdapterInputs(inputs, ids)).toEqual(inputs);
  });

  it('admet la fiche à la racine, et elle seule', () => {
    expect(forbiddenAdapterInputs(['packages/adapters/github/dist/descriptor.js', 'packages/adapters/azdo/src/descriptor.ts'], ids)).toEqual([]);
    expect(forbiddenAdapterInputs(['packages/adapters/github/dist/ui/descriptor.js'], ids)).toEqual([
      'packages/adapters/github/dist/ui/descriptor.js',
    ]);
  });

  it('ignore le paquet partagé et ce qui n’est pas une plateforme', () => {
    expect(forbiddenAdapterInputs(['packages/adapters/shared/dist/index.js', 'packages/core/dist/index.js'], ids)).toEqual([]);
  });
});
