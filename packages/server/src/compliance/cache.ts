// Cache de configuration (§8.1.2) : TTL `configCacheTtlSeconds` sur les deux niveaux,
// contournable (`bypassCache`, §8.1.3 règle 3), et invalidable immédiatement lors d'un
// assouplissement du mode (§6.3.3 — la seconde situation de contournement).

import type { ConfigRead } from '@cct/core';

interface Entry {
  value: ConfigRead;
  fetchedAt: number;
}

export class ConfigCache {
  #entries = new Map<string, Entry>();
  #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async read(
    key: string,
    ttlSeconds: number,
    bypassCache: boolean,
    fetcher: () => Promise<ConfigRead>
  ): Promise<ConfigRead> {
    if (!bypassCache) {
      const entry = this.#entries.get(key);
      if (entry && this.#now() - entry.fetchedAt < ttlSeconds * 1000) return entry.value;
    }
    const value = await fetcher();
    // Une lecture impossible n'est pas mise en cache : elle relève de l'incapacité à
    // évaluer (§6.4), pas d'un état stable à servir pendant tout le TTL.
    if (value.status !== 'unreachable') {
      this.#entries.set(key, { value, fetchedAt: this.#now() });
    }
    return value;
  }

  /** §6.3.3 — un assouplissement du mode invalide immédiatement le cache. */
  invalidateAll(): void {
    this.#entries.clear();
  }

  invalidate(key: string): void {
    this.#entries.delete(key);
  }
}
