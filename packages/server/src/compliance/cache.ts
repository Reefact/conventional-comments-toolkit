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
    this.#fruitlessBypasses.clear();
  }

  invalidate(key: string): void {
    this.#entries.delete(key);
    this.#fruitlessBypasses.delete(key);
  }

  // ————— Étranglement des contournements stériles (§8.1.3, règle 3) —————
  //
  // Un contournement est déclenché par un REJET dépendant de la configuration. Quand il
  // trouve effectivement une configuration nouvelle, il se tarit de lui-même : le rejet
  // disparaît, donc le déclencheur aussi. Mais un rejet qui ne vient PAS d'une
  // configuration en retard — une remarque de revue parfaitement ordinaire comme
  // `@alice peux-tu regarder ça ?`, qui a la forme d'une commande sans en être une —
  // persiste tant que le commentaire est là. Sans mémoire, chaque webhook et chaque
  // réconciliation le réévalueraient et contourneraient les deux caches à nouveau : le
  // TTL serait annulé pour ce dépôt aussi longtemps que le commentaire y reste, et
  // l'amplification est d'autant plus forte que la réconciliation est fréquente — 60 s
  // sur Azure DevOps (§B.7).
  //
  // La mémoire porte donc sur les contournements **stériles**, ceux qui n'ont RIEN
  // changé, et sur eux seuls. Un contournement fructueux n'est jamais étranglé : il n'a
  // pas à l'être, il ne se reproduit pas.
  #fruitlessBypasses = new Map<string, number>();

  /** À appeler quand un contournement a rendu exactement la configuration déjà en cache. */
  markFruitlessBypass(key: string): void {
    this.#fruitlessBypasses.set(key, this.#now());
  }

  /** Vrai si un contournement stérile a eu lieu pour cette clé depuis moins d'un TTL —
   * refaire la lecture ne peut rien apprendre de plus que l'expiration ordinaire. */
  isBypassThrottled(key: string, ttlSeconds: number): boolean {
    const at = this.#fruitlessBypasses.get(key);
    return at !== undefined && this.#now() - at < ttlSeconds * 1000;
  }
}
