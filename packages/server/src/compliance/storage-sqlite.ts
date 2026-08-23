// Stockage SQLite du composant B — la « vraie base » de la gamme memory → file → base,
// sans ajouter de dépendance (§10) : `node:sqlite` est un module natif de Node (≥ 22.13).
// Import dynamique : sur un Node qui ne l'embarque pas (20.x), `SqliteStorage.available()`
// rend false et l'assemblage refuse la valeur `sqlite` avec un message clair, au lieu
// d'échouer à l'import du paquet entier.
//
// Schéma volontairement minimal : les douze objets à clé vivent dans une table
// clé → valeur JSON (mêmes clés que MemoryStorage, préfixées par espace de noms), les
// deux journaux en append-only gardent leur ordre d'insertion. Les invariants « écrit
// une fois, jamais réécrit » (configuration épinglée §8.1.3, verdicts de première
// observation §6.4) sont tenus par le stockage lui-même, comme dans MemoryStorage.

import type { EffectiveConfig, Floor } from '@cct/core';
import type {
  ActiveExemption,
  ExemptionLogEntry,
  FirstVerdict,
  IndicatorSample,
  PublishedRecord,
  RepoEvaluationFlag,
  Storage,
} from './storage.js';

interface SqliteStatement {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

async function loadSqlite(): Promise<{ DatabaseSync: new (path: string) => SqliteDatabase } | null> {
  // `process.getBuiltinModule` (Node ≥ 22.3) charge un module natif sans passer par le
  // résolveur du bundler — les outils de test réécrivent les imports dynamiques et ne
  // connaissent pas encore ce builtin récent. Repli sur l'import dynamique ailleurs.
  try {
    const getBuiltin = (
      process as unknown as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule;
    if (getBuiltin) {
      const mod = getBuiltin.call(process, 'node:sqlite');
      if (mod) return mod as { DatabaseSync: new (path: string) => SqliteDatabase };
      return null;
    }
    const specifier = 'node:sqlite';
    return (await import(specifier)) as { DatabaseSync: new (path: string) => SqliteDatabase };
  } catch {
    return null;
  }
}

export class SqliteStorage implements Storage {
  #db: SqliteDatabase;

  private constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  /** Vrai si ce runtime embarque `node:sqlite`. */
  static async available(): Promise<boolean> {
    return (await loadSqlite()) !== null;
  }

  /** Ouvre (et initialise au besoin) la base au chemin donné — `:memory:` accepté. */
  static async open(path: string): Promise<SqliteStorage> {
    const mod = await loadSqlite();
    if (!mod) {
      throw new Error(
        'node:sqlite is not available in this Node.js runtime (needs >= 22.13); use CCT_STORAGE=file instead'
      );
    }
    const db = new mod.DatabaseSync(path);
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exemption_log (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS indicator_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_key TEXT NOT NULL,
        v TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_samples_repo ON indicator_samples (repo_key);
    `);
    return new SqliteStorage(db);
  }

  close(): void {
    this.#db.close();
  }

  #get<T>(ns: string, key: string): T | null {
    const row = this.#db.prepare('SELECT v FROM kv WHERE k = ?').get(`${ns}:${key}`) as
      | { v: string }
      | undefined;
    return row === undefined ? null : (JSON.parse(row.v) as T);
  }

  #set(ns: string, key: string, value: unknown): void {
    this.#db
      .prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .run(`${ns}:${key}`, JSON.stringify(value));
  }

  #setOnce(ns: string, key: string, value: unknown): void {
    // L'unicité de clé primaire tient l'invariant « écrit une fois » — pas une relecture.
    this.#db
      .prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO NOTHING')
      .run(`${ns}:${key}`, JSON.stringify(value));
  }

  #delete(ns: string, key: string): void {
    this.#db.prepare('DELETE FROM kv WHERE k = ?').run(`${ns}:${key}`);
  }

  // 1. Journal des exemptions (§10) — historique ordonné, jamais la source de vérité.
  async appendExemptionLog(entry: ExemptionLogEntry): Promise<void> {
    this.#db.prepare('INSERT INTO exemption_log (v) VALUES (?)').run(JSON.stringify(entry));
  }
  async readExemptionLog(): Promise<ExemptionLogEntry[]> {
    return this.#db
      .prepare('SELECT v FROM exemption_log ORDER BY id')
      .all()
      .map((r) => JSON.parse((r as { v: string }).v) as ExemptionLogEntry);
  }

  // 2. Exemption active par PR (§6.3.2, §6.4).
  async getActiveExemption(prKey: string): Promise<ActiveExemption | null> {
    return this.#get('exemption', prKey);
  }
  async setActiveExemption(prKey: string, exemption: ActiveExemption): Promise<void> {
    this.#set('exemption', prKey, exemption);
  }
  async deleteActiveExemption(prKey: string): Promise<void> {
    this.#delete('exemption', prKey);
  }

  // 3. Configuration épinglée — écrite une fois, jamais réécrite (§8.1.3).
  async getPinnedConfig(prKey: string): Promise<EffectiveConfig | null> {
    return this.#get('pinned', prKey);
  }
  async setPinnedConfig(prKey: string, config: EffectiveConfig): Promise<void> {
    this.#setOnce('pinned', prKey, config);
  }

  // 4. Verdicts de première observation — jamais réécrits (§6.4).
  async getFirstVerdicts(prKey: string): Promise<Record<string, FirstVerdict>> {
    return this.#get<Record<string, FirstVerdict>>('firstVerdicts', prKey) ?? {};
  }
  async addFirstVerdicts(prKey: string, verdicts: Record<string, FirstVerdict>): Promise<void> {
    const existing = await this.getFirstVerdicts(prKey);
    for (const [id, v] of Object.entries(verdicts)) {
      if (existing[id] === undefined) existing[id] = v;
    }
    this.#set('firstVerdicts', prKey, existing);
  }

  // 5. Dernier plancher valide connu (§8.1.1).
  async getLastValidFloor(): Promise<Floor | null> {
    return this.#get('floor', 'last');
  }
  async setLastValidFloor(floor: Floor): Promise<void> {
    this.#set('floor', 'last', floor);
  }

  // 6. Dernière configuration effective par dépôt (§6.4).
  async getLastEffectiveConfig(repoKey: string): Promise<EffectiveConfig | null> {
    return this.#get('lastConfig', repoKey);
  }
  async setLastEffectiveConfig(repoKey: string, config: EffectiveConfig): Promise<void> {
    this.#set('lastConfig', repoKey, config);
  }

  // 7. Début de l'incapacité à évaluer (§6.4).
  async getDegradedSince(repoKey: string): Promise<string | null> {
    return this.#get('degraded', repoKey);
  }
  async setDegradedSince(repoKey: string, at: string): Promise<void> {
    this.#set('degraded', repoKey, at);
  }
  async clearDegradedSince(repoKey: string): Promise<void> {
    this.#delete('degraded', repoKey);
  }

  // 8. Dernier résultat publié (idempotence, §6.4).
  async getLastPublished(prKey: string): Promise<PublishedRecord | null> {
    return this.#get('published', prKey);
  }
  async setLastPublished(prKey: string, record: PublishedRecord): Promise<void> {
    this.#set('published', prKey, record);
  }

  // 9. Fils déjà observés comme bloquants (§6.1).
  async getKnownBlockingThreads(prKey: string): Promise<string[]> {
    return this.#get<string[]>('knownBlocking', prKey) ?? [];
  }
  async setKnownBlockingThreads(prKey: string, ids: string[]): Promise<void> {
    this.#set('knownBlocking', prKey, [...new Set(ids)]);
  }

  // 10. Date de bascule posée par l'administration (§6.2.4).
  async getStoredActivatedAt(repoKey: string): Promise<string | null> {
    return this.#get('activatedAt', repoKey);
  }
  async setStoredActivatedAt(repoKey: string, at: string): Promise<void> {
    this.#set('activatedAt', repoKey, at);
  }

  // 11. Dépôt déjà évalué — après la première publication, jamais avant (§6.4).
  async getRepoEvaluated(repoKey: string): Promise<RepoEvaluationFlag> {
    return this.#get<RepoEvaluationFlag>('evaluated', repoKey) ?? { evaluated: false };
  }
  async markRepoEvaluated(repoKey: string, at: string): Promise<void> {
    this.#set('evaluated', repoKey, { evaluated: true, lastPublishedAt: at });
  }

  // 12. Compteurs du §12.
  async recordIndicatorSample(sample: IndicatorSample): Promise<void> {
    this.#db
      .prepare('INSERT INTO indicator_samples (repo_key, v) VALUES (?, ?)')
      .run(sample.repoKey, JSON.stringify(sample));
  }
  async readIndicatorSamples(repoKey: string): Promise<IndicatorSample[]> {
    return this.#db
      .prepare('SELECT v FROM indicator_samples WHERE repo_key = ? ORDER BY id')
      .all(repoKey)
      .map((r) => JSON.parse((r as { v: string }).v) as IndicatorSample);
  }

  // 13. Séquences d'évaluation (§6.4). Node est mono-thread et la connexion est unique :
  // lecture + écriture forment une section critique de fait, comme dans MemoryStorage.
  async nextSequence(prKey: string): Promise<number> {
    const next = (this.#get<number>('sequence', prKey) ?? 0) + 1;
    this.#set('sequence', prKey, next);
    return next;
  }
  async getLastPublishedSequence(prKey: string): Promise<number> {
    return this.#get<number>('publishedSequence', prKey) ?? 0;
  }
  async setLastPublishedSequence(prKey: string, sequence: number): Promise<void> {
    this.#set('publishedSequence', prKey, sequence);
  }

  // Index chemin → clé de PR, pour la page de statut (§6.3.1).
  async setPrPathAlias(alias: string, prKey: string): Promise<void> {
    this.#set('alias', alias, prKey);
  }
  async getPrPathAlias(alias: string): Promise<string | null> {
    return this.#get('alias', alias);
  }
}
