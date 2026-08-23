// Étapes 1 à 4 du §6.4 : trois sources de déclenchement, séquence monotone par PR
// attribuée par le composant B à la réception de TOUT déclenchement, coalescence par PR
// sur `server.coalesceWindowSeconds` — l'évaluation coalescée porte la PLUS HAUTE des
// séquences regroupées.

import type { PrRef } from '@cct/core';
import type { Storage } from './storage.js';
import { prKey, repoKey } from './keys.js';
import type { Orchestrator, EvaluationOutcome } from './orchestrator.js';

interface PendingEvaluation {
  pr: PrRef;
  maxSequence: number;
  timer: ReturnType<typeof setTimeout>;
  waiters: {
    resolve: (o: EvaluationOutcome) => void;
    reject: (e: unknown) => void;
  }[];
}

export type TriggerSource = 'webhook' | 'reconcile' | 'manual';

export class EvaluationScheduler {
  #pending = new Map<string, PendingEvaluation>();
  #storage: Storage;
  #orchestrator: Orchestrator;
  #log: (m: string) => void;

  constructor(storage: Storage, orchestrator: Orchestrator, log: (m: string) => void = () => {}) {
    this.#storage = storage;
    this.#orchestrator = orchestrator;
    this.#log = log;
  }

  /** Reçoit un déclenchement, attribue sa séquence (étape 3), coalesce (étape 4).
   * La promesse rendue se résout avec l'issue de l'évaluation coalescée. */
  async trigger(pr: PrRef, source: TriggerSource): Promise<EvaluationOutcome> {
    const key = prKey(pr);
    const sequence = await this.#storage.nextSequence(key);
    // La fenêtre s'ouvre avant qu'on ait relu le fichier : elle se lit dans la dernière
    // configuration connue du dépôt (§6.4).
    const lastCfg = await this.#storage.getLastEffectiveConfig(repoKey(pr));
    const windowMs = (lastCfg?.server.coalesceWindowSeconds ?? 10) * 1000;

    return new Promise<EvaluationOutcome>((resolve, reject) => {
      const existing = this.#pending.get(key);
      if (existing) {
        existing.maxSequence = Math.max(existing.maxSequence, sequence);
        existing.waiters.push({ resolve, reject });
        return;
      }
      const entry: PendingEvaluation = {
        pr,
        maxSequence: sequence,
        waiters: [{ resolve, reject }],
        timer: setTimeout(() => this.#run(key), windowMs),
      };
      if (typeof entry.timer === 'object' && 'unref' in entry.timer) entry.timer.unref();
      this.#pending.set(key, entry);
      this.#log(`trigger(${source}) ${key} seq=${sequence} window=${windowMs}ms`);
    });
  }

  async #run(key: string): Promise<void> {
    const entry = this.#pending.get(key);
    if (!entry) return;
    this.#pending.delete(key);
    try {
      const outcome = await this.#orchestrator.evaluatePr(entry.pr, entry.maxSequence);
      for (const w of entry.waiters) w.resolve(outcome);
    } catch (e) {
      this.#log(`evaluation failed for ${key}: ${String(e)}`);
      for (const w of entry.waiters) w.reject(e);
    }
  }

  /** Vide les fenêtres en attente (tests, arrêt propre). */
  async flush(): Promise<void> {
    const keys = [...this.#pending.keys()];
    for (const key of keys) {
      const entry = this.#pending.get(key);
      if (entry) clearTimeout(entry.timer);
      await this.#run(key);
    }
  }
}

/** Réconciliation périodique des PR ouvertes (§6.4, source 2) — filet de sécurité contre
 * les événements perdus, et repli de toute détection qu'une plateforme n'assure pas par
 * événement (§B.7). */
export class Reconciler {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #stopped = false;

  constructor(
    private readonly repos: { platform: string; host: string; scope: string[] }[],
    private readonly listOpenPrs: (repo: { host: string; scope: string[] }) => Promise<PrRef[]>,
    private readonly scheduler: EvaluationScheduler,
    private readonly storage: Storage,
    private readonly log: (m: string) => void = () => {}
  ) {}

  async runOnce(): Promise<void> {
    for (const repo of this.repos) {
      try {
        const prs = await this.listOpenPrs(repo);
        for (const pr of prs) void this.scheduler.trigger(pr, 'reconcile').catch(() => {});
      } catch (e) {
        this.log(`reconcile failed for ${repoKey(repo)}: ${String(e)}`);
      }
    }
  }

  /** L'intervalle est le minimum des `server.reconcileIntervalSeconds` connus — c'est le
   * délai maximal de détection de tout ce qu'une plateforme ne notifie pas par événement
   * (§8.2, §B.7). Il est RELU à chaque tour : une organisation qui le resserre (par
   * exemple pour satisfaire la NFR de 60 s en `enforce` sur Azure DevOps) ne doit pas
   * attendre un redémarrage du service. */
  async start(): Promise<void> {
    this.#stopped = false;
    const tick = async (): Promise<void> => {
      if (this.#stopped) return;
      await this.runOnce();
      let interval = 900;
      for (const repo of this.repos) {
        const cfg = await this.storage.getLastEffectiveConfig(repoKey(repo));
        if (cfg) interval = Math.min(interval, cfg.server.reconcileIntervalSeconds);
      }
      if (this.#stopped) return;
      this.#timer = setTimeout(() => void tick(), interval * 1000);
      if (typeof this.#timer === 'object' && 'unref' in this.#timer) this.#timer.unref();
    };
    let interval = 900;
    for (const repo of this.repos) {
      const cfg = await this.storage.getLastEffectiveConfig(repoKey(repo));
      if (cfg) interval = Math.min(interval, cfg.server.reconcileIntervalSeconds);
    }
    this.#timer = setTimeout(() => void tick(), interval * 1000);
    if (typeof this.#timer === 'object' && 'unref' in this.#timer) this.#timer.unref();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}

/** §6.3.3 — sonde du document d'organisation, indépendante du TTL du cache : le retour
 * arrière (`enforce` → `warn`) doit être observé « en quelques minutes sur l'ensemble
 * des dépôts », jamais au terme de `configCacheTtlSeconds`. La cadence par défaut
 * reprend la borne de 60 s du §10 — se greffer sur le seul tour de réconciliation
 * (900 s par défaut) ne la tiendrait pas. La logique vit dans l'orchestrateur
 * (`probeOrgModeSoftening`) ; cette classe n'est que son horloge. */
export class OrgModeWatch {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #stopped = false;

  constructor(
    private readonly orchestrator: Pick<Orchestrator, 'probeOrgModeSoftening'>,
    private readonly intervalSeconds: number = 60,
    private readonly log: (m: string) => void = () => {}
  ) {}

  async runOnce(): Promise<{ observed: string | null; invalidated: boolean }> {
    try {
      return await this.orchestrator.probeOrgModeSoftening();
    } catch (e) {
      this.log(`org mode probe failed: ${String(e)}`);
      return { observed: null, invalidated: false };
    }
  }

  start(): void {
    this.#stopped = false;
    const tick = async (): Promise<void> => {
      if (this.#stopped) return;
      await this.runOnce();
      if (this.#stopped) return;
      this.#timer = setTimeout(() => void tick(), this.intervalSeconds * 1000);
      if (typeof this.#timer === 'object' && 'unref' in this.#timer) this.#timer.unref();
    };
    void tick();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
