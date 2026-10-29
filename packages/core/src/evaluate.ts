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
    language: lang,
    // Pas de `targetUrl` : le §6.3.1 n'en fait plus le porteur de quoi que ce soit, et
    // aucun porteur configurable ne la fournit (§9.2.1). Le vérificateur y met, s'il le
    // veut, le lien de l'exécution qui publie — ce que `core/` ne peut pas connaître.
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
  const unresolvedBlockingThreads: ThreadInfo[] = [];
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
    // Le verdict se lit de l'état COURANT, et de lui seul (§6.1). Une racine éditée de
    // `issue:` en `note:` n'est donc plus bloquante au tour suivant, et rien n'est signalé :
    // le vérificateur ne compare à aucun passé qu'il ne détient pas.
    //
    // Une rédaction antérieure maintenait la MONOTONIE — un fil observé bloquant le restait
    // malgré une édition — avec une exception pour la correction d'un `E-CONFLICT` par
    // l'auteur de la racine. Les deux demandaient de conserver, par fil, le verdict de
    // première observation, et la seconde de savoir QUI avait édité. Le §6.4 ne le permet
    // plus, et §6.1 l'assume : la suppression de la racine reste le seul chemin pour
    // éteindre un fil sans le résoudre.
    if (!analyze(rootInput, config).blocking) continue;

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
      // §6.3.2 — l'exemption est remise à zéro par tout fil bloquant NON RÉSOLU dont le
      // commentaire racine a été créé APRÈS la pose de l'étiquette. La comparaison porte sur
      // `root.createdAt` et l'`at` de l'étiquette, deux faits de l'état courant.
      //
      // Une rédaction antérieure comparait les fils bloquants à « l'ensemble des fils déjà
      // observés au tour précédent », ce qui demandait de les conserver. Sans mémoire, cet
      // ensemble est vide et TOUT fil bloquant devient « nouveau » : l'exemption se remettait
      // à zéro sur la PR même qu'elle existe pour débloquer.
      const postedAt = Date.parse(ctx.exemption.at);
      const newBlocking = unresolvedBlockingThreads.filter(
        (thread) => Date.parse(thread.root.createdAt) > postedAt
      );
      if (newBlocking.length > 0) {
        // Remise à zéro : retirer l'étiquette suffit désormais, l'exemption n'étant plus
        // persistée nulle part — elle est lue sur la PR, à chaque évaluation (§6.3.2).
        actions.removeLabel = config.overrideLabel;
        notices.push({
          kind: 'exemption-reset',
          message: t(lang, 'notice.exemption-reset'),
          // Le lien permanent, et non l'identifiant du fil : le §6.3.1 demande qu'une cause
          // soit atteignable en un clic au plus (CA-25).
          ref: newBlocking[0]!.root.permalink,
        });
      } else {
        // L'exemption est LUE de l'étiquette et de sa provenance (§6.3.2) : si l'étiquette
        // n'est pas là, il n'y a pas d'exemption à appliquer, et rien à restaurer. Une
        // rédaction antérieure reposait l'étiquette disparue d'une exemption « confirmée »
        // — ce qui demandait de se souvenir de l'avoir confirmée, et un `addLabel()` que le
        // §9.2.4 ne donne plus.
        appliedExemption = { by: ctx.exemption.by, at: ctx.exemption.at };
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
    // Le verdict est imposé, quoi que disent les listes (§9.2.2) — mais une PR en
    // brouillon reçoit un statut toujours informatif, jamais en échec (§6.2.4) : un
    // échec imposé y est rabattu en neutre, le motif restant porté par les notices.
    state = forceState.state === 'failure' && ctx.isDraft ? 'neutral' : forceState.state;
    if (!notices.some((n) => n.kind === forceState.because)) {
      notices.push({ kind: forceState.because, message: t(lang, `notice.${forceState.because}`, { detail: '' }) });
    }
  } else {
    const crit2Failed = counts.unresolvedThreads > 0;
    const crit1Failed = config.formatSeverity === 'error' && counts.nonCompliantComments > 0;
    // Exemption admise : « le statut passe au vert » (§6.3.2) — c'est le mécanisme qui
    // débloque une PR entière (§6.1.1), y compris quand un commentaire non conforme d'un
    // tiers ne peut pas être corrigé. Les compteurs restent non nuls (§6.5).
    state =
      config.mode === 'enforce' &&
      !ctx.isDraft &&
      appliedExemption === undefined &&
      (crit2Failed || crit1Failed)
        ? 'failure'
        : 'success';
  }

  const headlineParts: string[] = [];
  if (forceState?.because === 'invalid-config') {
    const detail = notices.find((n) => n.kind === 'invalid-config')?.message ?? '';
    headlineParts.push(t(lang, 'headline.invalid-config', { detail }));
  }
  if (forceState?.because === 'read-failed') {
    const detail = notices.find((n) => n.kind === 'read-failed')?.message ?? '';
    headlineParts.push(t(lang, 'headline.read-failed', { detail }));
  }
  if (forceState?.because === 'activation-undated') {
    headlineParts.push(t(lang, 'headline.activation-undated'));
  }
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
