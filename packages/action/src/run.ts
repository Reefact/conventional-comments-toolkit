// Une évaluation, de bout en bout (§6.2 à §6.5). Elle porte sur UNE PR — celle que rend
// `currentPr()` — et ne retient rien : tout ce qu'elle sait, elle vient de le lire.
//
// L'ordre compte à un endroit précis : le SHA de tête est relu **juste avant** la
// publication (§6.4), et non au début, pour que le statut se pose sur ce que la PR est au
// moment où on la juge.

import {
  defaultConfig,
  evaluate,
  resolveConfig,
  t,
  vetFloor,
  vettedConfigUrl,
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
  // `vettedConfigUrl(vetFloor(...))`, et JAMAIS `floor.configUrl` brut. C'est la raison
  // d'être de ces deux fonctions, et son commentaire la nomme : la lecture du niveau 2 part
  // AVANT `resolveConfig()`, qui est pourtant seule à savoir qu'un plancher de version non
  // supportée n'est pas appliqué. Lire l'URL brute, c'est interroger le document
  // d'organisation qu'un plancher écarté désigne — et, si cette URL répond 500, publier un
  // check en échec jusque sous `assist`, là où le §8.1.1 veut le repli du plancher.
  // Le service compagnon et le résolveur de l'extension passaient tous deux par ces
  // fonctions ; la réécriture en a perdu le chemin avec lui.
  const orgRead = await adapter.fetchOrgConfig(vettedConfigUrl(vetFloor(floor)));
  // `resolveConfig` est pure : les deux documents lui arrivent déjà lus, et elle n'a plus ni
  // épinglage ni mémoire de dépôt à réclamer. Elle revérifie le plancher pour son compte —
  // `vetFloor` est idempotente, et la dupliquer ici coûte moins que de la faire circuler.
  const resolved = resolveConfig(floor, orgRead, repoRead);
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
  // L'habilitation effective est l'INTERSECTION des listes en présence : il faut être membre
  // de CHACUN des groupes cités (§8.1.1). Le mot « intersection » y décrit l'appartenance, et
  // non la liste — ajouter un groupe RESTREINT, puisqu'il faut désormais l'être aussi. Une
  // première rédaction sortait au premier groupe satisfait, ce qui habilitait sur l'un
  // QUELCONQUE d'entre eux : permissif, et dans le sens qui compte.
  //
  // La liste vide se traite à part, et pas par commodité : « membre de tous les groupes » est
  // VRAI sur une liste vide, ce qui habiliterait tout le monde là où le §8.2 veut n'habiliter
  // personne — son repli terminal.
  const overrideMembers = new Set<string>();
  if (config.resolverOverrideGroup.length > 0) {
    for (const candidate of actorsToTest(threads, labels)) {
      const memberships = await Promise.all(
        config.resolverOverrideGroup.map((group) => adapter.isInGroup(candidate, group))
      );
      if (memberships.every(Boolean)) overrideMembers.add(candidate.id);
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
      // L'exemption est LUE de l'étiquette et de sa provenance (§6.3.2) : sans `by` ni `at`,
      // l'étiquette seule n'en accorde aucune — elle ne dit ni qui l'a posée ni quand, donc
      // ni l'habilitation ni la remise à zéro ne sont vérifiables.
      ...(exemptionLabel?.by && exemptionLabel.at
        ? { exemption: { by: exemptionLabel.by, at: exemptionLabel.at } }
        : {}),
      isOverrideMember: (user) => overrideMembers.has(user.id),
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

/** Le statut en échec d'une incapacité à évaluer (§6.4). */
async function publishReadFailure(
  adapter: VerifierPlatformAdapter,
  pr: PrRef,
  detail: string,
  config: EffectiveConfig | null
): Promise<RunOutcome> {
  // Le verdict reste calculé par `core/` (§9.2.1) : le vérificateur ARME `forceState` sur
  // `read-failed`, il ne fabrique pas le résultat. Une rédaction antérieure le construisait
  // ici, faute d'un cas ouvert — le §6.4 exigeait l'échec, mais `forceState` n'en offrait
  // aucun chemin. Le §9.2.2 l'ouvre désormais.
  //
  // Sans configuration résolue — plancher injoignable —, les défauts du produit servent de
  // support. Ce n'est pas la configuration sous laquelle on aurait jugé : c'est celle qu'il
  // faut bien nommer pour publier, et l'empreinte qu'elle produit dit exactement ça.
  const effective = config ?? defaultConfig();
  const result = evaluate({
    pr,
    platform: adapter.platformProfile(),
    threads: [],
    loose: [],
    config: effective,
    configNotices: [{ kind: 'read-failed', message: t(effective.language, 'notice.read-failed', { detail }) }],
    forceState: { state: 'failure', because: 'read-failed' },
    ctx: {
      activatedAt: effective.activation.activatedAt,
      isDraft: false, // non lu : la lecture est précisément ce qui a échoué
      isOverrideMember: () => false,
    },
  });
  // Relu ici comme ailleurs (§6.4). Si cette lecture échoue à son tour, l'exception remonte :
  // c'est la panne que le §6.4 admet ne pas pouvoir couvrir, celle qui emporte la publication
  // avec la lecture, et où le statut précédent décide.
  result.headSha = await adapter.fetchHeadSha(pr);
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
