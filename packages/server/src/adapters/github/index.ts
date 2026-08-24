// Adaptateur serveur GitHub (annexe A). Traduit et transporte ; ne juge jamais (§9.2.4).
// L'état des fils passe par GraphQL — l'API REST n'expose pas `isResolved` de façon
// fiable (§A.6) — le reste par REST/webhooks.

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  encodeSummary,
  type CommentInfo,
  type ComplianceResult,
  type ConfigRead,
  type PlatformProfile,
  type PrRef,
  type ReviewEvent,
  type ThreadInfo,
  type UserInfo,
  type Zone,
} from '@cct/core';
import type { ServerPlatformAdapter, PlatformOperationalFacts } from '../../compliance/adapter.js';
import { renderHumanOutput } from '../../compliance/render.js';

/** Faits d'exploitation GitHub : `pull_request_review_thread` notifie les résolutions
 * (§A.8) et la provenance des étiquettes est exposée par la timeline (§A.7). */
export const githubFacts: PlatformOperationalFacts = {
  threadStatusEmitsPrUpdated: true,
  labelProvenanceExposed: true,
  requiresStatusTargetUrl: false, // le check run porte un corps Markdown (§A.8)
};

export interface GithubAdapterOptions {
  /** Hôte d'API — https://api.github.com, ou https://{ghes}/api/v3 pour GHE Server. */
  apiBase?: string;
  /** Hôte WEB des PrRef (identité des clés de stockage, §6.4). Dérivé d'`apiBase` par
   * défaut — le poser explicitement n'a de sens que si l'hôte web diffère de l'hôte
   * d'API d'une manière que la dérivation (`api.` retiré, `/api/v3` ignoré) ne couvre
   * pas. Toute autre source d'hôte DOIT dériver de la même valeur : deux dérivations
   * divergentes scinderaient l'état persistant d'une même PR en deux identités. */
  webHost?: string;
  /** Jeton d'installation (GitHub App, §A.8), fourni par appel pour suivre sa rotation. */
  token: () => Promise<string>;
  webhookSecret: string;
  checkName?: string;
  fetchImpl?: typeof fetch;
}

/** L'hôte web dérivé d'un hôte d'API : `api.github.com` → `github.com`,
 * `ghe.corp/api/v3` → `ghe.corp`. Fonction UNIQUE, partagée entre l'adaptateur et
 * l'assemblage (bootstrap) — c'est elle qui garantit qu'un webhook et une
 * réconciliation produisent la même clé de PR (§6.4). */
export function webHostFromApiBase(apiBase: string): string {
  return new URL(apiBase).hostname.replace(/^api\./, '');
}

const CHECK_NAME = 'conventional-comments';
const WEBHOOK_EVENTS = new Set([
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'issue_comment',
  'pull_request_review_thread',
]);

export class GithubServerAdapter implements ServerPlatformAdapter {
  #opts: Required<Omit<GithubAdapterOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: GithubAdapterOptions) {
    const apiBase = opts.apiBase ?? 'https://api.github.com';
    this.#opts = {
      apiBase,
      webHost: opts.webHost ?? webHostFromApiBase(apiBase),
      token: opts.token,
      webhookSecret: opts.webhookSecret,
      checkName: opts.checkName ?? CHECK_NAME,
      fetchImpl: opts.fetchImpl ?? fetch,
    };
  }

  /** Hôte web effectif des PrRef — exposé pour que l'assemblage identifie les dépôts
   * réconciliés avec la MÊME valeur que parseEvent (§6.4). */
  get webHost(): string {
    return this.#opts.webHost;
  }

  platformProfile(): PlatformProfile {
    // Même profil que côté client, même source (§9.2.4) : bloc de suggestion identifié
    // par l'info string `suggestion` (§A.7). Les commandes adressées à un outil ne sont
    // pas ici — elles relèvent de `EffectiveConfig.toolCommands` (§4.2, §8.2).
    return { id: 'github', suggestionInfoString: 'suggestion' };
  }

  matchesWebhook(payload: unknown): boolean {
    if (payload === null || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    // Les charges GitHub portent l'événement dans l'en-tête ; le corps permet un filtrage
    // structurel minimal (dépôt + action présents).
    return 'repository' in p && ('pull_request' in p || 'issue' in p || 'thread' in p || 'review' in p || 'comment' in p);
  }

  verifySignature(_payload: unknown, headers: Record<string, string>): boolean {
    const signature = headers['x-hub-signature-256'];
    const raw = headers['x-raw-body'];
    if (!signature || raw === undefined) return false;
    const expected = `sha256=${createHmac('sha256', this.#opts.webhookSecret).update(raw).digest('hex')}`;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseEvent(payload: unknown): Omit<ReviewEvent, 'sequence'> {
    const p = payload as Record<string, never> & {
      action?: string;
      repository: { name: string; owner: { login: string } };
      pull_request?: { number: number; created_at: string; draft?: boolean };
      issue?: { number: number; created_at: string; pull_request?: unknown };
      sender?: { id: number; login: string; type?: string };
      comment?: unknown;
      thread?: unknown;
      label?: unknown;
    };
    // Un `issue_comment` sur une issue simple ne référence aucune PR : le champ
    // `issue.pull_request` n'existe que sur les issues qui SONT des PR.
    const issueIsPr = p.issue !== undefined && p.issue.pull_request !== undefined;
    const prData = p.pull_request ?? (issueIsPr ? p.issue : undefined);
    if (!prData) throw new Error('payload does not reference a pull request');
    const host = this.#opts.webHost;
    const pr: PrRef = {
      platform: 'github',
      createdAt: prData.created_at,
      host,
      scope: [p.repository.owner.login, p.repository.name],
      number: prData.number,
    };
    const kind = mapEventKind(p);
    const sender = p.sender ?? { id: 0, login: 'unknown' };
    return {
      kind,
      pr,
      actor: {
        id: String(sender.id),
        login: sender.login,
        isServiceAccount: (p.sender?.type ?? '') === 'Bot',
      },
      occurredAt: new Date().toISOString(),
    };
  }

  async listOpenPrs(repo: { host: string; scope: string[] }): Promise<PrRef[]> {
    const [owner, name] = repo.scope;
    const prs = await this.#restPaged<{ number: number; created_at: string }>(
      `/repos/${owner}/${name}/pulls?state=open`
    );
    return prs.map((p) => ({
      platform: 'github',
      createdAt: p.created_at,
      host: repo.host,
      scope: [...repo.scope],
      number: p.number,
    }));
  }

  async fetchThreads(pr: PrRef): Promise<ThreadInfo[]> {
    const [owner, name] = pr.scope;
    const query = `
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
                  nodes {
                    id
                    body
                    createdAt
                    lastEditedAt
                    url
                    author { login __typename }
                    editor { login __typename }
                  }
                }
              }
            }
          }
        }
      }`;
    const threads: ThreadInfo[] = [];
    let cursor: string | null = null;
    for (;;) {
      const data: GraphQlThreads = await this.#graphql(query, {
        owner,
        name,
        number: Number(pr.number),
        cursor,
      });
      const connection = data.repository.pullRequest.reviewThreads;
      for (const node of connection.nodes) {
        const comments = [...node.comments.nodes];
        // Réponses au-delà de 100 : pagination par fil (§6.4, budget d'appels).
        let commentCursor = node.comments.pageInfo?.hasNextPage ? node.comments.pageInfo.endCursor : null;
        while (commentCursor) {
          const more: GraphQlThreadComments = await this.#graphql(
            `query($id: ID!, $cursor: String) {
              node(id: $id) {
                ... on PullRequestReviewThread {
                  comments(first: 100, after: $cursor) {
                    pageInfo { hasNextPage endCursor }
                    nodes {
                      id
                      body
                      createdAt
                      lastEditedAt
                      url
                      author { login __typename }
                      editor { login __typename }
                    }
                  }
                }
              }
            }`,
            { id: node.id, cursor: commentCursor }
          );
          comments.push(...more.node.comments.nodes);
          commentCursor = more.node.comments.pageInfo.hasNextPage ? more.node.comments.pageInfo.endCursor : null;
        }
        if (comments.length === 0) continue;
        const [rootRaw, ...replyRaws] = comments;
        const root = this.#toComment(rootRaw!);
        threads.push({
          id: node.id,
          pr,
          root,
          replies: replyRaws.map((r) => this.#toComment(r)),
          // Conversation marquée Resolved (§A.6) ; l'état est toujours exposé en GraphQL.
          resolution: node.isResolved ? 'resolved' : 'unresolved',
          ...(node.resolvedBy
            ? { resolvedBy: this.#toUser(node.resolvedBy.login, undefined) }
            : {}),
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
    // Zone `conversation` : commentaires généraux de la PR (issue comments) — aucun état
    // de résolution sur GitHub (§4.1).
    const issueComments = await this.#restPaged<RestIssueComment>(
      `/repos/${owner}/${name}/issues/${pr.number}/comments`
    );
    for (const c of issueComments) {
      out.push({
        comment: {
          id: `ic-${c.id}`,
          author: this.#toUser(c.user.login, String(c.user.id), c.user.type === 'Bot'),
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
    const reviews = await this.#restPaged<RestReview>(
      `/repos/${owner}/${name}/pulls/${pr.number}/reviews`
    );
    for (const r of reviews) {
      out.push({
        comment: {
          id: `rv-${r.id}`,
          author: this.#toUser(r.user.login, String(r.user.id), r.user.type === 'Bot'),
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

  async fetchConfigFile(pr: PrRef, _opts?: { bypassCache: boolean }): Promise<ConfigRead> {
    const [owner, name] = pr.scope;
    try {
      const res = await this.#raw(
        `/repos/${owner}/${name}/contents/.conventional-comments.json`,
        { accept: 'application/vnd.github.raw+json' }
      );
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  async fetchOrgConfig(url: string | null, _opts?: { bypassCache: boolean }): Promise<ConfigRead> {
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

  /** Provenance exposée (§A.7) : la timeline rend les événements `labeled` avec leur
   * acteur et leur horodatage. */
  async fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]> {
    const [owner, name] = pr.scope;
    const current = await this.#restPaged<{ name: string }>(
      `/repos/${owner}/${name}/issues/${pr.number}/labels`
    );
    // Toute la timeline : la provenance d'une étiquette peut être loin dans l'historique
    // d'une PR active (§A.7) — s'arrêter à la première page la perdrait.
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
   * emplacement rendu sur la page de la PR —, la sortie humaine dans le corps (§A.8). */
  async publishStatus(pr: PrRef, result: ComplianceResult): Promise<void> {
    const conclusionMap = { success: 'success', failure: 'failure', neutral: 'neutral' } as const;
    await this.#rest(`/repos/${pr.scope[0]}/${pr.scope[1]}/check-runs`, {
      method: 'POST',
      body: {
        name: this.#opts.checkName,
        head_sha: result.headSha,
        status: 'completed',
        conclusion: conclusionMap[result.state],
        ...(result.targetUrl ? { details_url: result.targetUrl } : {}),
        output: {
          title: encodeSummary(result),
          summary: renderHumanOutput(result),
        },
      },
    });
  }

  async addLabel(pr: PrRef, name: string): Promise<void> {
    // Idempotente : poser une étiquette déjà présente est sans effet (§9.2.4).
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

  /** `org/team-slug` (§A.7) — l'appartenance est transitive pour les équipes imbriquées,
   * ce que l'API des memberships d'équipe rend nativement. */
  async isInGroup(user: UserInfo, group: string): Promise<boolean> {
    const [org, team] = group.split('/');
    if (!org || !team) return false;
    const res = await this.#raw(`/orgs/${org}/teams/${team}/memberships/${user.login}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`isInGroup failed: HTTP ${res.status}`);
    const body = (await res.json()) as { state?: string };
    return body.state === 'active';
  }

  #toComment(raw: GraphQlComment): CommentInfo {
    const authorLogin = raw.author?.login ?? 'ghost';
    return {
      id: raw.id,
      author: this.#toUser(authorLogin, undefined, raw.author?.__typename === 'Bot'),
      body: raw.body,
      createdAt: raw.createdAt,
      ...(raw.lastEditedAt ? { updatedAt: raw.lastEditedAt } : {}),
      ...(raw.editor
        ? { lastEditedBy: this.#toUser(raw.editor.login, undefined, raw.editor.__typename === 'Bot') }
        : {}),
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

  /** Pagination REST (§6.4, budget d'appels) : suit `page` tant que la page est pleine. */
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

export { renderHumanOutput } from '../../compliance/render.js';

function mapEventKind(p: {
  action?: string;
  comment?: unknown;
  thread?: unknown;
  label?: unknown;
  pull_request?: { draft?: boolean };
}): ReviewEvent['kind'] {
  if (p.thread) return p.action === 'resolved' ? 'thread.resolved' : 'thread.unresolved';
  if (p.comment) {
    if (p.action === 'edited') return 'comment.edited';
    if (p.action === 'deleted') return 'comment.deleted';
    return 'comment.created';
  }
  if (p.label) return p.action === 'labeled' ? 'label.added' : 'label.removed';
  if (p.action === 'ready_for_review') return 'pr.readyForReview';
  return 'pr.updated';
}

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
