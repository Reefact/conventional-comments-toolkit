// Stockage persistant du composant B — les treize objets du §6.4. Le choix de la
// technologie est libre ; l'existence de ce stockage ne l'est pas. Deux implémentations :
// mémoire (tests) et fichier JSON (déploiement simple). L'interface est asynchrone pour
// accueillir une base réelle sans changer l'orchestrateur.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EffectiveConfig, Floor, UserInfo } from '@cct/core';

export interface ExemptionLogEntry {
  prKey: string;
  action: 'granted' | 'refused' | 'reset' | 'revoked';
  by: { id: string; login: string };
  at: string; // horodatage ISO 8601
  reason?: string;
}

/** Exemption active d'une PR — chemin de repli du §6.3.2 uniquement. En attente tant que
 * la pose de l'étiquette n'a pas réussi, confirmée ensuite ; seule une exemption confirmée
 * est admise par une évaluation. */
export interface ActiveExemption {
  by: UserInfo;
  at: string;
  state: 'pending' | 'confirmed';
}

export interface FirstVerdict {
  blocking: boolean;
  hadConflict: boolean;
}

export interface PublishedRecord {
  headSha: string;
  state: string;
  counts: { unresolvedThreads: number; nonCompliantComments: number; warnings: number };
  configFingerprint: string;
  noticeKinds: string[];
  threadIds: string[];
  commentIds: string[];
  at: string;
  /** Ligne machine cc/1 telle que publiée (§6.3.1). */
  machineLine?: string;
  /** Résumé humain d'une ligne. */
  headline?: string;
  /** Sortie humaine complète du §6.3.1 — c'est elle que sert la page derrière la
   * targetUrl : « la même sortie », pas un condensé. */
  humanOutput?: string;
}

export interface RepoEvaluationFlag {
  evaluated: boolean;
  lastPublishedAt?: string;
}

export interface IndicatorSample {
  repoKey: string;
  prKey: string;
  at: string;
  compliantComments: number;
  nonCompliantComments: number;
  warnings: number;
  serviceAccountComments: number;
  labelDistribution: Record<string, number>;
  decisionsInBlockingThreads: number;
  unresolvedBlockingThreads: number;
}

export interface Storage {
  // 1. Journal des exemptions de PR (§10) — un historique, jamais la source de vérité.
  appendExemptionLog(entry: ExemptionLogEntry): Promise<void>;
  readExemptionLog(): Promise<ExemptionLogEntry[]>;
  // 2. Exemption active par PR ouverte (chemin de repli, §6.3.2, §6.4).
  getActiveExemption(prKey: string): Promise<ActiveExemption | null>;
  setActiveExemption(prKey: string, exemption: ActiveExemption): Promise<void>;
  deleteActiveExemption(prKey: string): Promise<void>;
  // 3. Configuration épinglée par PR — écrite une fois, jamais réécrite (§8.1.3).
  getPinnedConfig(prKey: string): Promise<EffectiveConfig | null>;
  setPinnedConfig(prKey: string, config: EffectiveConfig): Promise<void>;
  // 4. Verdict de première observation par racine bloquante — jamais réécrit (§6.4).
  getFirstVerdicts(prKey: string): Promise<Record<string, FirstVerdict>>;
  addFirstVerdicts(prKey: string, verdicts: Record<string, FirstVerdict>): Promise<void>;
  // 5. Dernier plancher valide connu (§8.1.1).
  getLastValidFloor(): Promise<Floor | null>;
  setLastValidFloor(floor: Floor): Promise<void>;
  // 6. Dernière configuration effective résolue, par dépôt (§6.4).
  getLastEffectiveConfig(repoKey: string): Promise<EffectiveConfig | null>;
  setLastEffectiveConfig(repoKey: string, config: EffectiveConfig): Promise<void>;
  // 7. Début de l'incapacité à évaluer, par dépôt (§6.4).
  getDegradedSince(repoKey: string): Promise<string | null>;
  setDegradedSince(repoKey: string, at: string): Promise<void>;
  clearDegradedSince(repoKey: string): Promise<void>;
  // 8. Dernier résultat publié, par PR (idempotence, §6.4).
  getLastPublished(prKey: string): Promise<PublishedRecord | null>;
  setLastPublished(prKey: string, record: PublishedRecord): Promise<void>;
  // 9. Fils déjà observés comme bloquants, par PR (§6.1).
  getKnownBlockingThreads(prKey: string): Promise<string[]>;
  setKnownBlockingThreads(prKey: string, ids: string[]): Promise<void>;
  // 10. Date de bascule posée par l'administration, par dépôt (§6.2.4, §6.4).
  getStoredActivatedAt(repoKey: string): Promise<string | null>;
  setStoredActivatedAt(repoKey: string, at: string): Promise<void>;
  // 11. Dépôt déjà évalué — posé après la première publication réussie, jamais avant (§6.4).
  getRepoEvaluated(repoKey: string): Promise<RepoEvaluationFlag>;
  markRepoEvaluated(repoKey: string, at: string): Promise<void>;
  // 12. Compteurs du §12.
  recordIndicatorSample(sample: IndicatorSample): Promise<void>;
  readIndicatorSamples(repoKey: string): Promise<IndicatorSample[]>;
  // 13. Numéros de séquence d'évaluation, par PR (§6.4).
  nextSequence(prKey: string): Promise<number>;
  getLastPublishedSequence(prKey: string): Promise<number>;
  setLastPublishedSequence(prKey: string, sequence: number): Promise<void>;
  // Index chemin → clé de PR, pour la page de statut (§6.3.1) — l'URL ne porte pas l'hôte.
  setPrPathAlias(alias: string, prKey: string): Promise<void>;
  getPrPathAlias(alias: string): Promise<string | null>;
}

interface State {
  exemptionLog: ExemptionLogEntry[];
  activeExemptions: Record<string, ActiveExemption>;
  pinnedConfigs: Record<string, EffectiveConfig>;
  firstVerdicts: Record<string, Record<string, FirstVerdict>>;
  lastValidFloor: Floor | null;
  lastEffectiveConfigs: Record<string, EffectiveConfig>;
  degradedSince: Record<string, string>;
  lastPublished: Record<string, PublishedRecord>;
  knownBlockingThreads: Record<string, string[]>;
  storedActivatedAt: Record<string, string>;
  repoEvaluated: Record<string, RepoEvaluationFlag>;
  indicatorSamples: IndicatorSample[];
  sequences: Record<string, number>;
  lastPublishedSequences: Record<string, number>;
  prPathAliases: Record<string, string>;
}

function emptyState(): State {
  return {
    exemptionLog: [],
    activeExemptions: {},
    pinnedConfigs: {},
    firstVerdicts: {},
    lastValidFloor: null,
    lastEffectiveConfigs: {},
    degradedSince: {},
    lastPublished: {},
    knownBlockingThreads: {},
    storedActivatedAt: {},
    repoEvaluated: {},
    indicatorSamples: [],
    sequences: {},
    lastPublishedSequences: {},
    prPathAliases: {},
  };
}

export class MemoryStorage implements Storage {
  protected state: State = emptyState();

  protected async persist(): Promise<void> {
    // Rien à faire en mémoire.
  }

  async appendExemptionLog(entry: ExemptionLogEntry): Promise<void> {
    this.state.exemptionLog.push(entry);
    await this.persist();
  }
  async readExemptionLog(): Promise<ExemptionLogEntry[]> {
    return [...this.state.exemptionLog];
  }
  async getActiveExemption(key: string): Promise<ActiveExemption | null> {
    return this.state.activeExemptions[key] ?? null;
  }
  async setActiveExemption(key: string, exemption: ActiveExemption): Promise<void> {
    this.state.activeExemptions[key] = exemption;
    await this.persist();
  }
  async deleteActiveExemption(key: string): Promise<void> {
    delete this.state.activeExemptions[key];
    await this.persist();
  }
  async getPinnedConfig(key: string): Promise<EffectiveConfig | null> {
    return this.state.pinnedConfigs[key] ?? null;
  }
  async setPinnedConfig(key: string, config: EffectiveConfig): Promise<void> {
    // Écrite une fois, jamais réécrite (§8.1.3) — le stockage lui-même tient la règle.
    if (this.state.pinnedConfigs[key] !== undefined) return;
    this.state.pinnedConfigs[key] = config;
    await this.persist();
  }
  async getFirstVerdicts(key: string): Promise<Record<string, FirstVerdict>> {
    return { ...(this.state.firstVerdicts[key] ?? {}) };
  }
  async addFirstVerdicts(key: string, verdicts: Record<string, FirstVerdict>): Promise<void> {
    const existing = this.state.firstVerdicts[key] ?? {};
    // Jamais réécrit : la première observation fait foi (§6.4).
    for (const [id, v] of Object.entries(verdicts)) {
      if (existing[id] === undefined) existing[id] = v;
    }
    this.state.firstVerdicts[key] = existing;
    await this.persist();
  }
  async getLastValidFloor(): Promise<Floor | null> {
    return this.state.lastValidFloor;
  }
  async setLastValidFloor(floor: Floor): Promise<void> {
    this.state.lastValidFloor = floor;
    await this.persist();
  }
  async getLastEffectiveConfig(key: string): Promise<EffectiveConfig | null> {
    return this.state.lastEffectiveConfigs[key] ?? null;
  }
  async setLastEffectiveConfig(key: string, config: EffectiveConfig): Promise<void> {
    this.state.lastEffectiveConfigs[key] = config;
    await this.persist();
  }
  async getDegradedSince(key: string): Promise<string | null> {
    return this.state.degradedSince[key] ?? null;
  }
  async setDegradedSince(key: string, at: string): Promise<void> {
    this.state.degradedSince[key] = at;
    await this.persist();
  }
  async clearDegradedSince(key: string): Promise<void> {
    delete this.state.degradedSince[key];
    await this.persist();
  }
  async getLastPublished(key: string): Promise<PublishedRecord | null> {
    return this.state.lastPublished[key] ?? null;
  }
  async setLastPublished(key: string, record: PublishedRecord): Promise<void> {
    this.state.lastPublished[key] = record;
    await this.persist();
  }
  async getKnownBlockingThreads(key: string): Promise<string[]> {
    return [...(this.state.knownBlockingThreads[key] ?? [])];
  }
  async setKnownBlockingThreads(key: string, ids: string[]): Promise<void> {
    this.state.knownBlockingThreads[key] = [...new Set(ids)];
    await this.persist();
  }
  async getStoredActivatedAt(key: string): Promise<string | null> {
    return this.state.storedActivatedAt[key] ?? null;
  }
  async setStoredActivatedAt(key: string, at: string): Promise<void> {
    this.state.storedActivatedAt[key] = at;
    await this.persist();
  }
  async getRepoEvaluated(key: string): Promise<RepoEvaluationFlag> {
    return this.state.repoEvaluated[key] ?? { evaluated: false };
  }
  async markRepoEvaluated(key: string, at: string): Promise<void> {
    this.state.repoEvaluated[key] = { evaluated: true, lastPublishedAt: at };
    await this.persist();
  }
  async recordIndicatorSample(sample: IndicatorSample): Promise<void> {
    this.state.indicatorSamples.push(sample);
    await this.persist();
  }
  async readIndicatorSamples(key: string): Promise<IndicatorSample[]> {
    return this.state.indicatorSamples.filter((s) => s.repoKey === key);
  }
  async nextSequence(key: string): Promise<number> {
    const next = (this.state.sequences[key] ?? 0) + 1;
    this.state.sequences[key] = next;
    await this.persist();
    return next;
  }
  async getLastPublishedSequence(key: string): Promise<number> {
    return this.state.lastPublishedSequences[key] ?? 0;
  }
  async setLastPublishedSequence(key: string, sequence: number): Promise<void> {
    this.state.lastPublishedSequences[key] = sequence;
    await this.persist();
  }
  async setPrPathAlias(alias: string, prKey: string): Promise<void> {
    this.state.prPathAliases[alias] = prKey;
    await this.persist();
  }
  async getPrPathAlias(alias: string): Promise<string | null> {
    return this.state.prPathAliases[alias] ?? null;
  }
}

/* MemoryStorage se termine ici ; FileStorage hérite de tout. */

/** Stockage fichier JSON, écriture atomique (fichier temporaire puis rename). */
export class FileStorage extends MemoryStorage {
  #path: string;
  #loaded = false;
  #writing: Promise<void> = Promise.resolve();

  constructor(path: string) {
    super();
    this.#path = path;
  }

  async load(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const text = await readFile(this.#path, 'utf8');
      this.state = { ...emptyState(), ...(JSON.parse(text) as State) };
    } catch {
      this.state = emptyState();
    }
  }

  protected override async persist(): Promise<void> {
    this.#writing = this.#writing.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true });
      const tmp = `${this.#path}.tmp`;
      await writeFile(tmp, JSON.stringify(this.state), 'utf8');
      await rename(tmp, this.#path);
    });
    await this.#writing;
  }
}
