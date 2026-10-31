// Le rapport de débogage de la page d'options (§9.4, CA-11) : sa forme, indépendamment de la page qui
// le fabrique. Le câblage des boutons est mesuré dans `options-journal.test.ts`.

import { describe, expect, it } from 'vitest';
import { diagnosticArchive, entryReport, type ReportEnvironment } from '../src/options/diagnostic-report.js';
import { compressSkeleton, type StoredSkeleton } from '../src/skeletons.js';
import { unzip } from './helpers/unzip.js';

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
      entry: ENTRY,
    });
  });

  it('l’archive : le README, le journal entier dans l’ordre reçu, et les squelettes désignés', async () => {
    const stored = async (id: string, text: string): Promise<StoredSkeleton> => ({
      id,
      at: '2026-10-30T09:00:00.000Z',
      url: 'https://github.com/acme/demo/pull/7',
      gz: (await compressSkeleton(text))!,
    });
    const second = { chain: 'editors', at: 'x', skeleton: 'k2' };
    const third = { chain: 'comment-body', at: 'y', skeleton: 'evince' };
    const skeletons = [await stored('k2', 'body\n main'), await stored('orphelin', 'body')];

    const { name, bytes } = await diagnosticArchive([ENTRY, second, third], ENV, skeletons, 'LISEZ-MOI');
    const files = unzip(bytes);

    expect(name).toBe('cct-diagnostic-2026-10-30T10-00-00-000Z.zip');
    // Désigné et stocké : présent. Désigné mais évincé (`evince`) : absent, sans erreur.
    // Stocké mais désigné par aucune ligne (`orphelin`) : absent aussi.
    expect(files.map((f) => f.name)).toEqual(['README.txt', 'report.json', 'skeletons/k2.txt']);
    expect(files[0]!.text).toBe('LISEZ-MOI');
    const report = JSON.parse(files[1]!.text);
    expect(report.entries).toEqual([ENTRY, second, third]);
    expect(report.extension).toBe('v1.0.0-beta.17');
    expect(files[2]!.text).toBe('# https://github.com/acme/demo/pull/7\n# 2026-10-30T09:00:00.000Z\nbody\n main\n');
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
