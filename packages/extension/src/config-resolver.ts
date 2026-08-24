// Résolution de configuration côté composant A (§8.1.2, §9.2.3) : les trois mêmes
// niveaux que le composant B — plancher (politique d'entreprise), organisation
// (configUrl du canal de plancher), fichier de dépôt — via resolveConfig() de core/.
// A n'épingle pas (§8.1.3, règle 2) : pinned=null, previouslyEvaluated=false.

import {
  fingerprint,
  resolveConfig,
  vetFloor,
  vettedConfigUrl,
  type ConfigRead,
  type EffectiveConfig,
  type Floor,
  type Notice,
  type PrRef,
} from '@cct/core';
import type { PlatformAdapter } from '@cct/adapter-shared';

export interface ResolvedClientConfig {
  config: EffectiveConfig;
  notices: Notice[];
  fingerprint: string;
  /** État dégradé au sens du §5.4, condition 4 : une lecture a rendu `unreachable`.
   * Un fichier simplement absent n'est PAS une dégradation. */
  degraded: boolean;
}

interface CacheEntry {
  value: ConfigRead;
  fetchedAt: number;
}

export class ClientConfigResolver {
  #floorProvider: () => Promise<Floor | null>;
  #cache = new Map<string, CacheEntry>();
  #now: () => number;
  #lastTtl = 3600; // la clé vit dans le document qu'elle sert à mettre en cache (§9.2.3)

  constructor(floorProvider: () => Promise<Floor | null>, now: () => number = Date.now) {
    this.#floorProvider = floorProvider;
    this.#now = now;
  }

  /** Résolution complète pour une PR. Les lectures sont mises en cache pour
   * `configCacheTtlSeconds` et faites hors du chemin critique par l'appelant (§9.2.3). */
  async resolve(adapter: PlatformAdapter, pr: PrRef): Promise<ResolvedClientConfig> {
    const floor = await this.#floorProvider().catch(() => null);
    // Le plancher VÉRIFIÉ, jamais le brut : un plancher de version non supportée ne doit
    // pas désigner le document d'organisation ni déclencher sa lecture (§8.1.1).
    const configUrl = vettedConfigUrl(vetFloor(floor));

    const repo = await this.#cached(`repo:${pr.host}/${pr.scope.join('/')}`, () =>
      adapter.getRepoConfig(pr)
    );
    const org =
      configUrl === null
        ? { read: { status: 'absent' } as ConfigRead, degraded: false }
        : await this.#cached(`org:${configUrl}`, () => adapter.getOrgConfig(configUrl));

    const { config, notices } = resolveConfig(floor, org.read, repo.read, null, false);
    this.#lastTtl = config.configCacheTtlSeconds;
    // §5.4, condition 4 : une lecture qui a rendu `unreachable` met en état dégradé —
    // jamais masqué par une entrée de cache expirée.
    const degraded = repo.degraded || org.degraded;
    return { config, notices, fingerprint: fingerprint(config), degraded };
  }

  async #cached(
    key: string,
    fetcher: () => Promise<ConfigRead>
  ): Promise<{ read: ConfigRead; degraded: boolean }> {
    const entry = this.#cache.get(key);
    if (entry && this.#now() - entry.fetchedAt < this.#lastTtl * 1000) {
      return { read: entry.value, degraded: false };
    }
    const value = await fetcher();
    if (value.status !== 'unreachable') {
      this.#cache.set(key, { value, fetchedAt: this.#now() });
      return { read: value, degraded: false };
    }
    // Lecture impossible : le repli normatif est le NIVEAU INFÉRIEUR, en état dégradé
    // (§8.1.5 « Lecture impossible », §9.2.3 : « se rabat sur le niveau inférieur, en
    // signalant son état dégradé »). La lecture `unreachable` est donc rendue telle
    // quelle — resolveConfig() saute ce niveau — et jamais remplacée par la valeur
    // expirée du même niveau : l'extension n'énonce aucun diagnostic au nom d'une règle
    // qu'elle n'a pas pu relire. La valeur en cache ne sert que pendant son TTL.
    return { read: value, degraded: true };
  }

  invalidate(): void {
    this.#cache.clear();
  }
}

/** Langue résolue (§8.1.2) : préférence locale, puis clé `language` de la configuration
 * effective, puis langue de l'interface de la plateforme. */
export function resolveUiLanguage(
  userPreference: string | null,
  config: EffectiveConfig,
  platformLanguage: string | null
): string {
  return userPreference ?? config.language ?? platformLanguage ?? 'en';
}
