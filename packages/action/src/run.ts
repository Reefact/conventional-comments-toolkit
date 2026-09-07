// Évaluation d'une PR en profil A (§6.4.1) : la séquence du §6.4.2, moins tout ce que la
// plateforme rend elle-même.
//
// Ce qui TOMBE par rapport au service hébergé, et pourquoi :
//   - le compteur de séquence par PR → `concurrency` annule l'exécution superséedée, et la
//     règle de récence est portée par le statut publié (besoin 3, §6.4.1) ;
//   - la fenêtre de coalescence → même mécanisme ;
//   - le stockage → l'état des trois objets du besoin 4 voyage dans le check run ;
//   - le délai de grâce → une lecture impossible laisse l'exécution en échec, et le
//     recours est le rejeu, à un clic (§6.4.1). `degradedSince` n'aurait aucun endroit où
//     vivre, et surtout aucune utilité : le runner et l'API lue sont la même plateforme.
//
// Ce qui NE tombe pas : l'intégralité du jugement. `resolveConfig()` puis `evaluate()`
// sont appelées exactement comme côté service, avec les mêmes entrées.

import {
  evaluate,
  encodeSummary,
  parseFloorDocument,
  renderHumanOutput,
  resolveConfig,
  resolveOverrideMembership,
  vetFloor,
  vettedConfigUrl,
  MembershipUnreachableError,
  SUPPORTED_FLOOR_VERSION,
  type ComplianceResult,
  type ConfigRead,
  type EffectiveConfig,
  type EvaluationContext,
  type Floor,
  type Notice,
  type PrRef,
} from '@cct/core';
import { GithubClient, ReadFailedError } from './client.js';
import {
  decodeState,
  digestResult,
  encodeState,
  fromFirstVerdicts,
  toFirstVerdicts,
  type CarriedState,
} from './state.js';

export interface RunOptions {
  client: GithubClient;
  /** Marqueur de récence de cette exécution (besoin 3, §6.4.1). Deux exécutions
   * concurrentes sur le MÊME SHA se départagent dessus : la plus ancienne n'écrase pas la
   * plus récente. Il doit croître avec le temps de démarrage — l'identifiant d'exécution
   * du runner, préfixé de l'horodatage de démarrage, en tient lieu. */
  runMarker: string;
  /** §8.1.1 — document de plancher, servi par une URL que l'organisation contrôle. Un
   * workflow versionné dans le dépôt qu'il protège n'est PAS un canal de plancher. */
  floorUrl?: string | null;
  log?: (message: string) => void;
}

export type SkipReason =
  | 'mode' // §6.2.2 — `off` et `assist` ne publient pas
  | 'identical' // §6.4 — résultat identique au dernier publié
  | 'superseded'; // §6.4.1 besoin 3 — une exécution plus récente a déjà publié

export interface RunOutcome {
  published: boolean;
  skipped?: SkipReason;
  result: ComplianceResult;
}

export async function evaluatePullRequest(pr: PrRef, opts: RunOptions): Promise<RunOutcome> {
  const { client, runMarker } = opts;
  const log = opts.log ?? (() => {});

  // ————— Le statut déjà publié : à la fois la mémoire du besoin 4 et le témoin de
  // récence et d'idempotence (§A.8.1) —————
  const previous = await client.findPublishedCheckRun(pr);
  const carried = previous ? decodeState(previous.text) : null;
  // « Déjà évalué » (§6.4, §8.1.5) se lit ici sur la PR plutôt que sur le dépôt. C'est un
  // périmètre plus étroit que celui du service, et délibérément : il ne peut faire publier
  // un incident que sur une PR que ce vérificateur a réellement évaluée.
  const previouslyEvaluated = carried !== null;

  // ————— Plancher (§8.1.1) : relu à chaque exécution —————
  const floorNotices: Notice[] = [];
  let floor: Floor | null = null;
  if (opts.floorUrl) {
    const read = await client.fetchUrl(opts.floorUrl);
    if (read.status === 'unreachable') {
      throw new ReadFailedError(`floor document unreachable: ${read.reason}`);
    }
    if (read.status === 'found') {
      let raw: unknown;
      try {
        raw = JSON.parse(read.text);
      } catch (e) {
        raw = undefined;
        floorNotices.push({
          kind: 'invalid-config',
          message: `floor document is not valid JSON: ${String(e)} (§8.1.1)`,
          ref: 'floorUrl',
        });
      }
      if (raw !== undefined) {
        const parsed = parseFloorDocument(raw);
        if ('error' in parsed) {
          // Un plancher mal formé ne s'applique pas, et ne s'efface pas en silence : sans
          // dernier plancher valide à substituer — ce support n'en garde aucun —, le fait
          // est signalé et la résolution se fait sans plancher.
          floorNotices.push({
            kind: 'invalid-config',
            message: `floor document rejected: ${parsed.error} (§8.1.1)`,
            ref: 'floorUrl',
          });
        } else {
          floor = parsed.floor;
        }
      }
    }
  }
  const vetted = vetFloor(floor);
  if (floor && vetted.unsupported) {
    floorNotices.push({
      kind: 'unsupported-version',
      message: `floor version ${floor.floorVersion} exceeds supported version ${SUPPORTED_FLOOR_VERSION} (§8.1.1)`,
      ref: 'floorVersion',
    });
  }
  const configUrl = vettedConfigUrl(vetted);

  // ————— Étape 5 : relire l'état courant — jamais le contenu de l'événement —————
  const [repoRead, orgRead, threads, loose, labels, prState] = await Promise.all([
    client.fetchConfigFile(pr),
    client.fetchUrl(configUrl),
    client.fetchThreads(pr),
    client.fetchStandaloneComments(pr),
    client.fetchLabels(pr),
    client.fetchPrState(pr),
  ]);
  // Étape 6, version profil A : pas de délai de grâce, pas d'état dégradé à retenir. Une
  // lecture impossible fait échouer l'exécution, et le rejeu est le recours (§6.4.1).
  if (repoRead.status === 'unreachable') {
    throw new ReadFailedError(`repository configuration unreachable: ${repoRead.reason}`);
  }
  if (orgRead.status === 'unreachable') {
    throw new ReadFailedError(`organization configuration unreachable: ${orgRead.reason}`);
  }

  // ————— Étape 7 : résolution de la configuration (§8.1.2) —————
  const pinned = carried?.pinned ?? null;
  let resolved = resolveConfig(floor, orgRead, repoRead, pinned, previouslyEvaluated);

  // Étape 8 — périmètre d'installation. En profil A, l'acte d'activation est l'ajout du
  // workflow : le dépôt qui exécute ce code a opté. Il n'y a donc rien à court-circuiter
  // ici ; un dépôt sans fichier de configuration retombe sur les défauts, dont le mode
  // `assist` ne publie de toute façon aucun statut (§6.2.2).

  // ————— Étapes 9 à 12 —————
  let evaluation = await runOnce(pr, opts, resolved, floorNotices, {
    threads,
    loose,
    labels,
    isDraft: prState.isDraft,
    carried,
  });

  // Étape 12 : seconde passe sans cache avant un rejet dépendant de la configuration
  // (§8.1.3, règle 3). Ce support n'a pas de cache entre deux exécutions — chacune relit
  // tout —, mais il en a un DANS l'exécution : les deux lectures ci-dessus. La règle porte
  // donc, et la seconde passe relit les DEUX niveaux, comme l'exige l'étape 12.
  const needsRefresh = evaluation.formatDiagnostics.some(
    (d) => d.code === 'E-UNKNOWN-LABEL' || d.code === 'E-UNKNOWN-DECORATION'
  );
  if (needsRefresh) {
    const [freshRepo, freshOrg]: [ConfigRead, ConfigRead] = await Promise.all([
      client.fetchConfigFile(pr),
      client.fetchUrl(configUrl),
    ]);
    if (freshRepo.status !== 'unreachable' && freshOrg.status !== 'unreachable') {
      resolved = resolveConfig(floor, freshOrg, freshRepo, pinned, previouslyEvaluated);
      evaluation = await runOnce(pr, opts, resolved, floorNotices, {
        threads,
        loose,
        labels,
        isDraft: prState.isDraft,
        carried,
      });
    }
  }
  const result = evaluation;

  // ————— Étape 14 : les quatre portes —————
  // 14.b — le mode n'autorise pas la publication, hors les deux incidents du §8.1.5 sur
  // une PR déjà évaluée (§6.2.2).
  const incident = result.notices.some(
    (n) => n.kind === 'config-vanished' || n.kind === 'invalid-config'
  );
  const modeAllows =
    resolved.config.mode === 'warn' ||
    resolved.config.mode === 'enforce' ||
    (incident && previouslyEvaluated && result.state === 'neutral');
  if (!modeAllows) {
    log(`mode "${resolved.config.mode}": nothing published (§6.2.2)`);
    return { published: false, skipped: 'mode', result };
  }

  // 14.c — le SHA de tête, relu juste avant la publication (§6.4). Il l'a été au-dessus,
  // avec le reste de l'état ; le relire ici coûterait un appel pour fermer une fenêtre que
  // la porte 14.a ferme déjà — une exécution plus récente republie sur le SHA suivant.
  result.headSha = prState.headSha;

  // ————— Étape 13 : l'état de calcul, assemblé AVANT les portes —————
  // L'ordre compte, et il n'est pas cosmétique. Le service hébergé persiste à l'étape 13
  // puis décide de publier à l'étape 14 : chez lui, ne pas republier ne fait rien perdre.
  // Ici, l'état voyage DANS le statut : ne pas publier, c'est ne pas persister. Il faut
  // donc connaître l'état suivant avant de décider, et la porte d'idempotence doit porter
  // sur le couple (verdict, état) — voir plus bas.
  const digest = digestResult(result);
  const corrected = new Set(result.correctedThreadIds);
  const known = [...new Set([...(carried?.known ?? []), ...result.blockingThreadIds])].filter(
    (id) => !corrected.has(id)
  ); // déjà observés ∪ blockingThreadIds − correctedThreadIds (§6.1)
  const next: CarriedState = {
    run: runMarker,
    digest,
    // Épinglée à la PREMIÈRE évaluation, jamais réécrite ensuite (§8.1.3).
    ...(pinned ? { pinned } : { pinned: resolved.config }),
    first: { ...(carried?.first ?? {}), ...fromFirstVerdicts(result.newFirstVerdicts) },
    known,
  };

  // 14.a et 14.d, fondues en une seule lecture : le statut publié porte le marqueur de
  // récence ET l'empreinte du résultat (§6.4.1).
  if (previous && carried && previous.headSha === result.headSha) {
    if (carried.run > runMarker) {
      // Besoin 3 : une exécution plus ancienne n'écrase pas le résultat d'une plus
      // récente. La comparaison ne porte que sur le même SHA — publier sur un SHA neuf
      // n'écrase rien.
      log(`a more recent run (${carried.run}) already published on ${result.headSha}`);
      return { published: false, skipped: 'superseded', result };
    }
    // Un verdict identique NE SUFFIT PAS à s'abstenir : l'état peut avoir changé sans que
    // le verdict bouge. Un fil bloquant vu pour la première fois alors qu'il est DÉJÀ
    // résolu ne figure ni dans les fils non résolus ni dans les diagnostics, donc pas dans
    // l'empreinte — mais il entre dans l'ensemble des fils observés du §6.1. S'abstenir
    // alors le perdrait, et rouvrirait l'évasion en deux gestes que la monotonie ferme :
    // introduire un `E-CONFLICT` sur un fil résolu, puis le « corriger » pour éteindre le
    // fil. Le §6.4 définit l'identité de deux RÉSULTATS ; ce support publie aussi de la
    // mémoire, et sa porte doit donc porter sur les deux.
    if (carried.digest === digest && sameCarriedState(carried, next)) {
      await executeActions(client, pr, result, log);
      return { published: false, skipped: 'identical', result };
    }
  }

  // ————— Étape 15 : publication —————
  await client.publishCheckRun(pr, {
    headSha: result.headSha,
    conclusion: result.state,
    title: encodeSummary(result),
    summary: renderHumanOutput(result),
    text: encodeState(next),
    ...(result.targetUrl ? { detailsUrl: result.targetUrl } : {}),
  });

  // ————— Étape 16 : les actions, APRÈS une publication réussie (§6.4) —————
  await executeActions(client, pr, result, log);
  return { published: true, result };
}

/** Égalité de l'état porté, aux seuls champs qui sont de la mémoire : le marqueur de
 * récence et l'empreinte n'en font pas partie — le premier change à chaque exécution, la
 * seconde est comparée séparément. */
function sameCarriedState(a: CarriedState, b: CarriedState): boolean {
  const sameKnown =
    a.known.length === b.known.length &&
    [...a.known].sort().join(',') === [...b.known].sort().join(',');
  if (!sameKnown) return false;
  const ka = Object.keys(a.first).sort();
  const kb = Object.keys(b.first).sort();
  if (ka.join(',') !== kb.join(',')) return false;
  return ka.every((k) => a.first[k]![0] === b.first[k]![0] && a.first[k]![1] === b.first[k]![1]);
}

interface CurrentState {
  threads: Awaited<ReturnType<GithubClient['fetchThreads']>>;
  loose: Awaited<ReturnType<GithubClient['fetchStandaloneComments']>>;
  labels: Awaited<ReturnType<GithubClient['fetchLabels']>>;
  isDraft: boolean;
  carried: CarriedState | null;
}

/** Étapes 9 à 11 : armer `forceState` depuis les notices, pré-résoudre les habilitations,
 * évaluer. Identique au service — c'est du jugement, et le jugement ne dépend pas du
 * support (§6.4.1). */
async function runOnce(
  pr: PrRef,
  opts: RunOptions,
  resolved: { config: EffectiveConfig; notices: Notice[] },
  floorNotices: Notice[],
  current: CurrentState
): Promise<ComplianceResult> {
  const config = resolved.config;
  const notices: Notice[] = [...floorNotices, ...resolved.notices];

  // ————— Étape 9 : config-vanished / invalid-config → forceState (§8.1.5) —————
  let forceState: { state: 'neutral' | 'failure'; because: 'config-vanished' | 'invalid-config' } | undefined;
  if (notices.some((n) => n.kind === 'config-vanished')) {
    forceState = { state: 'neutral', because: 'config-vanished' };
  } else if (notices.some((n) => n.kind === 'invalid-config')) {
    forceState = { state: config.mode === 'enforce' ? 'failure' : 'neutral', because: 'invalid-config' };
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

  // ————— Exemption (§6.3.2) — GitHub expose la provenance des étiquettes (§A.7), donc
  // la chaîne se relit intégralement de l'état courant : aucun objet persistant, et le
  // chemin de repli du §6.3.2 n'a pas lieu d'être ici —————
  let exemption: EvaluationContext['exemption'];
  const labelOnPr = current.labels.find((l) => l.name === config.overrideLabel);
  if (labelOnPr && labelOnPr.by !== undefined && labelOnPr.at !== undefined) {
    exemption = { by: labelOnPr.by, at: labelOnPr.at, labelPresent: true };
  }

  // ————— Étape 10 : pré-résoudre isInGroup (§9.2.2) —————
  const isOverrideMember = await resolveOverrideMembership(
    (u, g) => opts.client.isInGroup(u, g),
    config,
    current.threads,
    current.loose,
    [exemption?.by]
  );

  // ————— Étape 11 : évaluation —————
  return evaluate({
    pr,
    platform: opts.client.platformProfile(),
    threads: current.threads,
    loose: current.loose,
    config,
    configNotices: notices,
    ...(forceState ? { forceState } : {}),
    ctx: {
      activatedAt: config.activation.activatedAt ?? null,
      isDraft: current.isDraft,
      ...(exemption ? { exemption } : {}),
      isOverrideMember,
      knownBlockingThreadIds: current.carried?.known ?? [],
      firstVerdicts: toFirstVerdicts(current.carried?.first ?? {}),
    },
  });
}

/** `result.actions` : jamais les deux (§6.3.2). Un refus d'écriture n'est pas une raison
 * de faire échouer l'évaluation — le statut, lui, est publié : c'est lui qui porte O3. */
async function executeActions(
  client: GithubClient,
  pr: PrRef,
  result: ComplianceResult,
  log: (m: string) => void
): Promise<void> {
  try {
    if (result.actions.removeLabel) {
      await client.removeLabel(pr, result.actions.removeLabel);
    } else if (result.actions.addLabel) {
      await client.addLabel(pr, result.actions.addLabel); // restauration (§6.3.2, règle 2)
    }
  } catch (e) {
    log(
      `label action failed (${String(e)}): grant "pull-requests: write" if this repository uses the PR exemption of §6.3.2`
    );
  }
}

export { MembershipUnreachableError };
