// Une évaluation, de bout en bout (§6.2 à §6.5). Elle porte sur UNE PR — celle que rend
// `currentPr()` — et ne retient rien : tout ce qu'elle sait, elle vient de le lire.
//
// L'ordre compte à un endroit précis : le SHA de tête est relu **juste avant** la
// publication (§6.4), et non au début, pour que le statut se pose sur ce que la PR est au
// moment où on la juge.

import {
  evaluate,
  fingerprint,
  resolveConfig,
  t,
  CORE_VERSION,
  type ComplianceResult,
  type EffectiveConfig,
  type Floor,
  type Notice,
  type PrRef,
  type UserInfo,
} from '@cct/core';
import type { VerifierPlatformAdapter } from './adapter.js';

export interface RunOptions {
  adapter: VerifierPlatformAdapter;
  /** URL du document de plancher (§8.1.1), servie par l'organisation et référencée par la
   * configuration d'exécution du vérificateur. `null` quand aucune politique d'entreprise
   * n'existe : le plancher vaut alors `{"minimumMode": "off"}` et n'impose aucune règle. */
  floorUrl?: string | null;
  fetchImpl?: typeof fetch;
}

export interface RunOutcome {
  pr: PrRef;
  /** Faux quand le mode commande le silence (§6.2.2) — jamais quand quelque chose a échoué :
   * une incapacité à évaluer publie, elle se tait d'autant moins (§6.4). */
  published: boolean;
  result: ComplianceResult | null;
  /** La configuration appliquée, quand elle a pu être résolue. Sert au rendu et aux tests. */
  config: EffectiveConfig | null;
}

/** Évalue la PR courante et publie ce que le mode autorise. */
export async function runOnce(opts: RunOptions): Promise<RunOutcome> {
  const { adapter } = opts;
  const pr = await adapter.currentPr();
  const fetchImpl = opts.fetchImpl ?? fetch;

  // ————— Configuration (§8.1.2) : plancher, puis organisation, puis dépôt —————
  const floorRead = await readFloor(opts.floorUrl ?? null, fetchImpl);
  if (floorRead.unreachable !== null) {
    return publishReadFailure(adapter, pr, floorRead.unreachable, null);
  }
  const floor = floorRead.floor;

  const repoRead = await adapter.fetchConfigFile(pr);
  const orgRead = await adapter.fetchOrgConfig(floor?.configUrl ?? null);
  // `resolveConfig` est pure et n'a plus ni épinglage ni mémoire de dépôt : le second et le
  // troisième argument sont morts ici, et disparaîtront de sa signature avec le serveur.
  const resolved = resolveConfig(floor, orgRead, repoRead, null, false);
  const config = resolved.config;

  // Une lecture impossible n'est ni une absence ni une invalidité : c'est une incapacité à
  // évaluer, et le check échoue (§6.4, §8.1.5). Publier un neutre laisserait passer le
  // merge — `neutral` satisfait une vérification obligatoire, exactement comme le statut
  // vert périmé qu'on aurait laissé en place en ne publiant rien.
  const unreachable = firstUnreachable([
    ['repository configuration', repoRead],
    ['organisation configuration', orgRead],
  ]);
  if (unreachable !== null) return publishReadFailure(adapter, pr, unreachable, config);

  // ————— Ce que le mode autorise à publier (§6.2.2) —————
  const forceState = armForceState(config, resolved.notices);
  // `off` et `assist` ne publient rien — sauf les deux incidents du §8.1.5, publiés en
  // neutre quel que soit le mode.
  if ((config.mode === 'off' || config.mode === 'assist') && forceState === undefined) {
    return { pr, published: false, result: null, config };
  }

  // ————— Lecture de l'état courant de la PR —————
  let threads, loose, labels, isDraft;
  try {
    [threads, loose, labels, isDraft] = await Promise.all([
      adapter.fetchThreads(pr),
      adapter.fetchStandaloneComments(pr),
      adapter.fetchLabels(pr),
      adapter.isDraft(pr),
    ]);
  } catch (e) {
    return publishReadFailure(adapter, pr, String(e), config);
  }

  // L'habilitation est résolue EN AMONT (§9.2.1) : `evaluate()` est pure et n'appelle rien.
  // Sur GitHub cela ne coûte aucun appel — le groupe est une liste de comptes (§A.7).
  const overrideMembers = new Set<string>();
  for (const candidate of actorsToTest(threads, labels)) {
    for (const group of config.resolverOverrideGroup) {
      if (await adapter.isInGroup(candidate, group)) {
        overrideMembers.add(candidate.id);
        break;
      }
    }
  }

  const exemptionLabel = labels.find((label) => label.name === config.overrideLabel);
  const result = evaluate({
    pr,
    platform: adapter.platformProfile(),
    threads,
    loose,
    config,
    configNotices: resolved.notices,
    ...(forceState ? { forceState } : {}),
    ctx: {
      activatedAt: config.activation.activatedAt,
      isDraft,
      ...(exemptionLabel?.by && exemptionLabel.at
        ? { exemption: { by: exemptionLabel.by, at: exemptionLabel.at, labelPresent: true } }
        : {}),
      isOverrideMember: (user) => overrideMembers.has(user.id),
      // Le vérificateur ne retient rien d'une exécution à la suivante (§6.4) : il n'a ni
      // fils bloquants connus, ni verdicts de première observation. Ces deux champs
      // disparaîtront d'`EvaluationContext` avec le reste de la mémoire.
      knownBlockingThreadIds: [],
      firstVerdicts: {},
    },
  });

  // §6.4 — relu juste avant publication, jamais au début.
  result.headSha = await adapter.fetchHeadSha(pr);
  await adapter.publishStatus(pr, result);

  // La SEULE écriture du contrat en dehors du statut, et elle est idempotente (§9.2.4).
  if (result.actions.removeLabel) await adapter.removeLabel(pr, result.actions.removeLabel);

  return { pr, published: true, result, config };
}

/** Arme le verdict imposé que les notices de configuration commandent (§8.1.5).
 *
 * Trois cas, et trois seulement : activation non datée → neutre quel que soit le mode ;
 * configuration invalide → échec sous `enforce`, neutre en dessous. */
function armForceState(
  config: EffectiveConfig,
  notices: Notice[]
): { state: 'neutral' | 'failure'; because: 'activation-undated' | 'invalid-config' } | undefined {
  if (notices.some((notice) => notice.kind === 'invalid-config')) {
    return {
      state: config.mode === 'enforce' ? 'failure' : 'neutral',
      because: 'invalid-config',
    };
  }
  // Un fait de l'état courant, et un seul : aucun niveau ne résout `activation.activatedAt`.
  // Un fichier absent en est la cause la plus fréquente, jamais la seule — un fichier bien
  // présent qui omet la clé donne le même état et reçoit le même traitement (§8.1.5).
  if (config.activation.activatedAt === null) {
    return { state: 'neutral', because: 'activation-undated' };
  }
  return undefined;
}

/** Le statut en échec d'une incapacité à évaluer (§6.4).
 *
 * Il ne passe PAS par `evaluate()`, et c'est délibéré : le §9.2.1 n'ouvre `forceState` qu'à
 * trois cas — activation non datée, et configuration invalide de part et d'autre d'`enforce`
 * — et `NoticeKind` n'a aucun membre pour une lecture qui échoue. Construire ici le résultat
 * est donc ce que la spécification permet aujourd'hui ; lui donner un verdict imposé
 * demanderait d'ouvrir les deux, ce qui est une décision de spécification, pas de code. */
async function publishReadFailure(
  adapter: VerifierPlatformAdapter,
  pr: PrRef,
  detail: string,
  config: EffectiveConfig | null
): Promise<RunOutcome> {
  const lang = config?.language ?? null;
  const result: ComplianceResult = {
    pr,
    headSha: await adapter.fetchHeadSha(pr),
    mode: config?.mode ?? 'assist',
    state: 'failure',
    isDraft: false,
    activatedAt: config?.activation.activatedAt ?? null,
    headline: t(lang, 'headline.read-failed', { detail }),
    configFingerprint: config ? fingerprint(config) : '',
    coreVersion: CORE_VERSION,
    formatDiagnostics: [],
    unresolvedBlockingThreads: [],
    notices: [],
    docUrl: config?.docUrl ?? '',
    counts: { unresolvedThreads: 0, nonCompliantComments: 0, warnings: 0 },
    actions: {},
    // Les trois champs de mémoire que le §9.2.1 ne liste plus. Un vérificateur sans mémoire
    // les produit vides de toute façon ; ils quitteront `ComplianceResult` avec le serveur,
    // seul consommateur qui les lise encore.
    blockingThreadIds: [],
    correctedThreadIds: [],
    newFirstVerdicts: {},
  };
  await adapter.publishStatus(pr, result);
  return { pr, published: true, result, config };
}

function firstUnreachable(
  reads: [string, { status: string; reason?: string }][]
): string | null {
  for (const [what, read] of reads) {
    if (read.status === 'unreachable') return `${what} unreachable — ${read.reason ?? 'no reason given'}`;
  }
  return null;
}

/** Le plancher, lu depuis l'URL que l'organisation contrôle (§8.1.1). Une URL absente n'est
 * pas une panne — c'est le déploiement public, où le plancher vaut `{"minimumMode": "off"}`
 * et n'impose aucune règle. Une URL présente mais injoignable en est une. */
async function readFloor(
  url: string | null,
  fetchImpl: typeof fetch
): Promise<{ floor: Floor | null; unreachable: string | null }> {
  if (url === null) return { floor: null, unreachable: null };
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { floor: null, unreachable: `floor document unreachable — HTTP ${res.status}` };
    return { floor: JSON.parse(await res.text()) as Floor, unreachable: null };
  } catch (e) {
    return { floor: null, unreachable: `floor document unreachable — ${String(e)}` };
  }
}

/** Les comptes dont l'habilitation peut changer un verdict : ceux qui ont résolu un fil, et
 * celui qui a posé l'étiquette d'exemption. Les tester tous serait inutile — `evaluate()` ne
 * consulte `isOverrideMember` que sur eux. */
function actorsToTest(
  threads: { resolvedBy?: UserInfo; replies: { author: UserInfo }[] }[],
  labels: { by?: UserInfo }[]
): UserInfo[] {
  const seen = new Map<string, UserInfo>();
  for (const thread of threads) {
    if (thread.resolvedBy) seen.set(thread.resolvedBy.id, thread.resolvedBy);
    // Une réponse `decision` ne compte que si son auteur est habilité (§6.1.1).
    for (const reply of thread.replies) seen.set(reply.author.id, reply.author);
  }
  for (const label of labels) if (label.by) seen.set(label.by.id, label.by);
  return [...seen.values()];
}
