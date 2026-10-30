// Le rapport de débogage de la page d'options (§9.4) : sa forme, indépendamment de la page qui
// le fabrique. Le câblage des boutons est mesuré dans `options-journal.test.ts`.

import { describe, expect, it } from 'vitest';
import { entryReport, journalReport, type ReportEnvironment } from '../src/options/diagnostic-report.js';

const ENV: ReportEnvironment = {
  extension: 'v1.0.0-beta.17',
  browser: 'Mozilla/5.0 (test)',
  language: 'en',
  degradedState: null,
  generatedAt: '2026-10-30T10:00:00.000Z',
};

const ENTRY = { chain: 'merge-button', at: '2026-10-30T09:00:00.000Z', candidates: ['.a', '.b'], count: 2 };

describe('§9.4 — le rapport de débogage', () => {
  it('une ligne : un bloc json, l’environnement puis l’entrée telle quelle', () => {
    const report = entryReport(ENTRY, ENV);

    expect(report.startsWith('```json\n')).toBe(true);
    expect(report.endsWith('\n```')).toBe(true);
    expect(JSON.parse(report.slice('```json\n'.length, -'\n```'.length))).toEqual({
      extension: 'v1.0.0-beta.17',
      browser: 'Mozilla/5.0 (test)',
      language: 'en',
      degradedState: null,
      generatedAt: '2026-10-30T10:00:00.000Z',
      selectorFailure: ENTRY,
    });
  });

  it('le journal : toutes les lignes, dans l’ordre reçu', () => {
    const second = { chain: 'editors', at: 'x' };
    const report = journalReport([ENTRY, second], ENV);
    const parsed = JSON.parse(report.slice('```json\n'.length, -'\n```'.length));

    expect(parsed.selectorFailures).toEqual([ENTRY, second]);
  });

  it('une version absente reste visible comme `null`, pas omise', () => {
    const report = entryReport(ENTRY, { ...ENV, extension: null });

    expect(report).toContain('"extension": null');
  });

  it('la clôture est plus longue que toute suite d’accents graves du contenu', () => {
    const report = entryReport({ chain: 'x', at: 'y', candidates: ['a[title="````"]'] }, ENV);

    expect(report.startsWith('`````json\n')).toBe(true);
    expect(report.endsWith('\n`````')).toBe(true);
  });
});
