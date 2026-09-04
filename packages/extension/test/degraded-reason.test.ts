// @vitest-environment happy-dom
//
// LE MOTIF DE L'ÉTAT DÉGRADÉ (§5.4, §9.2.3) — l'information que le code tenait déjà et
// jetait sur place.
//
// L'adaptateur construit un motif à CHAQUE `unreachable` (`HTTP 429`,
// `TypeError: Failed to fetch`, un 404 indiscernable d'un accès refusé). Ce motif mourait
// dans `resolveConfig()`, qui saute simplement le niveau illisible ; `notices` n'est lu par
// personne dans l'extension ; et `writeDegradedState()` réduisait tout à un booléen, écrit
// dans `chrome.storage.local` sous la forme du mot `unreachable`.
//
// Conséquence VÉCUE, et c'est elle qui justifie ce fichier : un bandeau « Configuration non
// lue » sur un dépôt public sans configuration a demandé trois allers-retours d'instrumentation
// manuelle dans le navigateur de la personne qui le voyait — pour une information que
// l'extension avait eue en main puis jetée. Le motif porte donc désormais son NIVEAU jusqu'à la
// page d'options.
//
// Ce qui n'est PAS mesurable ici, et qu'il faut dire : ce fichier vérifie le transport du
// motif, pas sa véracité. Ce que le navigateur répond vraiment sur la route `raw` est mesuré
// ailleurs (`npm run check:content-script-cors`), et un faux `fetch` rend ce qu'on lui dit.

import { describe, expect, it } from 'vitest';
import type { ConfigRead, Floor, PrRef } from '@cct/core';
import type { PlatformAdapter } from '@cct/adapter-shared';
import { ClientConfigResolver } from '../src/config-resolver.js';
import { writeDegradedState } from '../src/content-internal.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

/** Le strict nécessaire à `resolve()` : les deux lectures de configuration. */
function adapterReading(repo: ConfigRead, org: ConfigRead): PlatformAdapter {
  return {
    getRepoConfig: async () => repo,
    getOrgConfig: async () => org,
  } as unknown as PlatformAdapter;
}

const orgFloor: Floor = { configUrl: 'https://config.acme.com/cc.json' };

describe('§9.2.3 — le motif de la lecture impossible remonte, avec son niveau', () => {
  it('lecture de dépôt impossible : le motif nomme le niveau ET la cause', async () => {
    const resolver = new ClientConfigResolver(async () => null);
    const resolved = await resolver.resolve(
      adapterReading({ status: 'unreachable', reason: 'HTTP 429' }, { status: 'absent' }),
      pr
    );

    expect(resolved.degraded).toBe(true);
    expect(resolved.degradedReason).toBe('repo: HTTP 429');
  });

  it('lecture d’organisation impossible : le niveau distingue les deux corrections', async () => {
    const resolver = new ClientConfigResolver(async () => orgFloor);
    const resolved = await resolver.resolve(
      adapterReading({ status: 'absent' }, { status: 'unreachable', reason: 'TypeError: Failed to fetch' }),
      pr
    );

    expect(resolved.degradedReason).toBe('org: TypeError: Failed to fetch');
  });

  // Les DEUX, quand les deux ont échoué : n'en montrer qu'un ferait corriger la moitié du
  // problème, puis revoir le bandeau sans comprendre pourquoi.
  it('les deux niveaux illisibles : les deux motifs sont rendus', async () => {
    const resolver = new ClientConfigResolver(async () => orgFloor);
    const resolved = await resolver.resolve(
      adapterReading(
        { status: 'unreachable', reason: 'HTTP 503' },
        { status: 'unreachable', reason: 'HTTP 404 (absence indiscernable)' }
      ),
      pr
    );

    expect(resolved.degradedReason).toBe('repo: HTTP 503 | org: HTTP 404 (absence indiscernable)');
  });

  // Un fichier absent n'est pas une dégradation (§10) : rien à motiver.
  it('lectures nominales : aucun motif, et aucun état dégradé', async () => {
    const resolver = new ClientConfigResolver(async () => null);
    const resolved = await resolver.resolve(
      adapterReading({ status: 'absent' }, { status: 'absent' }),
      pr
    );

    expect(resolved.degraded).toBe(false);
    expect(resolved.degradedReason).toBeNull();
  });
});

describe('§9.2.3 — la page d’options reçoit le motif, pas seulement le fait', () => {
  function writesOf(run: () => void): Record<string, unknown>[] {
    const writes: Record<string, unknown>[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: { set: (items: Record<string, unknown>) => writes.push(items) } },
    };
    try {
      run();
    } finally {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
    return writes;
  }

  it('le motif est la valeur écrite — c’est lui que la page d’options affiche', () => {
    expect(writesOf(() => writeDegradedState(true, 'repo: HTTP 429'))).toEqual([
      { degradedState: 'repo: HTTP 429' },
    ]);
  });

  // Repli : une dégradation sans motif doit rester visible. Le mot `unreachable` est ce que la
  // page d'options affichait avant ce changement, et reste ce qu'elle affiche à défaut de mieux.
  it('dégradation sans motif, ou motif vide : `unreachable`, jamais une case vide', () => {
    expect(writesOf(() => writeDegradedState(true))).toEqual([{ degradedState: 'unreachable' }]);
    expect(writesOf(() => writeDegradedState(true, '   '))).toEqual([
      { degradedState: 'unreachable' },
    ]);
  });

  it('hors état dégradé, le motif ne survit pas : la clé retombe à `false`', () => {
    expect(writesOf(() => writeDegradedState(false, 'repo: HTTP 429'))).toEqual([
      { degradedState: false },
    ]);
  });
});
