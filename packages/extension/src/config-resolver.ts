// Résolution de configuration côté composant A (§8.1.2, §9.2.3) : les trois mêmes
// niveaux que le composant B — plancher (politique d'entreprise), organisation
// (configUrl du canal de plancher), fichier de dépôt — via resolveConfig() de core/.
// A n'épingle pas (§8.1.3, règle 2) : pinned=null, previouslyEvaluated=false.

import {
  fingerprint,
  resolveConfig,
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
    const configUrl = floor?.configUrl ?? null;

    const repoRead = await this.#cached(`repo:${pr.host}/${pr.scope.join('/')}`, () =>
      adapter.getRepoConfig(pr)
    );
    const orgRead =
      configUrl === null
        ? ({ status: 'absent' } as ConfigRead)
        : await this.#cached(`org:${configUrl}`, () => adapter.getOrgConfig(configUrl));

    const { config, notices } = resolveConfig(floor, orgRead, repoRead, null, false);
    this.#lastTtl = config.configCacheTtlSeconds;
    const degraded = repoRead.status === 'unreachable' || orgRead.status === 'unreachable';
    return { config, notices, fingerprint: fingerprint(config), degraded };
  }

  async #cached(key: string, fetcher: () => Promise<ConfigRead>): Promise<ConfigRead> {
    const entry = this.#cache.get(key);
    if (entry && this.#now() - entry.fetchedAt < this.#lastTtl * 1000) return entry.value;
    const value = await fetcher();
    // Une lecture impossible n'est pas mise en cache : l'extension retentera, et
    // l'assistance continue avec la configuration précédemment en cache (§9.2.3).
    if (value.status !== 'unreachable') this.#cache.set(key, { value, fetchedAt: this.#now() });
    else if (entry) return entry.value;
    return value;
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
