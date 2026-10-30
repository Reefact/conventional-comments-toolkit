// Ce que le journal sait dire d'une dégradation Azure DevOps (§9.4, CA-11) : toute chaîne que cet
// adaptateur PEUT journaliser déclare à quoi elle sert. Même garde que celui de GitHub, et même
// raison — voir `packages/adapters/github/test/journal-problems.test.ts`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SELECTOR_PROBLEMS, type SelectorChain } from '@cct/adapter-shared';
import { selectors } from '../src/selectors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '../src/index.ts'), 'utf8');

describe('§9.4 — Azure DevOps : chaque chaîne journalisée dit à quoi elle sert', () => {
  const calls = [...SOURCE.matchAll(/\.log\.degraded\(\s*([A-Za-z_.]+)\s*\)/g)].map((m) => m[1]!);

  it('l’adaptateur appelle bien `degraded()` — sinon ce test ne vérifierait rien', () => {
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it.each([...new Set(calls)])('%s déclare sa fonction', (expression) => {
    // Seul `selectors.<x>` est lu ici : un appel d'une autre forme doit faire échouer ce test,
    // pas passer en silence.
    expect(expression.startsWith('selectors.'), `forme d'appel inconnue : ${expression}`).toBe(true);
    const chain = (selectors as Record<string, SelectorChain | undefined>)[expression.slice('selectors.'.length)];
    expect(chain, expression).toBeDefined();
    expect(SELECTOR_PROBLEMS as readonly string[]).toContain(chain!.problem);
  });
});
