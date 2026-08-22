// Évaluation d'une PR (§6) : deux critères (§6.2.1), gouvernance des résolutions (§6.1),
// monotonie du caractère bloquant et exception de correction (§6.1), exemption (§6.3.2),
// brouillon (§6.2.4), périmètre d'activation (§6.2.3), verdict imposé (forceState).
// Fonction pure : tout ce qui vient du stockage ou de la plateforme entre par
// EvaluationInput ; les actions à exécuter sortent par ComplianceResult.actions.

import type {
  CommentInfo,
  ComplianceResult,
  Diagnostic,
  EvaluationInput,
  Notice,
  ThreadInfo,
  ValidationInput,
  Zone,
} from './types.js';
import { analyze, isCompliant, validate } from './validator.js';
import { fingerprint } from './config/fingerprint.js';
import { CORE_VERSION } from './version.js';
import { t } from './i18n/index.js';

export function evaluate(input: EvaluationInput): ComplianceResult {
  const { pr, platform, threads, loose, config, configNotices, forceState, ctx } = input;
  const lang = config.language;
  const notices: Notice[] = [...configNotices];

  const base = {
    pr,
    mode: config.mode,
    isDraft: ctx.isDraft,
    activatedAt: ctx.activatedAt,
    configFingerprint: fingerprint(config),
    coreVersion: CORE_VERSION,
    docUrl: config.docUrl,
    ...(config.server.statusTargetUrl
      ? { targetUrl: buildTargetUrl(config.server.statusTargetUrl, pr) }
      : {}),
  };

  // ————— Périmètre d'activation (§6.2.3) : la PR est entièrement dedans ou dehors —————
  const inScope =
    ctx.activatedAt !== null && Date.parse(pr.createdAt) > Date.parse(ctx.activatedAt);
  if (!forceState && !inScope) {
    const headline =
      ctx.activatedAt === null
        ? t(lang, 'headline.out-of-scope.no-activation-date')
        : t(lang, 'headline.out-of-scope.before-activation', { activatedAt: ctx.activatedAt });
    return {
      ...base,
      state: 'success', // CA-15 : jamais un échec — et jamais le silence là où le mode publie
      headline,
      formatDiagnostics: [],
      unresolvedBlockingThreads: [],
      notices,
      counts: { unresolvedThreads: 0, nonCompliantComments: 0, warnings: 0 },
      actions: {},
      blockingThreadIds: [],
      correctedThreadIds: [],
      newFirstVerdicts: {},
    };
  }

  // ————— Critère 1 : conformité de format des commentaires soumis à validation —————
  const formatDiagnostics: (Diagnostic & { comment: CommentInfo })[] = [];
  const nonCompliantIds = new Set<string>();
  let warnings = 0;

  const check = (comment: CommentInfo, zone: Zone, canCarryBlockingState: boolean) => {
    const vi: ValidationInput = {
      body: comment.body,
      platform,
      isSystemGenerated: comment.isSystemGenerated,
      zone,
      canCarryBlockingState,
      author: comment.author,
      comment,
    };
    for (const d of validate(vi, config)) {
      formatDiagnostics.push({ ...d, comment });
      if (d.severity === 'error') nonCompliantIds.add(comment.id);
      else warnings++;
    }
  };

  for (const thread of threads) {
    check(thread.root, 'thread-root', thread.canCarryBlockingState);
    for (const reply of thread.replies) check(reply, 'reply', false);
  }
  for (const { comment, zone } of loose) check(comment, zone, comment.canCarryBlockingState);

  // ————— Critère 2 : fils bloquants (§6.1) —————
  const known = new Set(ctx.knownBlockingThreadIds);
  const presentIds = new Set(threads.map((th) => th.id));
  const blockingThreadIds: string[] = [];
  const correctedThreadIds: string[] = [];
  const newFirstVerdicts: Record<string, { blocking: boolean; hadConflict: boolean }> = {};
  const unresolvedBlockingThreads: ThreadInfo[] = [];

  // Suppression d'une racine bloquante (§6.1) — jamais dérivée sous un verdict imposé :
  // les listes vides traduisent alors une lecture impossible, pas une disparition.
  if (!forceState) {
    for (const id of known) {
      if (!presentIds.has(id)) {
        notices.push({
          kind: 'root-deleted',
          message: t(lang, 'notice.root-deleted', { ref: id }),
          ref: id,
        });
      }
    }
  }

  for (const thread of threads) {
    if (!thread.canCarryBlockingState) continue; // §4.1 — jamais compté au critère 2

    const rootInput: ValidationInput = {
      body: thread.root.body,
      platform,
      isSystemGenerated: thread.root.isSystemGenerated,
      zone: 'thread-root',
      canCarryBlockingState: true,
      author: thread.root.author,
      comment: thread.root,
    };
    const analysis = analyze(rootInput, config);
    const nowBlocking = analysis.blocking;
    const hadConflictNow = analysis.hadConflict;

    // Verdict de première observation — écrit une fois, jamais réécrit (§6.4).
    const priorFirst = ctx.firstVerdicts[thread.id];
    if (priorFirst === undefined) {
      newFirstVerdicts[thread.id] = { blocking: nowBlocking, hadConflict: hadConflictNow };
    }
    const first = priorFirst ?? newFirstVerdicts[thread.id]!;

    if (nowBlocking) blockingThreadIds.push(thread.id);

    // Monotonie (§6.1) : une racine observée bloquante ne redevient pas non bloquante
    // par édition — sauf l'exception de correction, sous ses deux conditions.
    let effectiveBlocking = nowBlocking;
    if (!nowBlocking && known.has(thread.id)) {
      const correctionApplies =
        first.hadConflict && // condition 1 — E-CONFLICT dès la première observation
        !hadConflictNow &&
        thread.root.lastEditedBy !== undefined && // sans auteur, l'exception est invérifiable
        thread.root.lastEditedBy.id === thread.root.author.id; // condition 2 — l'auteur corrige
      if (correctionApplies) {
        correctedThreadIds.push(thread.id);
      } else {
        effectiveBlocking = true;
        if (!forceState) {
          const editor = thread.root.lastEditedBy;
          notices.push({
            kind: 'weakening-edit',
            message: t(lang, 'notice.weakening-edit', {
              ref: thread.root.permalink,
              by: editor ? t(lang, 'notice.weakening-edit.by', { login: editor.login }) : '',
            }),
            // Sans auteur exposé, le notice est émis sans acteur — jamais avec l'auteur
            // du dernier événement reçu (§6.1).
            ...(editor ? { actor: editor } : {}),
            ref: thread.root.permalink,
          });
        }
      }
    }

    if (!effectiveBlocking) continue;

    // Résolution retenue ? (§6.1 — deux cas, et deux seulement.)
    let resolvedValidly = false;
    if (thread.resolution === 'resolved') {
      if (thread.resolvedBy === undefined) {
        // Capacité de plateforme absente : acceptée, signalée à chaque évaluation (§6.1).
        resolvedValidly = true;
        notices.push({
          kind: 'resolution-unattributed',
          message: t(lang, 'notice.resolution-unattributed', { ref: thread.root.permalink }),
          ref: thread.root.permalink,
          ...(thread.resolvedAt ? { at: thread.resolvedAt } : {}),
        });
      } else if (thread.resolvedBy.id === thread.root.author.id) {
        resolvedValidly = true; // cas 1 — l'auteur du commentaire racine
      } else if (ctx.isOverrideMember(thread.resolvedBy) && hasValidDecision(thread, input)) {
        resolvedValidly = true; // cas 2 — membre habilité + réponse decision valide (§6.1.1)
      } else {
        const cause =
          ctx.isOverrideMember(thread.resolvedBy)
            ? t(lang, 'notice.resolution-refused.decision-missing')
            : t(lang, 'notice.resolution-refused.not-author', { login: thread.resolvedBy.login });
        notices.push({
          kind: 'resolution-refused',
          message: t(lang, 'notice.resolution-refused', { ref: thread.root.permalink, cause }),
          actor: thread.resolvedBy,
          ref: thread.root.permalink,
          ...(thread.resolvedAt ? { at: thread.resolvedAt } : {}),
        });
      }
    }
    // `resolution: 'unknown'` — aucun statut posé : classé non résolu (§B.5).

    if (!resolvedValidly) unresolvedBlockingThreads.push(thread);
  }

  // ————— Exemption au niveau de la PR (§6.3.2) —————
  let appliedExemption: NonNullable<ComplianceResult['exemption']> | undefined;
  const actions: ComplianceResult['actions'] = {};
  if (ctx.exemption) {
    if (!ctx.isOverrideMember(ctx.exemption.by)) {
      // Refusée, étiquette laissée en place : la trace du geste reste visible (§6.3.2).
      notices.push({
        kind: 'exemption-refused',
        message: t(lang, 'notice.exemption-refused', { login: ctx.exemption.by.login }),
        actor: ctx.exemption.by,
        at: ctx.exemption.at,
      });
    } else {
      const newBlocking = blockingThreadIds.filter((id) => !known.has(id));
      if (newBlocking.length > 0) {
        // Remise à zéro : les deux gestes sont indissociables — retrait de l'étiquette,
        // et suppression de l'exemption active persistée (portée par la même demande).
        actions.removeLabel = config.overrideLabel;
        notices.push({
          kind: 'exemption-reset',
          message: t(lang, 'notice.exemption-reset'),
          ref: newBlocking[0],
        });
      } else {
        appliedExemption = { by: ctx.exemption.by, at: ctx.exemption.at };
        if (!ctx.exemption.labelPresent) {
          // Étiquette disparue d'une exemption confirmée : restaurée, jamais révoquée (§6.3.2).
          actions.addLabel = config.overrideLabel;
          notices.push({
            kind: 'exemption-label-restored',
            message: t(lang, 'notice.exemption-label-restored'),
          });
        }
      }
    }
  }

  // ————— Verdict (§6.2.1, §6.2.2, §6.2.4) —————
  const counts = {
    unresolvedThreads: unresolvedBlockingThreads.length,
    nonCompliantComments: nonCompliantIds.size,
    warnings,
  };

  let state: ComplianceResult['state'];
  if (forceState) {
    state = forceState.state; // le verdict est imposé, quoi que disent les listes (§9.2.2)
    if (!notices.some((n) => n.kind === forceState.because)) {
      notices.push({ kind: forceState.because, message: t(lang, `notice.${forceState.because}`, { detail: '' }) });
    }
  } else {
    const crit2Failed = appliedExemption === undefined && counts.unresolvedThreads > 0;
    const crit1Failed = config.formatSeverity === 'error' && counts.nonCompliantComments > 0;
    state =
      config.mode === 'enforce' && !ctx.isDraft && (crit2Failed || crit1Failed)
        ? 'failure'
        : 'success';
  }

  const headlineParts: string[] = [];
  if (forceState?.because === 'grace-expired') headlineParts.push(t(lang, 'headline.grace-expired'));
  if (forceState?.because === 'invalid-config') {
    const detail = notices.find((n) => n.kind === 'invalid-config')?.message ?? '';
    headlineParts.push(t(lang, 'headline.invalid-config', { detail }));
  }
  if (forceState?.because === 'config-vanished') headlineParts.push(t(lang, 'headline.config-vanished'));
  if (ctx.isDraft) headlineParts.push(t(lang, 'headline.draft'));
  if (appliedExemption) {
    headlineParts.push(
      t(lang, 'headline.exempted', { by: appliedExemption.by.login, at: appliedExemption.at })
    );
  }
  headlineParts.push(
    t(lang, 'headline', {
      threads: counts.unresolvedThreads,
      comments: counts.nonCompliantComments,
      warnings: counts.warnings,
    })
  );

  return {
    ...base,
    state,
    headline: headlineParts.join(' '),
    formatDiagnostics,
    unresolvedBlockingThreads,
    notices,
    counts,
    actions,
    blockingThreadIds,
    correctedThreadIds,
    newFirstVerdicts,
    ...(appliedExemption ? { exemption: appliedExemption } : {}),
  };
}

/** Une réponse `decision` valide au sens du §6.1.1 : postée dans le fil, par un membre
 * habilité, conforme, et dont le motif atteint `rules.minDecisionSubjectLength`. */
function hasValidDecision(thread: ThreadInfo, input: EvaluationInput): boolean {
  for (const reply of thread.replies) {
    const analysis = analyze(
      {
        body: reply.body,
        platform: input.platform,
        isSystemGenerated: reply.isSystemGenerated,
        zone: 'reply',
        canCarryBlockingState: false,
        author: reply.author,
        comment: reply,
      },
      input.config
    );
    if (analysis.outcome !== 'analyzed') continue;
    if (analysis.resolved?.label.id !== 'decision') continue;
    if (!isCompliant(analysis.diagnostics)) continue; // E-DECISION-SUBJECT, E-EMPTY-SUBJECT…
    if (!input.ctx.isOverrideMember(reply.author)) continue;
    return true;
  }
  return false;
}

function buildTargetUrl(baseUrl: string, pr: EvaluationInput['pr']): string {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const path = [pr.platform, ...pr.scope, String(pr.number)].map(encodeURIComponent).join('/');
  return `${trimmed}/pr/${path}`;
}
