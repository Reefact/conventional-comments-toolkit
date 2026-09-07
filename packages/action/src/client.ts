// Accès GitHub du vérificateur en profil A (§6.4.1) : tout ce que l'exécution lit et
// écrit, et rien d'autre. Comme l'adaptateur du §9.2.4, il traduit et transporte ; il ne
// juge jamais.
//
// L'état des fils passe par GraphQL — l'API REST n'expose pas `isResolved` de façon
// fiable (§A.6) — le reste par REST.

import type {
  CommentInfo,
  ConfigRead,
  PlatformProfile,
  PrRef,
  ThreadInfo,
  UserInfo,
  Zone,
} from '@cct/core';

export const CHECK_NAME = 'conventional-comments';

/** Un check run déjà publié, tel qu'on le relit pour retrouver l'état (§A.8.1). */
export interface PublishedCheckRun {
  headSha: string;
  title: string;
  text: string;
}

export interface GithubClientOptions {
  /** `https://api.github.com`, ou `https://{ghes}/api/v3` sur GitHub Enterprise Server. */
  apiBase?: string;
  /** Hôte web des `PrRef` — dérivé d'`apiBase` par défaut. */
  webHost?: string;
  /** Jeton fourni par le runner (`GITHUB_TOKEN`). Lu par appel, jamais mémorisé ici. */
  token: () => Promise<string>;
  checkName?: string;
  fetchImpl?: typeof fetch;
}

/** `api.github.com` → `github.com`, `ghe.corp/api/v3` → `ghe.corp`. */
export function webHostFromApiBase(apiBase: string): string {
  return new URL(apiBase).hostname.replace(/^api\./, '');
}

/** Une lecture d'API qui a échoué après les tentatives prévues. Elle ne se confond pas
 * avec une absence : le §6.4 leur donne des suites opposées. */
export class ReadFailedError extends Error {}

export class GithubClient {
  #opts: Required<Omit<GithubClientOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: GithubClientOptions) {
    const apiBase = opts.apiBase ?? 'https://api.github.com';
    this.#opts = {
      apiBase,
      webHost: opts.webHost ?? webHostFromApiBase(apiBase),
      token: opts.token,
      checkName: opts.checkName ?? CHECK_NAME,
      fetchImpl: opts.fetchImpl ?? fetch,
    };
  }

  get webHost(): string {
    return this.#opts.webHost;
  }

  get checkName(): string {
    return this.#opts.checkName;
  }

  platformProfile(): PlatformProfile {
    // Même profil que côté extension, même source (§9.2.4).
    return { id: 'github', suggestionInfoString: 'suggestion' };
  }

  async listOpenPrs(owner: string, repo: string): Promise<PrRef[]> {
    const prs = await this.#restPaged<{ number: number; created_at: string }>(
      `/repos/${owner}/${repo}/pulls?state=open`
    );
    return prs.map((p) => ({
      platform: 'github',
      createdAt: p.created_at,
      host: this.#opts.webHost,
      scope: [owner, repo],
      number: p.number,
    }));
  }

  async fetchPr(owner: string, repo: string, number: number): Promise<PrRef> {
    const data = await this.#rest<{ created_at: string }>(`/repos/${owner}/${repo}/pulls/${number}`);
    return {
      platform: 'github',
      createdAt: data.created_at,
      host: this.#opts.webHost,
      scope: [owner, repo],
      number,
    };
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
        // Réponses au-delà de 100 : pagination par fil (budget d'appels, §6.4).
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
          root: toComment(rootRaw!),
          replies: replyRaws.map(toComment),
          resolution: node.isResolved ? 'resolved' : 'unresolved',
          ...(node.resolvedBy ? { resolvedBy: toUser(node.resolvedBy.login) } : {}),
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
    // Zone `conversation` : commentaires généraux de la PR — aucun état de résolution
    // sur GitHub (§4.1).
    for (const c of await this.#restPaged<RestIssueComment>(
      `/repos/${owner}/${name}/issues/${pr.number}/comments`
    )) {
      out.push({
        comment: {
          id: `ic-${c.id}`,
          author: toUser(c.user.login, String(c.user.id), c.user.type === 'Bot'),
          body: c.body ?? '',
          createdAt: c.created_at,
          ...(c.updated_at ? { updatedAt: c.updated_at } : {}),
          permalink: c.html_url,
          isSystemGenerated: false,
          canCarryBlockingState: false,
        },
        zone: 'conversation',
      });
    }
    // Zone `review-body` : corps des revues soumises en lot (§A.7).
    for (const r of await this.#restPaged<RestReview>(
      `/repos/${owner}/${name}/pulls/${pr.number}/reviews`
    )) {
      out.push({
        comment: {
          id: `rv-${r.id}`,
          author: toUser(r.user.login, String(r.user.id), r.user.type === 'Bot'),
          body: r.body ?? '',
          createdAt: r.submitted_at ?? '',
          permalink: r.html_url,
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

  /** Document d'organisation (§8.1.2) et document de plancher (§8.1.1) : deux lectures
   * d'une URL que l'organisation contrôle, faites sans le jeton du dépôt — il n'y a
   * aucune raison de présenter les droits du dépôt à un hôte tiers. */
  async fetchUrl(url: string | null): Promise<ConfigRead> {
    if (url === null) return { status: 'absent' };
    try {
      const res = await this.#opts.fetchImpl(url);
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  /** Provenance exposée (§A.7) : la timeline rend les `labeled` avec acteur et date.
   * C'est ce qui dispense GitHub du chemin de repli d'exemption du §6.3.2. */
  async fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]> {
    const [owner, name] = pr.scope;
    const current = await this.#restPaged<{ name: string }>(
      `/repos/${owner}/${name}/issues/${pr.number}/labels`
    );
    if (current.length === 0) return []; // aucune étiquette : la timeline est inutile
    const timeline = await this.#restPaged<TimelineEvent>(
      `/repos/${owner}/${name}/issues/${pr.number}/timeline`
    );
    return current.map((label) => {
      const events = timeline.filter((e) => e.event === 'labeled' && e.label?.name === label.name);
      const last = events[events.length - 1];
      return {
        name: label.name,
        ...(last?.actor ? { by: toUser(last.actor.login, String(last.actor.id), last.actor.type === 'Bot') } : {}),
        ...(last?.created_at ? { at: last.created_at } : {}),
      };
    });
  }

  async fetchPrState(pr: PrRef): Promise<{ headSha: string; isDraft: boolean }> {
    const data = await this.#rest<{ head: { sha: string }; draft: boolean }>(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/pulls/${pr.number}`
    );
    return { headSha: data.head.sha, isDraft: data.draft };
  }

  /** `org/team-slug` (§A.7) — appartenance transitive pour les équipes imbriquées. */
  async isInGroup(user: UserInfo, group: string): Promise<boolean> {
    const [org, team] = group.split('/');
    if (!org || !team) return false;
    const res = await this.#raw(`/orgs/${org}/teams/${team}/memberships/${user.login}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new ReadFailedError(`isInGroup: HTTP ${res.status}`);
    const body = (await res.json()) as { state?: string };
    return body.state === 'active';
  }

  /** Le check run le plus récent que NOUS avons publié sur cette PR — c'est lui qui porte
   * l'état du besoin 4 (§6.4.1, §A.8.1). On remonte les commits de la PR du plus récent
   * au plus ancien et on s'arrête au premier trouvé : en régime nominal il est sur le SHA
   * de tête ou sur celui d'avant, puisque chaque évaluation republie.
   *
   * La borne existe parce que la recherche coûte un appel par commit : au-delà, l'état est
   * considéré perdu, ce qui remet la monotonie du §6.1 à zéro sur cette PR. C'est la seule
   * dégradation de ce support, et elle demande qu'aucune évaluation n'ait abouti pendant
   * `maxCommits` pushs d'affilée. */
  async findPublishedCheckRun(pr: PrRef, maxCommits = 30): Promise<PublishedCheckRun | null> {
    const [owner, name] = pr.scope;
    const commits = await this.#restPaged<{ sha: string }>(
      `/repos/${owner}/${name}/pulls/${pr.number}/commits`
    );
    // L'API rend les commits du plus ANCIEN au plus récent : on parcourt à l'envers.
    const shas = commits.map((c) => c.sha).reverse().slice(0, maxCommits);
    for (const sha of shas) {
      const res = await this.#rest<{ check_runs: RestCheckRun[] }>(
        `/repos/${owner}/${name}/commits/${sha}/check-runs?check_name=${encodeURIComponent(this.#opts.checkName)}&per_page=100`
      );
      // Plusieurs runs de même nom peuvent coexister sur un SHA (rejeu) : le plus récent
      // gagne, et c'est `started_at` qui l'ordonne, jamais l'ordre de la réponse.
      const runs = [...res.check_runs].sort((a, b) =>
        String(b.started_at ?? '').localeCompare(String(a.started_at ?? ''))
      );
      const hit = runs[0];
      if (hit) {
        return {
          headSha: sha,
          title: hit.output?.title ?? '',
          text: hit.output?.text ?? '',
        };
      }
    }
    return null;
  }

  /** Publication du §A.8.3 : la ligne `cc/1` dans `output.title` — le seul champ que
   * GitHub rende sur la page de la PR —, la sortie humaine dans `output.summary`, et
   * l'état du besoin 4 dans `output.text`. */
  async publishCheckRun(
    pr: PrRef,
    input: {
      headSha: string;
      conclusion: 'success' | 'failure' | 'neutral';
      title: string;
      summary: string;
      text: string;
      detailsUrl?: string;
    }
  ): Promise<void> {
    await this.#rest(`/repos/${pr.scope[0]}/${pr.scope[1]}/check-runs`, {
      method: 'POST',
      body: {
        name: this.#opts.checkName,
        head_sha: input.headSha,
        status: 'completed',
        conclusion: input.conclusion,
        ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
        output: { title: input.title, summary: input.summary, text: input.text },
      },
    });
  }

  async addLabel(pr: PrRef, name: string): Promise<void> {
    await this.#rest(`/repos/${pr.scope[0]}/${pr.scope[1]}/issues/${pr.number}/labels`, {
      method: 'POST',
      body: { labels: [name] },
    });
  }

  async removeLabel(pr: PrRef, name: string): Promise<void> {
    const res = await this.#raw(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/issues/${pr.number}/labels/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
    // Idempotente : en retirer une absente est sans effet, jamais une erreur (§9.2.4).
    if (!res.ok && res.status !== 404) throw new Error(`removeLabel failed: HTTP ${res.status}`);
  }

  async #graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.#raw('/graphql', { method: 'POST', body: { query, variables } });
    if (!res.ok) throw new ReadFailedError(`GraphQL HTTP ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: unknown[] };
    if (!body.data || (body.errors && body.errors.length > 0)) {
      throw new ReadFailedError(`GraphQL errors: ${JSON.stringify(body.errors)}`);
    }
    return body.data;
  }

  async #rest<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.#raw(path, opts);
    if (!res.ok) throw new ReadFailedError(`GitHub API ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

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
    const token = await this.#opts.token();
    return this.#opts.fetchImpl(`${this.#opts.apiBase}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: opts.accept ?? 'application/vnd.github+json',
        'user-agent': 'conventional-comments-toolkit',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  }
}

function toComment(raw: GraphQlComment): CommentInfo {
  return {
    id: raw.id,
    author: toUser(raw.author?.login ?? 'ghost', undefined, raw.author?.__typename === 'Bot'),
    body: raw.body,
    createdAt: raw.createdAt,
    ...(raw.lastEditedAt ? { updatedAt: raw.lastEditedAt } : {}),
    ...(raw.editor
      ? { lastEditedBy: toUser(raw.editor.login, undefined, raw.editor.__typename === 'Bot') }
      : {}),
    permalink: raw.url,
    isSystemGenerated: false,
    canCarryBlockingState: true,
  };
}

function toUser(login: string, id?: string, isBot = false): UserInfo {
  return { id: id ?? `login:${login.toLowerCase()}`, login, isServiceAccount: isBot };
}

const COMMENT_FIELDS = `
  id
  body
  createdAt
  lastEditedAt
  url
  author { login __typename }
  editor { login __typename }`;

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
              nodes {${COMMENT_FIELDS} }
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
          nodes {${COMMENT_FIELDS} }
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
  editor: { login: string; __typename?: string } | null;
}

interface GraphQlThreadComments {
  node: { comments: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GraphQlComment[] } };
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

interface RestCheckRun {
  started_at?: string;
  output?: { title?: string | null; summary?: string | null; text?: string | null };
}

interface TimelineEvent {
  event: string;
  label?: { name: string };
  actor?: { id: number; login: string; type?: string };
  created_at?: string;
}
