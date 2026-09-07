// Point d'entrée du vérificateur en profil A (§6.4.1) : lit l'environnement que le runner
// GitHub fournit, en déduit quelle(s) PR évaluer, et délègue à `evaluatePullRequest`.
//
// Aucun secret n'est lu ailleurs que dans l'entrée `token` : le jeton du runner suffit, et
// c'est ce qui rend ce support déployable sans rien confier à l'organisation (§A.8).

import { readFileSync } from 'node:fs';
import { GithubClient, webHostFromApiBase } from './client.js';
import { evaluatePullRequest, type RunOutcome } from './run.js';
import type { PrRef } from '@cct/core';

type Env = Record<string, string | undefined>;

export interface Resolved {
  client: GithubClient;
  owner: string;
  repo: string;
  /** `null` = réconciliation : toutes les PR ouvertes (§6.4, déclenchement 2). */
  prNumber: number | null;
  runMarker: string;
  floorUrl: string | null;
}

export class InputError extends Error {}

/** Les événements dont on sait extraire une PR. Ceux qui n'en désignent aucune —
 * `schedule`, `workflow_run`, `workflow_dispatch` sans numéro — déclenchent la
 * réconciliation, qui est le comportement utile plutôt qu'une erreur. */
export function pullRequestNumberFromEvent(eventName: string, payload: unknown): number | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as {
    pull_request?: { number?: number };
    issue?: { number?: number; pull_request?: unknown };
    number?: number;
  };
  switch (eventName) {
    case 'pull_request':
    case 'pull_request_target':
    case 'pull_request_review':
    case 'pull_request_review_comment':
      return p.pull_request?.number ?? p.number ?? null;
    case 'issue_comment':
      // `issue.pull_request` n'existe que sur les issues qui SONT des PR : un commentaire
      // d'issue simple ne désigne aucune PR, et n'en fait pas évaluer une par erreur.
      return p.issue?.pull_request !== undefined ? (p.issue.number ?? null) : null;
    default:
      return null;
  }
}

/** Marqueur de récence (besoin 3, §6.4.1). L'horodatage domine, l'identifiant d'exécution
 * départage : la comparaison est lexicographique, et l'ISO 8601 s'y ordonne comme le
 * temps. Il repose sur l'horloge du runner, ce qui suffit ici — deux exécutions assez
 * proches pour que la dérive d'horloge compte sont déjà départagées par `concurrency`, et
 * la porte ne s'applique de toute façon qu'à deux publications sur un MÊME SHA. */
export function runMarkerFrom(env: Env, now: Date): string {
  const runId = (env['GITHUB_RUN_ID'] ?? '0').padStart(20, '0');
  const attempt = (env['GITHUB_RUN_ATTEMPT'] ?? '1').padStart(4, '0');
  return `${now.toISOString()}|${runId}|${attempt}`;
}

export function resolveInputs(env: Env, now: Date = new Date()): Resolved {
  // Les noms `CCT_*` sont ceux que pose `action.yml`. Une action COMPOSITE ne reçoit pas
  // les entrées sous la forme `INPUT_*` — c'est une convention des actions JavaScript —,
  // et un nom d'entrée à tiret ne fait pas un nom de variable d'environnement sûr.
  const token = env['CCT_TOKEN'] ?? env['GITHUB_TOKEN'];
  if (!token) {
    throw new InputError(
      'no token: pass `token: ${{ secrets.GITHUB_TOKEN }}` to the action (§A.8.3)'
    );
  }
  const slug = env['GITHUB_REPOSITORY'];
  if (!slug || !slug.includes('/')) {
    throw new InputError('GITHUB_REPOSITORY is missing or malformed (expected "owner/repo")');
  }
  const [owner, repo] = slug.split('/') as [string, string];

  // `GITHUB_API_URL` porte l'instance : c'est ce qui fait fonctionner ce code sur GitHub
  // Enterprise Server sans configuration supplémentaire (§A.8.4).
  const apiBase = env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const webHost = env['GITHUB_SERVER_URL']
    ? new URL(env['GITHUB_SERVER_URL']).hostname
    : webHostFromApiBase(apiBase);

  const explicit = (env['CCT_PR_NUMBER'] ?? '').trim();
  let prNumber: number | null = null;
  if (explicit !== '') {
    const n = Number(explicit);
    if (!Number.isInteger(n) || n <= 0) throw new InputError(`invalid pr-number "${explicit}"`);
    prNumber = n;
  } else {
    const eventName = env['GITHUB_EVENT_NAME'] ?? '';
    const eventPath = env['GITHUB_EVENT_PATH'];
    let payload: unknown = null;
    if (eventPath) {
      try {
        payload = JSON.parse(readFileSync(eventPath, 'utf8'));
      } catch {
        payload = null; // charge illisible : on retombe sur la réconciliation
      }
    }
    prNumber = pullRequestNumberFromEvent(eventName, payload);
  }

  const checkName = (env['CCT_CHECK_NAME'] ?? '').trim();
  const floorUrl = (env['CCT_FLOOR_URL'] ?? '').trim();

  return {
    client: new GithubClient({
      apiBase,
      webHost,
      token: async () => token,
      ...(checkName !== '' ? { checkName } : {}),
    }),
    owner,
    repo,
    prNumber,
    runMarker: runMarkerFrom(env, now),
    floorUrl: floorUrl === '' ? null : floorUrl,
  };
}

export async function run(env: Env, log: (m: string) => void = console.log): Promise<void> {
  const { client, owner, repo, prNumber, runMarker, floorUrl } = resolveInputs(env);

  let prs: PrRef[];
  if (prNumber === null) {
    prs = await client.listOpenPrs(owner, repo);
    log(`reconciliation: ${prs.length} open pull request(s) (§6.4)`);
  } else {
    prs = [await client.fetchPr(owner, repo, prNumber)];
  }

  const failures: string[] = [];
  for (const pr of prs) {
    try {
      const outcome: RunOutcome = await evaluatePullRequest(pr, {
        client,
        runMarker,
        floorUrl,
        log: (m) => log(`#${pr.number}: ${m}`),
      });
      log(describe(pr, outcome));
    } catch (e) {
      // En réconciliation, une PR qui échoue ne doit pas emporter les autres : chacune est
      // indépendante, et abandonner les suivantes laisserait leur statut périmé.
      failures.push(`#${pr.number}: ${String(e)}`);
      log(`#${pr.number}: evaluation failed — ${String(e)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} pull request(s) could not be evaluated:\n${failures.join('\n')}`
    );
  }
}

function describe(pr: PrRef, outcome: RunOutcome): string {
  if (outcome.published) {
    return `#${pr.number}: published "${outcome.result.state}" — ${outcome.result.headline}`;
  }
  return `#${pr.number}: nothing published (${outcome.skipped})`;
}

// Exécution directe (`node dist/main.js`) : c'est ce que lance `action.yml`.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run(process.env).catch((e: unknown) => {
    // Une exécution en échec est le signal prévu : le statut précédent reste en place et
    // le rejeu du workflow est le recours (§6.4.1). On ne publie SURTOUT pas un verdict
    // qu'on n'a pas pu calculer.
    console.error(String(e instanceof Error ? e.stack ?? e.message : e));
    process.exitCode = 1;
  });
}
