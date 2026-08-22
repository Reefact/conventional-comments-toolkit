import { describe, expect, it } from 'vitest';
import { computeIndicators } from '../src/compliance/indicators.js';
import type { IndicatorSample } from '../src/compliance/storage.js';

function sample(overrides: Partial<IndicatorSample>): IndicatorSample {
  return {
    repoKey: 'r',
    prKey: 'r#1',
    at: '2026-10-05T00:00:00Z',
    compliantComments: 0,
    nonCompliantComments: 0,
    warnings: 0,
    serviceAccountComments: 0,
    labelDistribution: {},
    decisionsInBlockingThreads: 0,
    unresolvedBlockingThreads: 0,
    ...overrides,
  };
}

describe('§12 — indicateurs de suivi', () => {
  it('taux de conformité par commentaire, comptes de service exclus', () => {
    const ind = computeIndicators([
      sample({ prKey: 'r#1', compliantComments: 9, nonCompliantComments: 1, serviceAccountComments: 5 }),
    ]);
    expect(ind.complianceRate).toBeCloseTo(0.9); // 9 / (9+1), les bots exclus
    expect(ind.serviceAccountShare).toBeCloseTo(5 / 15);
    expect(ind.totalHumanComments).toBe(10);
  });

  it('taux d’avertissement suivi séparément (§12)', () => {
    const ind = computeIndicators([
      sample({ prKey: 'r#1', compliantComments: 10, nonCompliantComments: 0, warnings: 4 }),
    ]);
    expect(ind.complianceRate).toBe(1); // que des avertissements → conforme
    expect(ind.warningRate).toBeCloseTo(0.4);
  });

  it('n’agrège que le dernier échantillon par PR — pas de double comptage entre tours', () => {
    const ind = computeIndicators([
      sample({ prKey: 'r#1', at: '2026-10-05T00:00:00Z', compliantComments: 2, nonCompliantComments: 8 }),
      sample({ prKey: 'r#1', at: '2026-10-06T00:00:00Z', compliantComments: 9, nonCompliantComments: 1 }),
    ]);
    expect(ind.complianceRate).toBeCloseTo(0.9); // le tour le plus récent seulement
  });

  it('répartition par label agrégée ; decisions comptées', () => {
    const ind = computeIndicators([
      sample({ prKey: 'r#1', labelDistribution: { issue: 3, praise: 0 }, decisionsInBlockingThreads: 2 }),
      sample({ prKey: 'r#2', labelDistribution: { issue: 1, note: 2 } }),
    ]);
    expect(ind.labelDistribution).toEqual({ issue: 4, praise: 0, note: 2 });
    expect(ind.decisionsInBlockingThreads).toBe(2);
  });

  it('sans commentaire humain, les taux valent null (pas 0)', () => {
    const ind = computeIndicators([sample({ serviceAccountComments: 3 })]);
    expect(ind.complianceRate).toBeNull();
    expect(ind.warningRate).toBeNull();
  });
});
