// Adaptateur du vérificateur GitHub (annexe A). Traduit et transporte ; ne juge jamais (§9.2.4).
//
// Il s'exécute DANS le dépôt qu'il protège, authentifié par le `GITHUB_TOKEN` que le runner
// lui remet : rien à héberger, aucun secret à stocker, aucune base. Il ne souscrit à aucun
// webhook et ne vérifie aucune signature — l'intégration continue le réveille (§6.4, §A.8).
//
// L'état des fils passe par GraphQL : l'API REST n'expose pas `isResolved` de façon fiable
// (§A.6). Le reste passe par REST.

import {
  encodeSummary,
  type CommentInfo,
  type ComplianceResult,
  type ConfigRead,
  type PlatformProfile,
  type PrRef,
  type ThreadInfo,
  type UserInfo,
  type Zone,
} from '@cct/core';
import type { VerifierPlatformAdapter } from './adapter.js';
import { renderHumanOutput } from './render.js';

const CHECK_NAME = 'conventional-comments';

export interface GithubVerifierOptions {
  /** Hôte d'API — https://api.github.com, ou https://{ghes}/api/v3 pour GHE Server. */
  apiBase?: string;
  /** Hôte WEB des PrRef. Dérivé d'`apiBase` par défaut ; le poser explicitement n'a de sens
   * que si l'hôte web diffère de l'hôte d'API d'une manière que la dérivation ne couvre pas. */
  webHost?: string;
  /** Le jeton que le runner remet au job — `secrets.GITHUB_TOKEN`. Il vaut pour la durée de
   * l'exécution et ne tourne pas pendant : rien à rafraîchir, donc une valeur et non un
   * accesseur, contrairement au jeton d'installation d'une App. */
  token: string;
  /** La PR que cette évaluation évalue, quand l'événement ne la désigne pas lui-même : c'est
   * la matrice de la répartition qui l'injecte (§6.4, §A.8). */
  prNumber?: number;
  /** Le dépôt, sous la forme `owner/name` — `GITHUB_REPOSITORY` sur un runner. */
  repository: string;
  /** La charge de l'événement qui a déclenché l'exécution, déjà lue depuis
   * `GITHUB_EVENT_PATH`. Absente sur une exécution planifiée, qui ne désigne aucune PR. */
  event?: unknown;
  /** La langue de la sortie humaine (§6.3.1, §8.1) — lue sur la configuration résolue. Une
   * exécution n'évalue qu'une PR, donc ne résout qu'une configuration : un accesseur suffit,
   * sans état mutable à synchroniser. */
  language?: () => string | null;
  checkName?: string;
  fetchImpl?: typeof fetch;
}

/** L'hôte web dérivé d'un hôte d'API : `api.github.com` → `github.com`,
 * `ghe.corp/api/v3` → `ghe.corp`. */
export function webHostFromApiBase(apiBase: string): string {
  return new URL(apiBase).hostname.replace(/^api\./, '');
}

export class GithubVerifierAdapter implements VerifierPlatformAdapter {
  #apiBase: string;
  #webHost: string;
  #token: string;
  #prNumber: number | undefined;
  #scope: string[];
  #event: unknown;
  #language: () => string | null;
  #checkName: string;
  #fetchImpl: typeof fetch;

  constructor(opts: GithubVerifierOptions) {
    const apiBase = opts.apiBase ?? 'https://api.github.com';
    const [owner, name] = opts.repository.split('/');
    if (!owner || !name) throw new Error(`repository must be "owner/name", got "${opts.repository}"`);
    this.#apiBase = apiBase;
    this.#webHost = opts.webHost ?? webHostFromApiBase(apiBase);
    this.#token = opts.token;
    this.#prNumber = opts.prNumber;
    this.#scope = [owner, name];
    this.#event = opts.event;
    this.#language = opts.language ?? (() => null);
    this.#checkName = opts.checkName ?? CHECK_NAME;
    this.#fetchImpl = opts.fetchImpl ?? fetch;
  }

  platformProfile(): PlatformProfile {
    // Même profil que côté client, même source (§9.2.4) : bloc de suggestion identifié par
    // l'info string `suggestion` (§A.7).
    return { id: 'github', suggestionInfoString: 'suggestion' };
  }

  /** La PR injectée par la répartition l'emporte sur celle de l'événement : sur un job de
   * matrice, l'événement est celui de l'exécution planifiée, qui n'en désigne aucune. */
  async currentPr(): Promise<PrRef> {
    if (this.#prNumber !== undefined) return this.#byNumber(this.#prNumber);
    const fromEvent = prNumberFromEvent(this.#event);
    if (fromEvent === null) {
      throw new Error(
        'no pull request to evaluate: the event designates none and no number was injected'
      );
    }
    return this.#byNumber(fromEvent);
  }

  /** Les PR ouvertes du dépôt sur une exécution planifiée ; celles de l'exécution d'origine
   * pour le workflow compagnon, qui les porte dans `workflow_run.pull_requests`.
   *
   * Ce que cette liste contient pour une PR de fork est À VÉRIFIER PAR UNE MESURE (§A.8) : le
   * repli par la branche de tête est écrit parce qu'il faut un comportement défini dans les
   * deux cas, pas parce que le cas vide serait établi. */
  async pullRequestsToDispatch(): Promise<PrRef[]> {
    const fromRun = workflowRunPullRequests(this.#event);
    if (fromRun !== null) {
      if (fromRun.numbers.length > 0) {
        return Promise.all(fromRun.numbers.map((n) => this.#byNumber(n)));
      }
      // Liste vide : retrouver la PR par la branche de tête de l'exécution d'origine, sans
      // quoi toutes ces exécutions partageraient un même groupe de concurrence et deux PR de
      // forks différents s'annuleraient l'une l'autre (§A.8).
      if (fromRun.headBranch !== null) return this.#byHeadBranch(fromRun.headBranch);
      return [];
    }
    return this.#openPrs();
  }

  async fetchThreads(pr: PrRef): Promise<ThreadInfo[]> {
    const [owner, name] = pr.scope;
    const threads: ThreadInfo[] = [];
    let cursor: string | null = null;
    for (;;) {
      const data: GraphQlThreads = await this.#graphql(THREADS_QUERY, {
        owner,
        name,
        number: Number(pr.number),
        cursor,
      });
      const connection = data.repository.pullRequest.reviewThreads;
      for (const node of connection.nodes) {
        const comments = [...node.comments.nodes];
        // Réponses au-delà de 100 : pagination par fil.
        let commentCursor = node.comments.pageInfo?.hasNextPage
          ? node.comments.pageInfo.endCursor
          : null;
        while (commentCursor) {
          const more: GraphQlThreadComments = await this.#graphql(THREAD_COMMENTS_QUERY, {
            id: node.id,
            cursor: commentCursor,
          });
          comments.push(...more.node.comments.nodes);
          commentCursor = more.node.comments.pageInfo.hasNextPage
            ? more.node.comments.pageInfo.endCursor
            : null;
        }
        if (comments.length === 0) continue;
        const [rootRaw, ...replyRaws] = comments;
        threads.push({
          id: node.id,
          pr,
          root: this.#toComment(rootRaw!),
          replies: replyRaws.map((reply) => this.#toComment(reply)),
          // Conversation marquée Resolved (§A.6) ; l'état est toujours exposé en GraphQL.
          resolution: node.isResolved ? 'resolved' : 'unresolved',
          ...(node.resolvedBy ? { resolvedBy: this.#toUser(node.resolvedBy.login) } : {}),
          canCarryBlockingState: true, // fil de diff : porte un état de résolution (§4.1)
        });
      }
      if (!connection.pageInfo.hasNextPage) break;
      cursor = connection.pageInfo.endCursor;
    }
    return threads;
  }

  async fetchStandaloneComments(pr: PrRef): Promise<{ comment: CommentInfo; zone: Zone }[]> {
    const [owner, name] = pr.scope;
    const out: { comment: CommentInfo; zone: Zone }[] = [];
    // Zone `conversation` : commentaires généraux de la PR — aucun état de résolution sur
    // GitHub (§4.1).
    const issueComments = await this.#restPaged<RestIssueComment>(
      `/repos/${owner}/${name}/issues/${pr.number}/comments`
    );
    for (const comment of issueComments) {
      out.push({
        comment: {
          id: `ic-${comment.id}`,
          author: this.#toUser(comment.user.login, String(comment.user.id), comment.user.type === 'Bot'),
          body: comment.body ?? '',
          createdAt: comment.created_at,
          ...(comment.updated_at ? { updatedAt: comment.updated_at } : {}),
          permalink: comment.html_url,
          isSystemGenerated: false,
          canCarryBlockingState: false,
        },
        zone: 'conversation',
      });
    }
    // Zone `review-body` : corps des revues soumises en lot (§A.7).
    const reviews = await this.#restPaged<RestReview>(
      `/repos/${owner}/${name}/pulls/${pr.number}/reviews`
    );
    for (const review of reviews) {
      out.push({
        comment: {
          id: `rv-${review.id}`,
          author: this.#toUser(review.user.login, String(review.user.id), review.user.type === 'Bot'),
          body: review.body ?? '',
          createdAt: review.submitted_at ?? '',
          permalink: review.html_url,
          isSystemGenerated: false,
          canCarryBlockingState: false,
        },
        zone: 'review-body',
      });
    }
    return out;
  }

  async fetchConfigFile(pr: PrRef): Promise<ConfigRead> {
    const [owner, name] = pr.scope;
    try {
      const res = await this.#raw(`/repos/${owner}/${name}/contents/.conventional-comments.json`, {
        accept: 'application/vnd.github.raw+json',
      });
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  async fetchOrgConfig(url: string | null): Promise<ConfigRead> {
    if (url === null) return { status: 'absent' };
    try {
      const res = await this.#fetchImpl(url);
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  /** Provenance exposée (§A.7) : la timeline rend les événements `labeled` avec leur acteur
   * et leur horodatage. Toute la timeline est parcourue — la provenance d'une étiquette peut
   * être loin dans l'historique d'une PR active, et s'arrêter à la première page la perdrait. */
  async fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]> {
    const [owner, name] = pr.scope;
    const current = await this.#restPaged<{ name: string }>(
      `/repos/${owner}/${name}/issues/${pr.number}/labels`
    );
    const timeline = await this.#restPaged<TimelineEvent>(
      `/repos/${owner}/${name}/issues/${pr.number}/timeline`
    );
    return current.map((label) => {
      const events = timeline.filter((e) => e.event === 'labeled' && e.label?.name === label.name);
      const last = events[events.length - 1];
      return {
        name: label.name,
        ...(last?.actor
          ? { by: this.#toUser(last.actor.login, String(last.actor.id), last.actor.type === 'Bot') }
          : {}),
        ...(last?.created_at ? { at: last.created_at } : {}),
      };
    });
  }

  async fetchHeadSha(pr: PrRef): Promise<string> {
    const data = await this.#rest<{ head: { sha: string } }>(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/pulls/${pr.number}`
    );
    return data.head.sha;
  }

  async isDraft(pr: PrRef): Promise<boolean> {
    const data = await this.#rest<{ draft: boolean }>(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/pulls/${pr.number}`
    );
    return data.draft;
  }

  /** Check run `conventional-comments` : la ligne cc/1 dans `output.title` — le seul
   * emplacement rendu sur la page de la PR —, la sortie humaine dans le corps (§6.3.1, §A.8).
   *
   * `neutral` compte parmi les conclusions qui SATISFONT une vérification obligatoire : c'est
   * la raison pour laquelle le §6.4 refuse de publier `neutral` sur une lecture en échec. */
  async publishStatus(pr: PrRef, result: ComplianceResult): Promise<void> {
    await this.#rest(`/repos/${pr.scope[0]}/${pr.scope[1]}/check-runs`, {
      method: 'POST',
      body: {
        name: this.#checkName,
        head_sha: result.headSha,
        status: 'completed',
        conclusion: result.state,
        ...(result.targetUrl ? { details_url: result.targetUrl } : {}),
        output: {
          title: encodeSummary(result),
          summary: renderHumanOutput(result, this.#language()),
        },
      },
    });
  }

  /** Idempotente : retirer une étiquette absente est sans effet, jamais une erreur (§9.2.4). */
  async removeLabel(pr: PrRef, name: string): Promise<void> {
    const res = await this.#raw(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/issues/${pr.number}/labels/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) throw new Error(`removeLabel failed: HTTP ${res.status}`);
  }

  /** Sur GitHub, `resolverOverrideGroup` est une LISTE DE COMPTES — des logins séparés par
   * des virgules (§A.7). L'appartenance se tranche donc ici, sans aucun appel d'API.
   *
   * Un slug d'équipe (`org/team-slug`) serait plus naturel et n'est pas utilisable : le
   * résoudre demande la permission d'organisation *Members*, et le `GITHUB_TOKEN` n'a aucune
   * portée d'organisation (§A.8). Appeler l'API des équipes échouerait donc en 403 sur tout
   * dépôt réel — ce qui ferait dépendre l'habilitation d'une erreur réseau. */
  async isInGroup(user: UserInfo, group: string): Promise<boolean> {
    const logins = group
      .split(',')
      .map((login) => login.trim().toLowerCase())
      .filter((login) => login !== '');
    return logins.includes(user.login.toLowerCase());
  }

  async #byNumber(number: number): Promise<PrRef> {
    const data = await this.#rest<{ created_at: string }>(
      `/repos/${this.#scope[0]}/${this.#scope[1]}/pulls/${number}`
    );
    return {
      platform: 'github',
      createdAt: data.created_at,
      host: this.#webHost,
      scope: [...this.#scope],
      number,
    };
  }

  async #openPrs(): Promise<PrRef[]> {
    const prs = await this.#restPaged<{ number: number; created_at: string }>(
      `/repos/${this.#scope[0]}/${this.#scope[1]}/pulls?state=open`
    );
    return prs.map((pr) => ({
      platform: 'github',
      createdAt: pr.created_at,
      host: this.#webHost,
      scope: [...this.#scope],
      number: pr.number,
    }));
  }

  async #byHeadBranch(branch: string): Promise<PrRef[]> {
    const prs = await this.#restPaged<{ number: number; created_at: string }>(
      `/repos/${this.#scope[0]}/${this.#scope[1]}/pulls?state=open&head=${encodeURIComponent(branch)}`
    );
    return prs.map((pr) => ({
      platform: 'github',
      createdAt: pr.created_at,
      host: this.#webHost,
      scope: [...this.#scope],
      number: pr.number,
    }));
  }

  #toComment(raw: GraphQlComment): CommentInfo {
    return {
      id: raw.id,
      author: this.#toUser(raw.author?.login ?? 'ghost', undefined, raw.author?.__typename === 'Bot'),
      body: raw.body,
      createdAt: raw.createdAt,
      ...(raw.lastEditedAt ? { updatedAt: raw.lastEditedAt } : {}),
      permalink: raw.url,
      isSystemGenerated: false,
      canCarryBlockingState: true,
    };
  }

  #toUser(login: string, id?: string, isBot = false): UserInfo {
    return { id: id ?? `login:${login.toLowerCase()}`, login, isServiceAccount: isBot };
  }

  async #graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.#raw('/graphql', { method: 'POST', body: { query, variables } });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: unknown[] };
    if (!body.data || (body.errors && body.errors.length > 0)) {
      throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
    }
    return body.data;
  }

  async #rest<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.#raw(path, opts);
    if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Pagination REST : suit `page` tant que la page est pleine. */
  async #restPaged<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page++) {
      const batch = await this.#rest<T[]>(`${path}${sep}per_page=100&page=${page}`);
      out.push(...batch);
      if (batch.length < 100) return out;
    }
  }

  async #raw(
    path: string,
    opts: { method?: string; body?: unknown; accept?: string } = {}
  ): Promise<Response> {
    return this.#fetchImpl(`${this.#apiBase}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        authorization: `Bearer ${this.#token}`,
        accept: opts.accept ?? 'application/vnd.github+json',
        'user-agent': 'conventional-comments-toolkit',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  }
}

/** Le numéro de PR que porte l'événement, ou `null` s'il n'en désigne aucune.
 *
 * `issue_comment` arrive aussi sur les issues simples, qui ne référencent aucune PR : le
 * champ `issue.pull_request` n'existe que sur les issues qui SONT des PR. */
export function prNumberFromEvent(event: unknown): number | null {
  if (event === null || typeof event !== 'object') return null;
  const payload = event as {
    pull_request?: { number?: number };
    issue?: { number?: number; pull_request?: unknown };
  };
  if (typeof payload.pull_request?.number === 'number') return payload.pull_request.number;
  if (payload.issue?.pull_request !== undefined && typeof payload.issue.number === 'number') {
    return payload.issue.number;
  }
  return null;
}

/** Les PR de l'exécution d'origine d'un `workflow_run`, et sa branche de tête pour le repli.
 * Rend `null` quand l'événement n'est pas un `workflow_run` — un cas distinct de la liste
 * vide, qui elle demande le repli par branche. */
export function workflowRunPullRequests(
  event: unknown
): { numbers: number[]; headBranch: string | null } | null {
  if (event === null || typeof event !== 'object') return null;
  const run = (event as { workflow_run?: { pull_requests?: { number: number }[]; head_branch?: string } })
    .workflow_run;
  if (run === undefined) return null;
  return {
    numbers: (run.pull_requests ?? []).map((pr) => pr.number),
    headBranch: run.head_branch ?? null,
  };
}

const COMMENT_FIELDS = `
  id
  body
  createdAt
  lastEditedAt
  url
  author { login __typename }`;

const THREADS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            resolvedBy { login }
            comments(first: 100) {
              pageInfo { hasNextPage endCursor }
              nodes {${COMMENT_FIELDS}
              }
            }
          }
        }
      }
    }
  }`;

const THREAD_COMMENTS_QUERY = `
  query($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {${COMMENT_FIELDS}
          }
        }
      }
    }
  }`;

interface GraphQlComment {
  id: string;
  body: string;
  createdAt: string;
  lastEditedAt: string | null;
  url: string;
  author: { login: string; __typename?: string } | null;
}

interface GraphQlThreadComments {
  node: {
    comments: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: GraphQlComment[];
    };
  };
}

interface GraphQlThreads {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          isResolved: boolean;
          resolvedBy: { login: string } | null;
          comments: {
            pageInfo?: { hasNextPage: boolean; endCursor: string | null };
            nodes: GraphQlComment[];
          };
        }[];
      };
    };
  };
}

interface RestIssueComment {
  id: number;
  body: string | null;
  created_at: string;
  updated_at?: string;
  html_url: string;
  user: { id: number; login: string; type?: string };
}

interface RestReview {
  id: number;
  body: string | null;
  submitted_at?: string;
  html_url: string;
  user: { id: number; login: string; type?: string };
}

interface TimelineEvent {
  event: string;
  label?: { name: string };
  actor?: { id: number; login: string; type?: string };
  created_at?: string;
}
