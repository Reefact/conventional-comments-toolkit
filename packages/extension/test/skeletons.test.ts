// Les squelettes de page du journal (§9.4) : compression, budget de 1 Mo, garde de quota.
//
// Le budget existe parce que le quota de `chrome.storage.local` est PARTAGÉ et qu'une écriture
// qui le dépasserait échoue — n'importe laquelle, journal compris (`skeletons.ts`). Ces tests
// gardent la règle qui en découle : le squelette cède, jamais le reste.

import { afterEach, describe, expect, it } from 'vitest';
import {
  compressSkeleton,
  decompressSkeleton,
  fitSkeletons,
  QUOTA_HEADROOM,
  SKELETON_KEY,
  type StoredSkeleton,
} from '../src/skeletons.js';
import { storeBounded } from '../src/storage.js';

const skeleton = (id: string, size: number): StoredSkeleton => ({ id, at: 't', url: 'u', gz: 'x'.repeat(size) });
const json = (list: unknown) => JSON.stringify(list).length;

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('compression', () => {
  it('l’aller-retour rend le texte, accents compris', async () => {
    const text = 'body\n div aria-label="Référence" «Fusionner»\n'.repeat(500);
    const gz = (await compressSkeleton(text))!;
    expect(gz.length).toBeLessThan(text.length / 10);
    expect(await decompressSkeleton(gz)).toBe(text);
  });

  it('une valeur stockée abîmée donne `null`, sans lever', async () => {
    expect(await decompressSkeleton('pas du gzip')).toBeNull();
  });
});

describe('fitSkeletons — le budget', () => {
  it('évince les plus anciens jusqu’à tenir, le nouveau en dernier', () => {
    const existing = [skeleton('a', 300), skeleton('b', 300), skeleton('c', 300)];
    const kept = fitSkeletons(existing, skeleton('d', 300), 1000)!;
    expect(kept.map((s) => s.id)).toEqual(['c', 'd']);
    expect(json(kept)).toBeLessThanOrEqual(1000);
  });

  it('un squelette qui ne tient pas seul n’évince rien : rien à écrire', () => {
    expect(fitSkeletons([skeleton('a', 10)], skeleton('gros', 2000), 1000)).toBeNull();
  });

  it('le même identifiant remplace, il ne double pas', () => {
    const kept = fitSkeletons([skeleton('a', 10), skeleton('b', 10)], skeleton('a', 20), 1000)!;
    expect(kept.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('storeBounded — la garde de quota', () => {
  function area(inUse: number | null, quota = 10_000) {
    const store: Record<string, unknown> = {};
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (keys: string[], cb: (i: Record<string, unknown>) => void) =>
            cb(Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))),
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(store, items);
            cb?.();
          },
          // `null` : un navigateur sans `getBytesInUse` ni `QUOTA_BYTES`.
          ...(inUse === null ? {} : { QUOTA_BYTES: quota, getBytesInUse: (_k: unknown, cb: (n: number) => void) => cb(inUse) }),
        },
      },
    };
    return store;
  }
  const put = (s: StoredSkeleton) =>
    storeBounded<StoredSkeleton>(SKELETON_KEY, (existing) => fitSkeletons(existing, s), QUOTA_HEADROOM);

  it('écrit tant que l’aire garde sa marge', async () => {
    const store = area(1000);
    expect(await put(skeleton('a', 500))).toBe(true);
    expect((store[SKELETON_KEY] as StoredSkeleton[]).map((s) => s.id)).toEqual(['a']);
  });

  it('n’écrit rien quand l’écriture entamerait la marge des autres clés', async () => {
    // 7 600 octets occupés sur 10 000 : 500 de plus franchiraient les 80 %.
    const store = area(7600);
    expect(await put(skeleton('a', 500))).toBe(false);
    expect(SKELETON_KEY in store).toBe(false);
  });

  it('sans mesure d’occupation, le budget seul borne l’écriture', async () => {
    const store = area(null);
    expect(await put(skeleton('a', 500))).toBe(true);
    expect(SKELETON_KEY in store).toBe(true);
  });
});
