// L'archive de diagnostic (§9.4) est lue par des outils qu'on ne contrôle pas : l'explorateur
// de fichiers de la personne, celui de qui ouvre l'issue. Un lecteur écrit dans ce dépôt
// confirmerait seulement que l'écrivain et lui se sont trompés de la même façon ; ces tests
// ancrent donc l'archive sur deux références EXTÉRIEURES — les valeurs publiées du CRC-32, et la
// lecture par le module `zipfile` de Python.

import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zip } from '../src/options/zip.js';
import { unzip } from './helpers/unzip.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('CRC-32 du format ZIP', () => {
  it.each([
    ['', 0x00000000],
    // La valeur de contrôle du CRC-32/ISO-HDLC, celle de ZIP et de gzip.
    ['123456789', 0xcbf43926],
    ['The quick brown fox jumps over the lazy dog', 0x414fa339],
  ])('%j', (text, expected) => {
    expect(crc32(bytes(text))).toBe(expected);
  });
});

describe('zip — fichiers stockés, noms en UTF-8', () => {
  const files = [
    { name: 'README.txt', data: bytes('Diagnostic — accents, et « guillemets »\n') },
    { name: 'skeletons/abc-1.txt', data: bytes('body\n div data-testid="x"\n') },
    { name: 'vide.txt', data: new Uint8Array(0) },
  ];

  it('se relit fichier par fichier, CRC compris', () => {
    expect(unzip(zip(files))).toEqual([
      { name: 'README.txt', text: 'Diagnostic — accents, et « guillemets »\n', utf8Flag: true },
      { name: 'skeletons/abc-1.txt', text: 'body\n div data-testid="x"\n', utf8Flag: true },
      { name: 'vide.txt', text: '', utf8Flag: true },
    ]);
  });

  // Un outil tiers, qui n'a rien appris de ce dépôt. Présent sur les machines de la CI ; absent,
  // le test le dit au lieu de passer en silence.
  const python = spawnSync('python3', ['--version']).status === 0;
  it.skipIf(!python)('le module zipfile de Python l’ouvre, et en vérifie chaque CRC', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cct-zip-'));
    try {
      const path = join(dir, 'a.zip');
      writeFileSync(path, zip(files, new Date(2026, 9, 31, 14, 7, 42)));
      const script = [
        'import json, sys, zipfile',
        'z = zipfile.ZipFile(sys.argv[1])',
        'bad = z.testzip()',
        'print(json.dumps({"bad": bad, "files": [[i.filename, i.date_time, z.read(i).decode("utf-8")] for i in z.infolist()]}))',
      ].join('\n');
      const out = JSON.parse(execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }));
      expect(out.bad).toBeNull();
      expect(out.files).toEqual([
        ['README.txt', [2026, 10, 31, 14, 7, 42], 'Diagnostic — accents, et « guillemets »\n'],
        ['skeletons/abc-1.txt', [2026, 10, 31, 14, 7, 42], 'body\n div data-testid="x"\n'],
        ['vide.txt', [2026, 10, 31, 14, 7, 42], ''],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
