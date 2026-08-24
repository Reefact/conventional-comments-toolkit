// Garde : personne ne lit `configUrl` sur un plancher NON VÉRIFIÉ.
//
// Ce défaut a récidivé aussitôt corrigé. La première passe n'avait migré que le chemin
// d'évaluation principal ; `AdminEntryPoint.dryRun()`, `effectiveConfig()` et
// `probeOrgModeSoftening()` lisaient encore le document brut, et c'est la revue qui l'a
// vu, pas moi. Un correctif au cas par cas ne dit rien du prochain appelant : celui-ci
// échoue à la lecture des sources, donc aussi pour un site qui n'existe pas encore.
//
// La règle : un plancher de version non supportée ne doit désigner AUCUN document
// d'organisation (§8.1.1). `vettedConfigUrl(vetFloor(...))` porte ce verdict ; le lire
// directement sur le plancher le contourne.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;

/** Les sources des deux composants — jamais `core/config/floor.ts`, qui EST la règle. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist' && entry !== 'dist-ext') sourceFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('garde — l’URL de niveau 2 vient toujours du plancher vérifié', () => {
  it('aucune source ne lit `configUrl` sur un plancher brut', () => {
    const roots = [
      join(ROOT, 'packages/server/src'),
      join(ROOT, 'packages/extension/src'),
      join(ROOT, 'packages/core/src'),
    ];
    // `floor.configUrl` / `floor?.configUrl` / `vetted.floor.configUrl` — cette dernière
    // est légitime, elle porte déjà le verdict.
    const raw = /(?<!vetted\.)\bfloor\s*\??\.\s*configUrl/;
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        if (file.endsWith(join('config', 'floor.ts'))) continue; // la définition elle-même
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (raw.test(line)) offenders.push(`${file.slice(ROOT.length)}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
