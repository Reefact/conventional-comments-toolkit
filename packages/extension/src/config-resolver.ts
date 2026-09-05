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
  /** POURQUOI, et à quel niveau — `null` hors état dégradé. L'adaptateur construit un motif
   * (`HTTP 429`, `TypeError: Failed to fetch`) à chaque `unreachable` ; il était jusqu'ici
   * jeté sur place, et le booléen ci-dessus était tout ce qui survivait. Diagnostiquer un
   * bandeau « Configuration non lue » demandait alors d'instrumenter le navigateur de la
   * personne qui le voyait — trois allers-retours pour une information que le code tenait
   * déjà. Le motif suit donc la dégradation jusqu'à la page d'options (§9.2.3).
   *
   * Local, jamais émis : cette chaîne va dans `chrome.storage.local` et nulle part ailleurs
   * (la télémétrie ne transporte que des compteurs de dégradation de sélecteurs, §10). */
  degradedReason: string | null;
}

/** Motif d'une lecture impossible, préfixé par son NIVEAU (§8.2) : « repo » et « org » ne se
 * corrigent pas au même endroit, et le motif seul ne dit pas lequel des deux a échoué. */
function unreadableReason(level: 'repo' | 'org', read: ConfigRead): string {
  return `${level}: ${read.status === 'unreachable' ? read.reason : 'motif absent'}`;
}

interface CacheEntry {
  value: ConfigRead;
  fetchedAt: number;
}

export class ClientConfigResolver {
  #floorProvider: () => Promise<Floor | null>;
  #cache = new Map<string, CacheEntry>();
  // Une résolution EN VOL par clé (revue Codex, PR #39) : `resolve()` est appelée depuis
  // plusieurs points indépendants de content-internal.ts (rendu déclenché par mutation,
  // sondage périodique d'un onglet inerte, découverte d'un éditeur) sur la MÊME instance de
  // résolveur. Sans coalescence, deux appels concurrents sur un cache expiré déclenchaient
  // chacun leur propre lecture, et `#cache.set()` retenait celle qui ABOUTISSAIT en dernier —
  // pas celle demandée en dernier. Une lecture plus lente mais plus ANCIENNE écrasait alors
  // au cache une réponse plus fraîche déjà posée, et le rattrapage forcé qui en découvrait
  // l'écart relisait ensuite ce cache corrompu, rétablissant le mode ou les règles périmés
  // pour tout le TTL restant. Un second appel pendant une lecture déjà en vol pour la même
  // clé rejoint donc celle-ci au lieu d'en démarrer une concurrente : il n'existe alors plus
  // qu'une seule réponse possible, jamais une course entre deux.
  #inFlight = new Map<string, Promise<{ read: ConfigRead; degraded: boolean }>>();
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
    // Les DEUX niveaux quand les deux ont échoué : n'en montrer qu'un ferait corriger la
    // moitié du problème, puis revoir le bandeau.
    const reasons = [
      ...(repo.degraded ? [unreadableReason('repo', repo.read)] : []),
      ...(org.degraded ? [unreadableReason('org', org.read)] : []),
    ];
    const degradedReason = reasons.length > 0 ? reasons.join(' | ') : null;
    return { config, notices, fingerprint: fingerprint(config), degraded, degradedReason };
  }

  async #cached(
    key: string,
    fetcher: () => Promise<ConfigRead>
  ): Promise<{ read: ConfigRead; degraded: boolean }> {
    const entry = this.#cache.get(key);
    if (entry && this.#now() - entry.fetchedAt < this.#lastTtl * 1000) {
      return { read: entry.value, degraded: false };
    }
    // Rejoint la lecture déjà en vol pour cette clé plutôt que d'en démarrer une seconde —
    // voir le commentaire de `#inFlight` plus haut.
    const pending = this.#inFlight.get(key);
    if (pending) return pending;
    const promise = (async (): Promise<{ read: ConfigRead; degraded: boolean }> => {
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
    })();
    this.#inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.#inFlight.delete(key);
    }
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

/** La configuration effective telle que `core/` doit la voir DANS LE NAVIGATEUR : identique
 * en tout point, sauf `language`, qui y porte la langue RÉSOLUE au sens ci-dessus et non la
 * seule clé `language` du document de configuration.
 *
 * `core/` produit UN texte que l'extension affiche tel quel — le `message` d'un `Diagnostic`
 * —, et il se choisit sur `config.language`. Sans cette substitution, ce message restait
 * donc dans la langue du dépôt (`null` par défaut, donc l'anglais) pendant que tout le reste
 * de l'interface suivait la préférence locale : la pastille disait « Conforme, avec
 * avertissements » au-dessus d'un « This comment is blocking but has no discussion ». Le
 * §5.3 veut ce message « dans la langue résolue au §8.1.2 », préférence locale comprise.
 *
 * Ne peut pas faire diverger un verdict : `language` n'en gouverne aucun et reste hors du
 * domaine de `fingerprint()` (§9.2.2), donc hors de la règle 2 du §8.1.3. La substitution
 * n'AJOUTE que ce que le §8.1.2 place autour de la clé — la préférence locale devant, la
 * langue de la plateforme derrière ; sans préférence ni langue de plateforme, elle rend la
 * clé elle-même. */
export function localizedConfig(config: EffectiveConfig, lang: string): EffectiveConfig {
  return config.language === lang ? config : { ...config, language: lang };
}
