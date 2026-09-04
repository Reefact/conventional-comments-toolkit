// @vitest-environment happy-dom
//
// LE JOURNAL DE DÉGRADATION DE SÉLECTEURS (§9.4, CA-11) — et pourquoi il était aveugle.
//
// `getCompletionControl()` journalise dès qu'il ne trouve pas le bouton de fusion, et il est
// appelé à chaque mutation du DOM. Sur une PR FERMÉE, où l'absence de ce bouton est la norme
// et non une pourriture de sélecteur, une seule visite écrivait des dizaines d'entrées
// identiques. Le journal étant plafonné à 50 lignes, une PR fusionnée le remplissait
// intégralement de `merge-button` et évinçait toute vraie dégradation : l'outil censé révéler
// qu'un sélecteur a pourri ne montrait plus que le bruit.
//
// Constaté sur une page réelle (PR #45 du dépôt, fusionnée) : deux rafales de plus de
// quarante entrées `merge-button` en neuf secondes, puis à nouveau au rechargement suivant.
//
// La question à laquelle ce journal répond est « QUELS sélecteurs ont échoué, et quand pour la
// dernière fois » — jamais « combien de fois » : un compte dicté par le rythme des mutations
// de la page ne mesure rien. Deux bornes, à deux portées différentes, et il faut les deux :
// `SelectorLog` borne UN onglet (et avec lui la remontée télémétrique), `appendToJournal`
// borne le journal PARTAGÉ, qu'alimentent plusieurs onglets et plusieurs rechargements.

import { describe, expect, it, vi } from 'vitest';
import { SelectorLog } from '@cct/adapter-shared';
import { appendToJournal } from '../src/storage.js';

const chain = (name: string) => ({ name, candidates: ['.absent'] });

describe('§9.4 — un onglet ne journalise qu’une fois par chaîne', () => {
  it('vingt appels sur la même chaîne : une entrée, et une seule remontée télémétrique', () => {
    const telemetry = vi.fn();
    const log = new SelectorLog(telemetry);

    for (let i = 0; i < 20; i++) log.degraded(chain('merge-button'));

    expect(log.failures).toHaveLength(1);
    expect(log.failures[0]!.chain).toBe('merge-button');
    expect(telemetry).toHaveBeenCalledTimes(1);
  });

  // Ce qui compte est préservé : deux sélecteurs pourris restent DEUX lignes.
  it('deux chaînes distinctes restent deux entrées', () => {
    const log = new SelectorLog();
    log.degraded(chain('merge-button'));
    log.degraded(chain('repository-public-meta'));
    log.degraded(chain('merge-button'));

    expect(log.failures.map((f) => f.chain)).toEqual(['merge-button', 'repository-public-meta']);
  });
});

describe('§9.4 — le journal partagé garde une ligne par chaîne, la plus récente', () => {
  /** Aire de stockage minimale : `get`/`set` sur un objet, comme `chrome.storage.local`. */
  function fakeArea(initial: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = { ...initial };
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (keys: string[], cb: (items: Record<string, unknown>) => void) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in store) out[k] = store[k];
            cb(out);
          },
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(store, items);
            cb?.();
          },
        },
      },
    };
    return store;
  }

  it('une chaîne déjà présente est REMPLACÉE, pas ajoutée', async () => {
    const store = fakeArea({
      selectorFailures: [
        { chain: 'merge-button', at: '2026-09-04T08:58:23.250Z' },
        { chain: 'repository-public-meta', at: '2026-09-04T08:58:24.000Z' },
      ],
    });

    await appendToJournal(
      'selectorFailures',
      [{ chain: 'merge-button', at: '2026-09-04T09:10:33.983Z' }],
      50,
      (e) => e.chain
    );
    delete (globalThis as { chrome?: unknown }).chrome;

    expect(store['selectorFailures']).toEqual([
      { chain: 'repository-public-meta', at: '2026-09-04T08:58:24.000Z' },
      { chain: 'merge-button', at: '2026-09-04T09:10:33.983Z' }, // la dernière occurrence
    ]);
  });

  // Cinquante rechargements d'une PR fermée ne doivent plus rien évincer.
  it('cinquante passages sur la même chaîne ne remplissent pas le journal', async () => {
    const store = fakeArea({ selectorFailures: [{ chain: 'thread-container', at: 'ancien' }] });

    for (let i = 0; i < 50; i++) {
      await appendToJournal('selectorFailures', [{ chain: 'merge-button', at: `t${i}` }], 50, (e) => e.chain);
    }
    delete (globalThis as { chrome?: unknown }).chrome;

    const entries = store['selectorFailures'] as { chain: string; at: string }[];
    expect(entries).toHaveLength(2); // la vraie dégradation a survécu
    expect(entries[0]).toEqual({ chain: 'thread-container', at: 'ancien' });
    expect(entries[1]).toEqual({ chain: 'merge-button', at: 't49' });
  });

  // Sans clé de déduplication, le comportement d'avant est intact : le journal est générique,
  // et cette clause ne doit rien changer pour un appelant qui ne la demande pas.
  it('sans `dedupeBy`, les entrées s’empilent comme avant', async () => {
    const store = fakeArea({ selectorFailures: [{ chain: 'a', at: '1' }] });

    await appendToJournal('selectorFailures', [{ chain: 'a', at: '2' }], 50);
    delete (globalThis as { chrome?: unknown }).chrome;

    expect(store['selectorFailures']).toEqual([
      { chain: 'a', at: '1' },
      { chain: 'a', at: '2' },
    ]);
  });
});
