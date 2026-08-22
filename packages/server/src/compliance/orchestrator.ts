// Orchestrateur du composant B — la séquence du §6.4, étape par étape. Les règles vivent
// dans core/ (`resolveConfig`, `evaluate`) ; l'orchestrateur lit l'état, arme
// `forceState`, exécute les actions et publie. Il ne juge jamais lui-même.

import {
  analyze,
  evaluate,
  resolveConfig,
  SUPPORTED_FLOOR_VERSION,
  type ComplianceResult,
  type ConfigRead,
  type EffectiveConfig,
  type EvaluationContext,
  type Floor,
  type Notice,
  type PrRef,
  type ThreadInfo,
  type UserInfo,
  type Zone,
  type CommentInfo,
} from '@cct/core';
import type { ServerPlatformAdapter, PlatformOperationalFacts } from './adapter.js';
import type { Storage, PublishedRecord, IndicatorSample } from './storage.js';
import { ConfigCache } from './cache.js';
import { prKey, repoKey } from './keys.js';

export interface OrchestratorDeps {
  adapter: ServerPlatformAdapter;
  storage: Storage;
  cache: ConfigCache;
  /** Canal de plancher du composant B : configuration d'installation du service (§8.1.1). */
  floorProvider: () => Promise<Floor | null>;
  facts: PlatformOperationalFacts;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface EvaluationOutcome {
  result: ComplianceResult | null;
  published: boolean;
  /** 'grace' : abandon silencieux pendant le délai de grâce ; 'not-activated' : étape 8 ;
   * 'stale-sequence' / 'mode' / 'identical' : portes 14.a/b/d. */
  skipped?: 'grace' | 'not-activated' | 'stale-sequence' | 'mode' | 'identical';
}

interface CurrentState {
  threads: ThreadInfo[];
  loose: { comment: CommentInfo; zone: Zone }[];
  labels: { name: string; by?: UserInfo; at?: string }[];
  isDraft: boolean;
}

export class Orchestrator {
  readonly deps: Required<Pick<OrchestratorDeps, 'now' | 'log'>> & OrchestratorDeps;

  constructor(deps: OrchestratorDeps) {
    this.deps = { now: () => new Date(), log: () => {}, ...deps };
  }

  /** Étapes 5 à 16 du §6.4. `sequence` a été attribuée à la réception du déclenchement
   * (étape 3) et vaut la plus haute des séquences coalescées (étape 4). */
  async evaluatePr(pr: PrRef, sequence: number): Promise<EvaluationOutcome> {
    const { adapter, storage, cache, now } = this.deps;
    const rKey = repoKey(pr);
    const pKey = prKey(pr);
    const repoFlag = await storage.getRepoEvaluated(rKey);
    const previouslyEvaluated = repoFlag.evaluated;
    const lastCfg = await storage.getLastEffectiveConfig(rKey);
    const ttl = lastCfg?.configCacheTtlSeconds ?? 3600;

    // Plancher : lu frais à chaque évaluation sur le canal du composant B. Une version
    // non supportée fait substituer le dernier plancher valide connu (§8.1.1).
    const floorNotices: Notice[] = [];
    let floor = await this.deps.floorProvider().catch(() => null);
    if (floor && floor.floorVersion !== undefined && floor.floorVersion > SUPPORTED_FLOOR_VERSION) {
      const last = await storage.getLastValidFloor();
      if (last) {
        floorNotices.push({
          kind: 'unsupported-version',
          message: `floor version ${floor.floorVersion} exceeds supported version ${SUPPORTED_FLOOR_VERSION}: the previously known floor is applied (§8.1.1)`,
          ref: 'floorVersion',
        });
        floor = last;
      }
      // Sans plancher précédemment connu, resolveConfig applique lui-même le repli assist.
    } else if (floor) {
      await storage.setLastValidFloor(floor);
    }
    const configUrl = floor?.configUrl ?? null;

    // ————— Étape 5 : relire l'état courant — jamais le contenu de l'événement —————
    let repoRead: ConfigRead;
    let orgRead: ConfigRead;
    let current: CurrentState | null = null;
    try {
      repoRead = await cache.read(`repo:${rKey}`, ttl, false, () => adapter.fetchConfigFile(pr));
      orgRead =
        configUrl === null
          ? { status: 'absent' }
          : await cache.read(`org:${configUrl}`, ttl, false, () => adapter.fetchOrgConfig(configUrl));
      const [threads, loose, labels, isDraft] = await Promise.all([
        adapter.fetchThreads(pr),
        adapter.fetchStandaloneComments(pr),
        adapter.fetchLabels(pr),
        adapter.isDraft(pr),
      ]);
      current = { threads, loose, labels, isDraft };
    } catch {
      repoRead = { status: 'unreachable', reason: 'read failed' };
      orgRead = { status: 'absent' };
    }
    // ————— Étape 6 : incapacité à évaluer, délai de grâce (§6.4, §8.1.5) —————
    if (current === null || repoRead.status === 'unreachable' || orgRead.status === 'unreachable') {
      let degradedSince = await storage.getDegradedSince(rKey);
      if (degradedSince === null) {
        degradedSince = now().toISOString();
        await storage.setDegradedSince(rKey, degradedSince);
      }
      const graceSeconds = lastCfg?.server.gracePeriodSeconds ?? 900;
      const elapsed = now().getTime() - Date.parse(degradedSince);
      if (elapsed <= graceSeconds * 1000) {
        return { result: null, published: false, skipped: 'grace' }; // abandon sans rien publier
      }
      if (!previouslyEvaluated) {
        // §8.1.5 : une panne d'API ne fait pas apparaître un check sur un dépôt non activé.
        return { result: null, published: false, skipped: 'grace' };
      }
      // Au-delà : listes vides + dernière configuration connue (à défaut, les défauts
      // dans les bornes du plancher) + forceState neutre (§6.4).
      const config =
        lastCfg ??
        resolveConfig(floor, { status: 'absent' }, { status: 'absent' }, null, previouslyEvaluated)
          .config;
      const result = evaluate({
        pr,
        platform: adapter.platformProfile(),
        threads: [],
        loose: [],
        config,
        configNotices: floorNotices,
        forceState: { state: 'neutral', because: 'grace-expired' },
        ctx: await this.buildContext(pKey, rKey, config, null, false, () => false),
      });
      return this.publishGates(pr, pKey, rKey, sequence, result, config, previouslyEvaluated);
    }
    await storage.clearDegradedSince(rKey);

    // ————— Étape 7 : résolution de la configuration (§8.1.2) —————
    const pinned = await storage.getPinnedConfig(pKey);
    let resolved = resolveConfig(floor, orgRead, repoRead, pinned, previouslyEvaluated);

    // ————— Étape 8 : périmètre d'installation (§6.4) —————
    if (!previouslyEvaluated && repoRead.status === 'absent') {
      return { result: null, published: false, skipped: 'not-activated' };
    }

    // ————— Étapes 9 à 11 —————
    let evaluation = await this.runEvaluation(pr, pKey, rKey, resolved, floorNotices, current, previouslyEvaluated);

    // ————— Étape 12 : seconde passe sans cache avant un rejet dépendant de la
    // configuration (§8.1.3, règle 3) — seul ce second verdict compte —————
    const needsRefresh = evaluation.result.formatDiagnostics.some(
      (d) => d.code === 'E-UNKNOWN-LABEL' || d.code === 'E-UNKNOWN-DECORATION'
    );
    if (needsRefresh && !evaluation.forced) {
      repoRead = await cache.read(`repo:${rKey}`, ttl, true, () =>
        adapter.fetchConfigFile(pr, { bypassCache: true })
      );
      orgRead =
        configUrl === null
          ? { status: 'absent' }
          : await cache.read(`org:${configUrl}`, ttl, true, () =>
              adapter.fetchOrgConfig(configUrl, { bypassCache: true })
            );
      resolved = resolveConfig(floor, orgRead, repoRead, pinned, previouslyEvaluated);
      evaluation = await this.runEvaluation(pr, pKey, rKey, resolved, floorNotices, current, previouslyEvaluated);
    }
    const result = evaluation.result;

    // ————— Étape 13 : persister l'état de calcul —————
    if (pinned === null) await storage.setPinnedConfig(pKey, resolved.config); // épinglé une fois
    await storage.addFirstVerdicts(pKey, result.newFirstVerdicts);
    const known = await storage.getKnownBlockingThreads(pKey);
    const corrected = new Set(result.correctedThreadIds);
    const nextKnown = [...new Set([...known, ...result.blockingThreadIds])].filter(
      (id) => !corrected.has(id)
    ); // déjà observés ∪ blockingThreadIds − correctedThreadIds (§6.1)
    await storage.setKnownBlockingThreads(pKey, nextKnown);
    // Assouplissement du mode : invalider immédiatement le cache (§6.3.3).
    if (lastCfg && softer(resolved.config.mode, lastCfg.mode)) cache.invalidateAll();
    await storage.setLastEffectiveConfig(rKey, resolved.config);

    // ————— Étapes 14 à 16 —————
    return this.publishGates(pr, pKey, rKey, sequence, result, resolved.config, previouslyEvaluated, current);
  }

  /** Étapes 9 à 11 : armer forceState depuis les notices de résolution, pré-résoudre les
   * appartenances, évaluer. */
  private async runEvaluation(
    pr: PrRef,
    pKey: string,
    rKey: string,
    resolved: { config: EffectiveConfig; notices: Notice[] },
    floorNotices: Notice[],
    current: CurrentState,
    previouslyEvaluated: boolean
  ): Promise<{ result: ComplianceResult; forced: boolean }> {
    const { adapter, storage } = this.deps;
    const config = resolved.config;
    const notices: Notice[] = [...floorNotices, ...resolved.notices];

    // ————— Étape 9 : config-vanished / invalid-config → forceState (§8.1.5) —————
    let forceState: { state: 'neutral' | 'failure'; because: 'config-vanished' | 'invalid-config' } | undefined;
    if (notices.some((n) => n.kind === 'config-vanished')) {
      forceState = { state: 'neutral', because: 'config-vanished' };
    } else if (notices.some((n) => n.kind === 'invalid-config')) {
      forceState = {
        state: config.mode === 'enforce' ? 'failure' : 'neutral',
        because: 'invalid-config',
      };
    }

    // Prérequis au passage en enforce (§8.2) : groupe habilité vide → signalé à chaque tour.
    if (config.mode === 'enforce' && config.resolverOverrideGroup.length === 0) {
      notices.push({
        kind: 'config-warning',
        message:
          'mode "enforce" with an empty resolverOverrideGroup: neither "decision" replies nor PR exemptions can unblock a thread whose author is unavailable (§8.2)',
        ref: 'resolverOverrideGroup',
      });
    }
    // §B.7 : latence de détection sur une plateforme sans voie événementielle établie.
    if (
      config.mode === 'enforce' &&
      !this.deps.facts.threadStatusEmitsPrUpdated &&
      config.server.reconcileIntervalSeconds > 60
    ) {
      notices.push({
        kind: 'config-warning',
        message:
          'mode "enforce" with server.reconcileIntervalSeconds > 60 while thread-status changes are only seen at reconciliation: the 60 s NFR of §10 is not met (§B.7)',
        ref: 'server.reconcileIntervalSeconds',
      });
    }
    // §8.2 : targetUrl obligatoire sur toute plateforme sans corps de statut.
    if (this.deps.facts.requiresStatusTargetUrl && config.server.statusTargetUrl === null) {
      notices.push({
        kind: 'config-warning',
        message:
          'server.statusTargetUrl is not set: on a platform without a status body, a red check would be a wall without an explanation (§6.3.1, §8.2)',
        ref: 'server.statusTargetUrl',
      });
    }

    // Date de bascule effective : configuration, sinon stockage (§6.4), sinon null.
    const activatedAt =
      config.activation.activatedAt ?? (await storage.getStoredActivatedAt(rKey));

    // ————— Exemption (§6.3.2) — deux chemins, un seul par plateforme —————
    let exemption: EvaluationContext['exemption'];
    const labelOnPr = current.labels.find((l) => l.name === config.overrideLabel);
    if (this.deps.facts.labelProvenanceExposed) {
      // Provenance exposée : la chaîne se relit intégralement de l'état courant de la PR.
      if (labelOnPr && labelOnPr.by !== undefined && labelOnPr.at !== undefined) {
        exemption = { by: labelOnPr.by, at: labelOnPr.at, labelPresent: true };
      }
    } else {
      // Repli : l'étiquette seule n'accorde jamais l'exemption — le stockage porte la
      // provenance. Une exemption en attente est supprimée, jamais retenue (§6.4).
      const active = await storage.getActiveExemption(pKey);
      if (active) {
        if (active.state === 'pending') {
          await storage.deleteActiveExemption(pKey);
        } else {
          exemption = { by: active.by, at: active.at, labelPresent: labelOnPr !== undefined };
        }
      }
    }

    // ————— Étape 10 : pré-résoudre isInGroup pour tout auteur de la PR, et pour
    // l'auteur de l'exemption active (§9.2.2) —————
    const isOverrideMember = await this.resolveMemberships(config, current, exemption?.by);

    const ctx = await this.buildContext(pKey, rKey, config, exemption ?? null, current.isDraft, isOverrideMember, activatedAt);

    // ————— Étape 11 : évaluation —————
    const result = evaluate({
      pr,
      platform: adapter.platformProfile(),
      threads: current.threads,
      loose: current.loose,
      config,
      configNotices: notices,
      ...(forceState ? { forceState } : {}),
      ctx,
    });
    return { result, forced: forceState !== undefined };
  }

  private async buildContext(
    pKey: string,
    rKey: string,
    config: EffectiveConfig,
    exemption: EvaluationContext['exemption'] | null,
    isDraft: boolean,
    isOverrideMember: (u: UserInfo) => boolean,
    activatedAt?: string | null
  ): Promise<EvaluationContext> {
    const { storage } = this.deps;
    return {
      activatedAt:
        activatedAt !== undefined
          ? activatedAt
          : config.activation.activatedAt ?? (await storage.getStoredActivatedAt(rKey)),
      isDraft,
      ...(exemption ? { exemption } : {}),
      isOverrideMember,
      knownBlockingThreadIds: await storage.getKnownBlockingThreads(pKey),
      firstVerdicts: await storage.getFirstVerdicts(pKey),
    };
  }

  /** Habilitation effective : membre de chacun des groupes cités (§8.1.1) ; liste vide →
   * personne (§8.2). Résolue en amont, la décision reste dans core/. */
  private async resolveMemberships(
    config: EffectiveConfig,
    current: CurrentState,
    exemptionBy?: UserInfo
  ): Promise<(u: UserInfo) => boolean> {
    const groups = config.resolverOverrideGroup;
    const memberById = new Map<string, boolean>();
    if (groups.length === 0) return () => false;

    const users = new Map<string, UserInfo>();
    const add = (u?: UserInfo) => {
      if (u) users.set(u.id, u);
    };
    for (const t of current.threads) {
      add(t.root.author);
      add(t.root.lastEditedBy);
      add(t.resolvedBy);
      for (const r of t.replies) {
        add(r.author);
        add(r.lastEditedBy);
      }
    }
    for (const { comment } of current.loose) add(comment.author);
    add(exemptionBy); // sur le chemin de repli, il peut n'apparaître nulle part sur la PR

    for (const user of users.values()) {
      let member = true;
      for (const group of groups) {
        if (!(await this.deps.adapter.isInGroup(user, group).catch(() => false))) {
          member = false;
          break;
        }
      }
      memberById.set(user.id, member);
    }
    return (u: UserInfo) => memberById.get(u.id) ?? false;
  }

  /** Étapes 14 à 16 : quatre portes, publication, persistance du publié, actions. */
  private async publishGates(
    pr: PrRef,
    pKey: string,
    rKey: string,
    sequence: number,
    result: ComplianceResult,
    config: EffectiveConfig,
    previouslyEvaluated: boolean,
    current?: CurrentState
  ): Promise<EvaluationOutcome> {
    const { adapter, storage, now } = this.deps;

    // 14.a — séquence périmée : abandonnée sans rien écrire (§6.4).
    if (sequence <= (await storage.getLastPublishedSequence(pKey))) {
      return { result, published: false, skipped: 'stale-sequence' };
    }

    // 14.b — le mode n'autorise pas la publication, hors les deux incidents du §8.1.5
    // sur un dépôt déjà évalué (§6.2.2).
    const incident = result.notices.some(
      (n) => n.kind === 'config-vanished' || n.kind === 'invalid-config'
    );
    const modeAllows =
      config.mode === 'warn' ||
      config.mode === 'enforce' ||
      (incident && previouslyEvaluated && result.state === 'neutral');
    if (!modeAllows) {
      return { result, published: false, skipped: 'mode' };
    }

    // 14.c — relire le SHA de tête juste avant la publication (§6.4).
    result.headSha = await adapter.fetchHeadSha(pr).catch(() => undefined as unknown as string);

    // 14.d — résultat identique au dernier publié, SHA compris : ne pas republier ;
    // les actions restent exécutées, elles sont idempotentes (§9.2.4).
    const record = toPublishedRecord(result, now().toISOString());
    const last = await storage.getLastPublished(pKey);
    if (last && identical(last, record)) {
      await this.executeActions(pr, pKey, result);
      return { result, published: false, skipped: 'identical' };
    }

    // 15 — publication ; 16 — persistance du publié PUIS actions, dans cet ordre (§6.4).
    await adapter.publishStatus(pr, result);
    await storage.setLastPublished(pKey, record);
    await storage.setLastPublishedSequence(pKey, sequence);
    await storage.markRepoEvaluated(rKey, record.at); // après la publication, jamais avant
    await this.executeActions(pr, pKey, result);
    if (current) await this.recordIndicators(pr, pKey, rKey, result, config, current);
    return { result, published: true };
  }

  private async executeActions(pr: PrRef, pKey: string, result: ComplianceResult): Promise<void> {
    const { adapter, storage, now } = this.deps;
    if (result.actions.removeLabel) {
      // Le retrait emporte la suppression de l'exemption active persistée : une seule
      // demande, parce que les deux ne se dissocient jamais (§9.2.1, §6.3.2).
      await adapter.removeLabel(pr, result.actions.removeLabel);
      await storage.deleteActiveExemption(pKey);
      const reset = result.notices.find((n) => n.kind === 'exemption-reset');
      if (reset) {
        await storage.appendExemptionLog({
          prKey: pKey,
          action: 'reset',
          by: { id: 'system', login: 'conventional-comments' },
          at: now().toISOString(),
          reason: reset.message,
        });
      }
    } else if (result.actions.addLabel) {
      await adapter.addLabel(pr, result.actions.addLabel); // restauration (§6.3.2, règle 2)
    }
  }

  private async recordIndicators(
    pr: PrRef,
    pKey: string,
    rKey: string,
    result: ComplianceResult,
    config: EffectiveConfig,
    current: CurrentState
  ): Promise<void> {
    const profile = this.deps.adapter.platformProfile();
    const labelDistribution: Record<string, number> = {};
    let serviceAccountComments = 0;
    let compliant = 0;
    let decisions = 0;

    const tally = (comment: CommentInfo, zone: Zone, canCarry: boolean) => {
      if (comment.author.isServiceAccount) serviceAccountComments++;
      const a = analyze(
        {
          body: comment.body,
          platform: profile,
          isSystemGenerated: comment.isSystemGenerated,
          zone,
          canCarryBlockingState: canCarry,
          author: comment.author,
          comment,
        },
        config
      );
      if (a.resolved) {
        const id = a.resolved.label.id; // un alias est comptabilisé sous son label canonique (§8.2)
        labelDistribution[id] = (labelDistribution[id] ?? 0) + 1;
      }
      if (a.outcome === 'analyzed' && a.diagnostics.every((d) => d.severity !== 'error')) compliant++;
    };

    for (const t of current.threads) {
      tally(t.root, 'thread-root', t.canCarryBlockingState);
      for (const r of t.replies) {
        tally(r, 'reply', false);
        const ra = analyze(
          {
            body: r.body,
            platform: profile,
            isSystemGenerated: r.isSystemGenerated,
            zone: 'reply',
            canCarryBlockingState: false,
            author: r.author,
          },
          config
        );
        if (ra.resolved?.label.id === 'decision') decisions++;
      }
    }
    for (const { comment, zone } of current.loose) tally(comment, zone, comment.canCarryBlockingState);

    const sample: IndicatorSample = {
      repoKey: rKey,
      prKey: pKey,
      at: this.deps.now().toISOString(),
      compliantComments: compliant,
      nonCompliantComments: result.counts.nonCompliantComments,
      warnings: result.counts.warnings,
      serviceAccountComments,
      labelDistribution,
      decisionsInBlockingThreads: decisions,
      unresolvedBlockingThreads: result.counts.unresolvedThreads,
    };
    await this.deps.storage.recordIndicatorSample(sample);
  }
}

function toPublishedRecord(result: ComplianceResult, at: string): PublishedRecord {
  return {
    headSha: result.headSha ?? '',
    state: result.state,
    counts: { ...result.counts },
    configFingerprint: result.configFingerprint,
    noticeKinds: [...new Set(result.notices.map((n) => n.kind))].sort(),
    threadIds: result.unresolvedBlockingThreads.map((t) => t.id).sort(),
    commentIds: [...new Set(result.formatDiagnostics.map((d) => d.comment.id))].sort(),
    at,
  };
}

/** Deux résultats sont identiques lorsque headSha, state, les trois compteurs,
 * configFingerprint, l'ensemble des kinds de notices et les identifiants listés
 * coïncident — les horodatages restent hors comparaison (§6.4). */
function identical(a: PublishedRecord, b: PublishedRecord): boolean {
  return (
    a.headSha === b.headSha &&
    a.state === b.state &&
    a.counts.unresolvedThreads === b.counts.unresolvedThreads &&
    a.counts.nonCompliantComments === b.counts.nonCompliantComments &&
    a.counts.warnings === b.counts.warnings &&
    a.configFingerprint === b.configFingerprint &&
    JSON.stringify(a.noticeKinds) === JSON.stringify(b.noticeKinds) &&
    JSON.stringify(a.threadIds) === JSON.stringify(b.threadIds) &&
    JSON.stringify(a.commentIds) === JSON.stringify(b.commentIds)
  );
}

const MODE_ORDER = { off: 0, assist: 1, warn: 2, enforce: 3 } as const;
function softer(next: keyof typeof MODE_ORDER, prev: keyof typeof MODE_ORDER): boolean {
  return MODE_ORDER[next] < MODE_ORDER[prev];
}
