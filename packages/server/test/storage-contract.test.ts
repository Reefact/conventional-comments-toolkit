// Contrat de l'interface Storage (§6.4, treize objets) — la MÊME suite s'exécute contre
// chaque implémentation : c'est ce qui rend l'abstraction réelle. Une base externe
// implémentée par un client peut copier cette suite comme test de conformité.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '@cct/core';
import { MemoryStorage, FileStorage, type Storage } from '../src/compliance/storage.js';
import { SqliteStorage } from '../src/compliance/storage-sqlite.js';

interface Harness {
  name: string;
  /** Absente quand le runtime ne supporte pas l'implémentation (node:sqlite sur Node 20). */
  make?: () => Promise<Storage>;
  /** Ferme, puis rouvre le MÊME support — vérifie la persistance réelle. */
  reopen?: (current: Storage) => Promise<Storage>;
  cleanup?: () => Promise<void>;
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cct-storage-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sqliteAvailable = await SqliteStorage.available();

const harnesses: Harness[] = [
  { name: 'MemoryStorage', make: async () => new MemoryStorage() },
  {
    name: 'FileStorage',
    make: async () => {
      const s = new FileStorage(join(dir, 'file.json'));
      await s.load();
      return s;
    },
    reopen: async () => {
      const s = new FileStorage(join(dir, 'file.json'));
      await s.load();
      return s;
    },
  },
  {
    name: 'SqliteStorage',
    ...(sqliteAvailable
      ? {
          make: async () => SqliteStorage.open(join(dir, 'db.sqlite')),
          reopen: async (current: Storage) => {
            (current as SqliteStorage).close();
            return SqliteStorage.open(join(dir, 'db.sqlite'));
          },
        }
      : {}),
  },
];

for (const h of harnesses) {
  describe.skipIf(h.make === undefined)(`contrat Storage — ${h.name}`, () => {
    it('tient les treize objets du §6.4, leurs invariants et la persistance', async () => {
      let s = await h.make!();

      // 1. Journal des exemptions : append-only, ordre conservé.
      await s.appendExemptionLog({ prKey: 'p1', action: 'granted', by: { id: 'u1', login: 'a' }, at: 't1' });
      await s.appendExemptionLog({ prKey: 'p1', action: 'revoked', by: { id: 'u2', login: 'b' }, at: 't2' });
      expect((await s.readExemptionLog()).map((e) => e.action)).toEqual(['granted', 'revoked']);

      // 2. Exemption active : pose, lecture, suppression.
      await s.setActiveExemption('p1', { by: { id: 'u1', login: 'a', isServiceAccount: false }, at: 't1', state: 'pending' });
      expect((await s.getActiveExemption('p1'))?.state).toBe('pending');
      await s.deleteActiveExemption('p1');
      expect(await s.getActiveExemption('p1')).toBeNull();

      // 3. Configuration épinglée : écrite UNE fois, jamais réécrite (§8.1.3).
      const cfg1 = defaultConfig();
      const cfg2 = { ...defaultConfig(), mode: 'enforce' as const };
      await s.setPinnedConfig('p1', cfg1);
      await s.setPinnedConfig('p1', cfg2); // ignoré
      expect((await s.getPinnedConfig('p1'))?.mode).toBe(cfg1.mode);

      // 4. Verdicts de première observation : jamais réécrits (§6.4).
      await s.addFirstVerdicts('p1', { t1: { blocking: true, hadConflict: false } });
      await s.addFirstVerdicts('p1', { t1: { blocking: false, hadConflict: true }, t2: { blocking: false, hadConflict: false } });
      const verdicts = await s.getFirstVerdicts('p1');
      expect(verdicts['t1']).toEqual({ blocking: true, hadConflict: false }); // premier verdict conservé
      expect(verdicts['t2']).toEqual({ blocking: false, hadConflict: false });

      // 5. Dernier plancher valide.
      expect(await s.getLastValidFloor()).toBeNull();
      await s.setLastValidFloor({ minimumMode: 'warn' });
      expect((await s.getLastValidFloor())?.minimumMode).toBe('warn');

      // 6. Dernière configuration effective par dépôt.
      await s.setLastEffectiveConfig('r1', cfg2);
      expect((await s.getLastEffectiveConfig('r1'))?.mode).toBe('enforce');
      expect(await s.getLastEffectiveConfig('r2')).toBeNull();

      // 7. degradedSince : pose et effacement.
      await s.setDegradedSince('r1', 't3');
      expect(await s.getDegradedSince('r1')).toBe('t3');
      await s.clearDegradedSince('r1');
      expect(await s.getDegradedSince('r1')).toBeNull();

      // 8. Dernier résultat publié.
      await s.setLastPublished('p1', {
        headSha: 'sha',
        state: 'success',
        counts: { unresolvedThreads: 0, nonCompliantComments: 1, warnings: 2 },
        configFingerprint: 'abcd1234',
        noticeKinds: [],
        threadIds: [],
        commentIds: ['c1'],
        at: 't4',
      });
      expect((await s.getLastPublished('p1'))?.headSha).toBe('sha');

      // 9. Fils bloquants connus : dédupliqués.
      await s.setKnownBlockingThreads('p1', ['t1', 't1', 't2']);
      expect((await s.getKnownBlockingThreads('p1')).sort()).toEqual(['t1', 't2']);

      // 10. activatedAt posée par l'administration.
      await s.setStoredActivatedAt('r1', '2026-09-01T00:00:00Z');
      expect(await s.getStoredActivatedAt('r1')).toBe('2026-09-01T00:00:00Z');

      // 11. Dépôt évalué.
      expect((await s.getRepoEvaluated('r1')).evaluated).toBe(false);
      await s.markRepoEvaluated('r1', 't5');
      expect(await s.getRepoEvaluated('r1')).toEqual({ evaluated: true, lastPublishedAt: 't5' });

      // 12. Indicateurs : filtrés par dépôt, ordre conservé.
      const sample = (repoKey: string, at: string) => ({
        repoKey,
        prKey: 'p1',
        at,
        compliantComments: 1,
        nonCompliantComments: 0,
        warnings: 0,
        serviceAccountComments: 0,
        labelDistribution: { issue: 1 },
        decisionsInBlockingThreads: 0,
        unresolvedBlockingThreads: 0,
      });
      await s.recordIndicatorSample(sample('r1', 'a'));
      await s.recordIndicatorSample(sample('r2', 'b'));
      await s.recordIndicatorSample(sample('r1', 'c'));
      expect((await s.readIndicatorSamples('r1')).map((x) => x.at)).toEqual(['a', 'c']);

      // 13. Séquences : monotones par PR, indépendantes entre PR.
      expect(await s.nextSequence('p1')).toBe(1);
      expect(await s.nextSequence('p1')).toBe(2);
      expect(await s.nextSequence('p2')).toBe(1);
      expect(await s.getLastPublishedSequence('p1')).toBe(0);
      await s.setLastPublishedSequence('p1', 2);
      expect(await s.getLastPublishedSequence('p1')).toBe(2);

      // Index chemin → clé de PR.
      await s.setPrPathAlias('github/acme/demo#42', 'p1');
      expect(await s.getPrPathAlias('github/acme/demo#42')).toBe('p1');
      expect(await s.getPrPathAlias('inconnu')).toBeNull();

      // Persistance réelle : fermer puis rouvrir le même support ne perd rien.
      if (h.reopen) {
        s = await h.reopen(s);
        expect((await s.getPinnedConfig('p1'))?.mode).toBe(cfg1.mode);
        expect((await s.getFirstVerdicts('p1'))['t1']).toEqual({ blocking: true, hadConflict: false });
        expect(await s.nextSequence('p1')).toBe(3); // la séquence reprend, jamais ne repart
        expect((await s.readExemptionLog()).map((e) => e.action)).toEqual(['granted', 'revoked']);
        expect((await s.readIndicatorSamples('r1')).map((x) => x.at)).toEqual(['a', 'c']);
        expect(await s.getPrPathAlias('github/acme/demo#42')).toBe('p1');
        if (s instanceof SqliteStorage) s.close();
      }
    });
  });
}
