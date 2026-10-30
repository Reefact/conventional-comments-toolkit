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
// La question à laquelle ce journal répond est « QUELS sélecteurs ont échoué, et à quel
// chargement de page pour la dernière fois » — jamais « combien de fois » : un compte dicté par
// le rythme des mutations de la page ne mesure rien. L'horodatage est celui de la première
// dégradation de la chaîne DANS SON ONGLET : un onglet ouvert des heures le garde, le chargement
// suivant le remplace (revue Reefact, PR #48). Le rafraîchir en continu rendrait une écriture de
// stockage par mutation du DOM — la churn même que ces bornes existent pour supprimer.
//
// Deux bornes, à deux portées différentes, et il faut les deux :
// `SelectorLog` borne UN onglet (et avec lui la remontée télémétrique), `appendToJournal`
// borne le journal PARTAGÉ, qu'alimentent plusieurs onglets et plusieurs rechargements.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectorLog } from '@cct/adapter-shared';
import { appendToJournal, updateJournalEntry } from '../src/storage.js';
import { mergeJournalEntry, entryKey, markRecovered, type JournalEntry, type SelectorFailure } from '../src/journal-entry.js';

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

  // L'oubli sert à RESIGNALER, jamais à faire enfler la mémoire de l'onglet.
  it('après un oubli, la chaîne resignale — mais son entrée est rafraîchie, pas dupliquée', async () => {
    const telemetry = vi.fn();
    const log = new SelectorLog(telemetry);

    log.degraded(chain('merge-button'));
    const first = log.failures[0]!.at;
    await new Promise((r) => setTimeout(r, 2)); // l'horodatage doit pouvoir changer

    // Ce que fait l'onglet en changeant de PR, ou la page d'options en effaçant le journal.
    log.forgetSeen();
    log.degraded(chain('merge-button'));

    // Resignalé — c'est la raison d'être de l'oubli…
    expect(telemetry).toHaveBeenCalledTimes(2);
    // …mais `failures` reste borné par le NOMBRE DE CHAÎNES, pas par celui des oublis.
    // Sans le rafraîchissement, cent PR visitées valaient cent lignes par chaîne pourrie.
    expect(log.failures).toHaveLength(1);
    expect(log.failures[0]!.at).not.toBe(first);
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

describe('§9.4 — le rappel local reçoit la chaîne entière', () => {
  it('candidats compris, alors que l’événement télémétrique reste réduit à { kind, chain }', () => {
    const telemetry = vi.fn();
    const local = vi.fn();
    const log = new SelectorLog(telemetry, local);
    const c = { name: 'merge-button', candidates: ['.a', '.b'] };

    log.degraded(c);

    expect(local).toHaveBeenCalledWith(c, { msSinceVisit: expect.any(Number) });
    // Égalité exacte : un candidat qui se glisserait dans l'événement atteindrait le collecteur.
    expect(telemetry).toHaveBeenCalledWith({ kind: 'selector-degradation', chain: 'merge-button' });
  });

  it('un onglet ne le déclenche qu’une fois par chaîne, comme la télémétrie', () => {
    const local = vi.fn();
    const log = new SelectorLog(null, local);

    for (let i = 0; i < 20; i++) log.degraded(chain('merge-button'));

    expect(local).toHaveBeenCalledTimes(1);
  });
});

describe('§9.4 — le journal partagé garde une ligne par chaîne, celle écrite en dernier', () => {
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
      { chain: 'merge-button', at: '2026-09-04T09:10:33.983Z' }, // l'écriture la plus récente
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

  // La page enregistrée dans l'entrée (§9.4) ne doit RIEN changer à cette borne. C'est le
  // seul endroit où le champ nouveau pourrait rouvrir un défaut déjà payé : dédupliquer par
  // « chaîne + page » ferait qu'une chaîne pourrie sur soixante PR remplirait à nouveau les
  // cinquante lignes et évincerait toute vraie dégradation.
  it('cinquante pages DIFFÉRENTES ne remplissent pas davantage le journal', async () => {
    const store = fakeArea({ selectorFailures: [{ chain: 'thread-container', at: 'ancien' }] });

    for (let i = 0; i < 50; i++) {
      await appendToJournal(
        'selectorFailures',
        [{ chain: 'merge-button', at: `t${i}`, url: `https://github.com/acme/demo/pull/${i}` }],
        50,
        (e) => e.chain
      );
    }
    delete (globalThis as { chrome?: unknown }).chrome;

    const entries = store['selectorFailures'] as { chain: string; at: string; url?: string }[];
    expect(entries).toHaveLength(2); // la vraie dégradation a survécu
    expect(entries[0]).toEqual({ chain: 'thread-container', at: 'ancien' });
    // Une ligne par chaîne, celle du dernier relevé — donc la page du dernier relevé aussi.
    expect(entries[1]!.url).toBe('https://github.com/acme/demo/pull/49');
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

describe('§9.4 — la fusion transmet ce que la ligne remplacée savait', () => {
  it('une première ligne compte pour un relevé, daté de lui-même', () => {
    expect(mergeJournalEntry(undefined, { chain: 'a', at: 't1' })).toEqual({
      chain: 'a',
      at: 't1',
      firstAt: 't1',
      count: 1,
    });
  });

  it('une ligne écrite avant ces champs compte pour un relevé, daté de son `at`', () => {
    const merged = mergeJournalEntry({ chain: 'a', at: 'ancien' }, { chain: 'a', at: 't2' });

    expect(merged.firstAt).toBe('ancien');
    expect(merged.count).toBe(2);
    expect(merged.at).toBe('t2');
  });

  it('le dernier relevé fournit le reste : page, candidats, plateforme', () => {
    const merged = mergeJournalEntry(
      { chain: 'a', at: 't1', url: 'https://x/1', candidates: ['.old'], platform: 'github', firstAt: 't1', count: 3 },
      { chain: 'a', at: 't2', url: 'https://x/2', candidates: ['.new'], platform: 'github' }
    );

    expect(merged).toEqual({
      chain: 'a',
      at: 't2',
      url: 'https://x/2',
      candidates: ['.new'],
      platform: 'github',
      firstAt: 't1',
      count: 4,
      urls: ['https://x/1', 'https://x/2'],
    });
  });

  // La borne ne doit pas bouger : `merge` change le CONTENU de la ligne, pas leur nombre.
  it('cinquante visites de la même chaîne : une ligne, cinquante relevés, la vraie dégradation intacte', async () => {
    const store: Record<string, unknown> = { selectorFailures: [{ chain: 'thread-container', at: 'ancien' }] };
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

    for (let i = 0; i < 50; i++) {
      await appendToJournal<SelectorFailure>(
        'selectorFailures',
        [{ chain: 'merge-button', at: `t${i}` }],
        50,
        entryKey,
        mergeJournalEntry
      );
    }
    delete (globalThis as { chrome?: unknown }).chrome;

    const entries = store['selectorFailures'] as SelectorFailure[];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ chain: 'thread-container', at: 'ancien' });
    expect(entries[1]).toMatchObject({ chain: 'merge-button', at: 't49', firstAt: 't0', count: 50 });
  });
});


describe('§9.4 — le relevé de page part au journal local, une fois, avec son moment', () => {
  afterEach(() => vi.useRealTimers());

  it('le relevé n’est calculé que pour la ligne qui part, jamais aux appels suivants', () => {
    const local = vi.fn();
    const log = new SelectorLog(null, local);
    const evidence = vi.fn(() => ({ facts: { prState: 'pullOpened' } }));

    for (let i = 0; i < 20; i++) log.degraded(chain('merge-button'), evidence);

    expect(evidence).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledWith(chain('merge-button'), {
      facts: { prState: 'pullOpened' },
      msSinceVisit: expect.any(Number),
    });
  });

  it('un relevé qui lève ne coûte pas la ligne', () => {
    const local = vi.fn();
    const log = new SelectorLog(null, local);

    log.degraded(chain('merge-button'), () => {
      throw new Error('page inattendue');
    });

    expect(local).toHaveBeenCalledWith(chain('merge-button'), { msSinceVisit: expect.any(Number) });
  });

  it('le moment se compte depuis la visite : `newVisit` remet l’horloge à zéro, `forgetSeen` non', () => {
    vi.useFakeTimers();
    const local = vi.fn();
    const log = new SelectorLog(null, local);

    vi.advanceTimersByTime(300);
    log.degraded(chain('a'));
    expect(local.mock.lastCall![1].msSinceVisit).toBe(300);

    // L'effacement du journal oublie ce qui a été signalé, sans que la personne ait changé de page.
    vi.advanceTimersByTime(200);
    log.forgetSeen();
    log.degraded(chain('a'));
    expect(local.mock.lastCall![1].msSinceVisit).toBe(500);

    vi.advanceTimersByTime(100);
    log.newVisit();
    vi.advanceTimersByTime(40);
    log.degraded(chain('a'));
    expect(local.mock.lastCall![1].msSinceVisit).toBe(40);
  });

  it('le relevé ne va jamais à la télémétrie', () => {
    const telemetry = vi.fn();
    const log = new SelectorLog(telemetry, vi.fn());

    log.degraded(chain('merge-button'), () => ({ facts: { prState: 'pullOpened' } }));

    expect(telemetry).toHaveBeenCalledWith({ kind: 'selector-degradation', chain: 'merge-button' });
  });
});

describe('§9.4 — une chaîne trouvée PLUS TARD dans la visite le dit', () => {
  afterEach(() => vi.useRealTimers());

  it('une fois par visite, et seulement pour une chaîne journalisée pendant elle', () => {
    vi.useFakeTimers();
    const recovered = vi.fn();
    const log = new SelectorLog(null, vi.fn(), recovered);

    // Trouvée sans avoir échoué : le cas nominal, qui ne doit rien écrire.
    log.recovered(chain('merge-button'));
    expect(recovered).not.toHaveBeenCalled();

    log.degraded(chain('merge-button'));
    vi.advanceTimersByTime(850);
    for (let i = 0; i < 5; i++) log.recovered(chain('merge-button'));
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledWith(chain('merge-button'), 850);

    // Visite suivante : la chaîne peut de nouveau échouer, puis être rattrapée.
    log.newVisit();
    log.recovered(chain('merge-button'));
    expect(recovered).toHaveBeenCalledTimes(1);
    log.degraded(chain('merge-button'));
    log.recovered(chain('merge-button'));
    expect(recovered).toHaveBeenCalledTimes(2);
  });
});

describe('§9.4 — la ligne garde les dernières pages et ses rattrapages', () => {
  it('les adresses distinctes, cinq au plus, la plus récente en dernier', () => {
    let entry: SelectorFailure | undefined;
    for (const n of [1, 2, 1, 3, 4, 5, 6]) {
      entry = mergeJournalEntry(entry, { chain: 'a', at: `t${n}`, url: `https://x/${n}` });
    }
    // `1` revisitée remonte en fin de liste : c'est `2`, la plus ancienne, qui sort.
    expect(entry!.urls).toEqual(['https://x/1', 'https://x/3', 'https://x/4', 'https://x/5', 'https://x/6']);
    expect(entry!.url).toBe('https://x/6');
  });

  it('une ligne écrite avant `urls` transmet sa seule adresse', () => {
    const merged = mergeJournalEntry<SelectorFailure>(
      { chain: 'a', at: 't1', url: 'https://x/1' },
      { chain: 'a', at: 't2', url: 'https://x/2' }
    );
    expect(merged.urls).toEqual(['https://x/1', 'https://x/2']);
  });

  it('les rattrapages se cumulent d’une visite à l’autre, le nouveau relevé ne les efface pas', () => {
    const recovered = markRecovered(markRecovered<SelectorFailure>({ chain: 'a', at: 't1' }, 400), 900);
    expect(recovered).toMatchObject({ recoveredVisits: 2, lastRecoveredAfterMs: 900 });

    const merged = mergeJournalEntry(recovered, { chain: 'a', at: 't2' });
    expect(merged).toMatchObject({ recoveredVisits: 2, lastRecoveredAfterMs: 900, count: 2 });
  });

  it('une exception n’est jamais marquée rattrapée', () => {
    const error: JournalEntry = { kind: 'error', message: 'x', at: 't1' };
    expect(markRecovered(error, 10)).toBe(error);
  });

  it('`updateJournalEntry` réécrit la ligne en place, sans toucher aux autres ni à l’ordre', async () => {
    const store: Record<string, unknown> = {
      selectorFailures: [
        { chain: 'a', at: 't1' },
        { chain: 'merge-button', at: 't2', count: 3 },
        { chain: 'b', at: 't3' },
      ],
    };
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

    await updateJournalEntry<SelectorFailure>(
      'selectorFailures',
      (e) => e.chain === 'merge-button',
      (e) => markRecovered(e, 120)
    );
    // Rien ne correspond : rien n'est écrit, et surtout rien n'est ajouté.
    await updateJournalEntry<SelectorFailure>('selectorFailures', (e) => e.chain === 'absente', (e) => e);
    delete (globalThis as { chrome?: unknown }).chrome;

    expect(store['selectorFailures']).toEqual([
      { chain: 'a', at: 't1' },
      { chain: 'merge-button', at: 't2', count: 3, recoveredVisits: 1, lastRecoveredAfterMs: 120 },
      { chain: 'b', at: 't3' },
    ]);
  });
});
