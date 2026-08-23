// Garde-fou du piège récurrent (CLAUDE.md) : les caractères invisibles s'écrivent
// TOUJOURS en échappements \uXXXX dans les sources et les tests — jamais en littéral.
// Un BOM ou un ZWJ littéral se relit mal, se copie mal, et se perd silencieusement au
// premier outil qui normalise ; les tests du §3.4.1 en dépendent point de code par point
// de code. Ce script ne juge que les fichiers de code, jamais la spécification ni les
// documents Markdown, qui contiennent légitimement ces caractères comme sujet d'étude.
//
// Usage : node scripts/check-invisible-chars.mjs   (sort 1 si une violation subsiste)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Répertoires scannés : code de production, tests, spike. */
const SCANNED = ['packages', 'tests', 'spikes', 'scripts'];
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'dist-ext', '.git', 'coverage']);
const SCANNED_EXT = ['.ts', '.tsx', '.mjs', '.js', '.json', '.html'];

/** Les points de code visés, nommés — le message doit dire lequel et où. */
const FORBIDDEN = new Map([
  [0xfeff, 'BOM / ZWNBSP'],
  [0x00a0, 'NBSP'],
  [0x202f, 'NNBSP'],
  [0xfe0f, 'VARIATION SELECTOR-16'],
  [0xfe0e, 'VARIATION SELECTOR-15'],
  [0x200b, 'ZWSP'],
  [0x200c, 'ZWNJ'],
  [0x200d, 'ZWJ'],
  [0x2060, 'WORD JOINER'],
  [0x2028, 'LINE SEPARATOR'],
  [0x2029, 'PARAGRAPH SEPARATOR'],
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SCANNED_EXT.some((e) => entry.endsWith(e))) yield full;
  }
}

const violations = [];
let scanned = 0;
for (const base of SCANNED) {
  const dir = join(ROOT, base);
  try {
    statSync(dir);
  } catch {
    continue; // répertoire absent : rien à scanner
  }
  for (const file of walk(dir)) {
    scanned++;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const ch of line) {
        const name = FORBIDDEN.get(ch.codePointAt(0));
        if (name === undefined) continue;
        const hex = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        violations.push(`${relative(ROOT, file)}:${i + 1}: ${name} littéral (U+${hex}) — écrire \\u${hex}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`✗ ${violations.length} caractère(s) invisible(s) littéral(aux) dans ${scanned} fichiers :\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nRègle : CLAUDE.md — « les caractères invisibles s’écrivent TOUJOURS en échappements ».');
  process.exit(1);
}
console.log(`✓ aucun caractère invisible littéral (${scanned} fichiers scannés)`);
