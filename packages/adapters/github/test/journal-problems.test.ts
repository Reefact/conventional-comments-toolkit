// Ce que le journal sait dire d'une dégradation GitHub (§9.4, CA-11) : toute chaîne que cet
// adaptateur PEUT journaliser déclare à quoi elle sert.
//
// La page d'options affiche alors « Bouton de fusion introuvable : impossible de le griser » au
// lieu de `merge-button`. Une chaîne qui journalise sans le déclarer retombe sur son nom — la
// page marche, mais redit exactement ce que la personne ne comprenait pas.
//
// La liste des chaînes à annoter n'est PAS écrite ici : elle se lit dans les appels de
// `log.degraded()` de l'adaptateur. Une énumération se périme, ce dépôt en a déjà corrigé
// plusieurs ; un appel ajouté demain sans clé fait échouer ce test.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SELECTOR_PROBLEMS, type SelectorChain } from '@cct/adapter-shared';
import { selectors } from '../src/selectors.js';
import { ALL_EDITORS, SURFACES } from '../src/surfaces.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '../src/index.ts'), 'utf8');

const known = (chain: SelectorChain | undefined): chain is SelectorChain =>
  chain !== undefined && (SELECTOR_PROBLEMS as readonly string[]).includes(chain.problem ?? '');

describe('§9.4 — GitHub : chaque chaîne journalisée dit à quoi elle sert', () => {
  // `this.#degraded(selectors.mergeButton)`, `this.#degraded(ALL_EDITORS, this.#doc, { … })`…
  // — et l'appel à `log.degraded(chain, …)` que fait `#degraded` lui-même, par variable. Les
  // arguments qui suivent la chaîne (racine, relevé) ne changent rien à ce qui est journalisé.
  const calls = [...SOURCE.matchAll(/(?:\.log\.degraded|this\.#degraded)\(\s*([A-Za-z_.]+)\s*[,)]/g)].map((m) => m[1]!);

  /** L'expression passée à `degraded()`, résolue vers la chaîne qu'elle désigne. */
  const resolve = (expression: string): SelectorChain | undefined => {
    if (expression === 'ALL_EDITORS') return ALL_EDITORS;
    if (expression.startsWith('selectors.')) {
      return (selectors as Record<string, SelectorChain | undefined>)[expression.slice('selectors.'.length)];
    }
    return undefined;
  };

  it('l’adaptateur appelle bien `degraded()` — sinon ce test ne vérifierait rien', () => {
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });

  it.each([...new Set(calls)])('%s déclare sa fonction', (expression) => {
    // Un appel dont l'argument n'est ni `selectors.<x>` ni `ALL_EDITORS` est une variable : voir
    // le test suivant, qui nomme celles qu'il couvre. Ici, il n'y a rien à résoudre.
    if (resolve(expression) === undefined) return;
    expect(known(resolve(expression)), expression).toBe(true);
  });

  // `degraded(chain)` sur une variable : `#degraded` lui-même, qui relaie la chaîne qu'on lui
  // passe, et la boucle sur les châssis de chaque surface — les deux sous le même nom. L'attendre ici nomme ce que ce test ne lit pas dans les appels — et si un autre
  // appel par variable apparaît, la liste des inconnus change et ce test échoue avec lui.
  it('les appels par variable sont connus, et leurs chaînes aussi', () => {
    const byVariable = [...new Set(calls)].filter((expression) => resolve(expression) === undefined);
    expect(byVariable).toEqual(['chain']);

    const frames = SURFACES.flatMap((s) => [s.composerFrame, s.composerFrameOnField]).filter(
      (c): c is SelectorChain => c !== null && c !== undefined
    );
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) expect(known(frame), frame.name).toBe(true);
  });
});
