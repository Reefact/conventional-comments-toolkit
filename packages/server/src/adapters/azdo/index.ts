// Adaptateur serveur Azure DevOps (annexe B). Points établis par la spécification :
// - statuts de fil sérialisés en camelCase à initiale minuscule (§B.5) ;
// - l'auteur d'une résolution n'est pas exposé → `resolvedBy` absent, la règle de
//   gouvernance du §6.1 n'est pas appliquée ici et `resolution-unattributed` est émis ;
// - provenance des étiquettes non exposée → chemin de repli du §6.3.2 ;
// - pas de corps de statut → la ligne cc/1 dans la description, `targetUrl` obligatoire ;
// - pas d'étage 0 tant que le spike n'a pas établi l'info string du bloc de suggestion.

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

/** Faits d'exploitation Azure DevOps, en l'état du spike P1' (§B.5, §B.6, §B.7). */
export const azdoFacts: PlatformOperationalFacts = {
  threadStatusEmitsPrUpdated: false, // à établir par le spike — d'ici là, §B.7 s'applique
  labelProvenanceExposed: false, // §B.6 — WebApiTagDefinition ne porte ni auteur ni date
  requiresStatusTargetUrl: true, // un PR Status ne porte ni corps ni Markdown (§B.7)
};

// §B.5 — la forme camelCase à initiale minuscule est celle des charges JSON.
const RESOLVED_STATUSES = new Set(['fixed', 'wontFix', 'closed', 'byDesign']);

export interface AzdoAdapterOptions {
  /** https://dev.azure.com/{organization}, ou l'URL d'une collection Server. */
  organizationUrl: string;
  project: string;
  /** PAT ou jeton d'accès, portée vso.code_write (§B.6). */
  token: () => Promise<string>;
  /** Secret partagé attendu dans l'en-tête Authorization des service hooks. */
  webhookSecret: string;
  statusContext?: { genre: string; name: string };
  fetchImpl?: typeof fetch;
}

export class AzdoServerAdapter implements ServerPlatformAdapter {
  #opts: Required<Omit<AzdoAdapterOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: AzdoAdapterOptions) {
    this.#opts = {
      organizationUrl: opts.organizationUrl.replace(/\/$/, ''),
      project: opts.project,
      token: opts.token,
      webhookSecret: opts.webhookSecret,
      // Le couple genre/name — et non un nom nu — lie le statut à la policy (§B.7).
      statusContext: opts.statusContext ?? { genre: 'conventional-comments', name: 'compliance' },
      fetchImpl: opts.fetchImpl ?? fetch,
    };
  }

  platformProfile(): PlatformProfile {
    // Pas de commande slash native (§B.6) ; pas d'étage 0 tant que l'info string du bloc
    // de suggestion n'est pas établi par le spike (§B.6) : `null` = cas général.
    return { id: 'azdo', suggestionInfoString: null, slashPrefixes: [] };
  }

  matchesWebhook(payload: unknown): boolean {
    if (payload === null || typeof payload !== 'object') return false;
    const p = payload as { eventType?: string };
    return (
      typeof p.eventType === 'string' &&
      (p.eventType.startsWith('git.pullrequest') || p.eventType === 'ms.vss-code.git-pullrequest-comment-event')
    );
  }

  verifySignature(_payload: unknown, headers: Record<string, string>): boolean {
    // Les service hooks portent une authentification basique configurée à la souscription.
    const auth = headers['authorization'] ?? '';
    return auth !== '' && auth === `Basic ${Buffer.from(`cc:${this.#opts.webhookSecret}`).toString('base64')}`;
  }

  parseEvent(payload: unknown): Omit<ReviewEvent, 'sequence'> {
    const p = payload as {
      eventType: string;
      resource: {
        pullRequest?: AzdoPullRequest;
        pullRequestId?: number;
        repository?: { name: string };
        creationDate?: string;
        comment?: unknown;
      };
      createdDate?: string;
    };
    const prData = p.resource.pullRequest ?? (p.resource as unknown as AzdoPullRequest);
    if (!prData || prData.pullRequestId === undefined) {
      throw new Error('payload does not reference a pull request');
    }
    const host = new URL(this.#opts.organizationUrl).hostname;
    const orgPath = new URL(this.#opts.organizationUrl).pathname.replace(/^\//, '');
    const pr: PrRef = {
      platform: 'azdo',
      createdAt: prData.creationDate,
      host,
      scope: [orgPath, this.#opts.project, prData.repository.name].filter((s) => s !== ''),
      number: prData.pullRequestId,
    };
    const kind: ReviewEvent['kind'] =
      p.eventType === 'ms.vss-code.git-pullrequest-comment-event'
        ? 'comment.created'
        : p.eventType === 'git.pullrequest.created'
          ? 'pr.updated'
          : 'pr.updated';
    const by = prData.createdBy ?? { id: 'unknown', displayName: 'unknown', uniqueName: 'unknown' };
    return {
      kind,
      pr,
      actor: this.#toUser(by),
      occurredAt: p.createdDate ?? new Date().toISOString(),
    };
  }

  async listOpenPrs(repo: { host: string; scope: string[] }): Promise<PrRef[]> {
    const repoName = repo.scope[repo.scope.length - 1]!;
    const prs = await this.#rest<{ value: AzdoPullRequest[] }>(
      `/git/repositories/${encodeURIComponent(repoName)}/pullrequests?searchCriteria.status=active&api-version=7.1`
    );
    return prs.value.map((p) => ({
      platform: 'azdo',
      createdAt: p.creationDate,
      host: repo.host,
      scope: [...repo.scope],
      number: p.pullRequestId,
    }));
  }

  async fetchThreads(pr: PrRef): Promise<ThreadInfo[]> {
    const repoName = this.#repoName(pr);
    const data = await this.#rest<{ value: AzdoThread[] }>(
      `/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${pr.number}/threads?api-version=7.1`
    );
    const threads: ThreadInfo[] = [];
    for (const t of data.value) {
      const humanComments = (t.comments ?? []).filter((c) => !c.isDeleted);
      if (humanComments.length === 0) continue;
      const [rootRaw, ...replyRaws] = humanComments;
      const root = this.#toComment(pr, t, rootRaw!);
      // `unknown` est la valeur par défaut quand aucun statut n'a été posé : classée non
      // résolue, pour qu'un fil bloquant sans statut ne compte pas comme traité (§B.5).
      const status = t.status ?? 'unknown';
      threads.push({
        id: String(t.id),
        pr,
        root,
        replies: replyRaws.map((c) => this.#toComment(pr, t, c)),
        resolution: RESOLVED_STATUSES.has(status) ? 'resolved' : 'unresolved',
        // Aucun champ documenté ne dit QUI a changé le statut (§B.5) : resolvedBy absent.
        // Sur Azure DevOps, tout fil — y compris hors diff — porte un statut résolvable :
        // l'adaptateur traduit cette capacité, il ne juge pas (§9.2.4).
        canCarryBlockingState: true,
      });
    }
    return threads;
  }

  async fetchStandaloneComments(_pr: PrRef): Promise<{ comment: CommentInfo; zone: Zone }[]> {
    // Tous les commentaires de PR Azure DevOps vivent dans des fils ; il n'existe ni
    // corps de revue globale (§B.6) ni commentaire hors fil.
    return [];
  }

  async fetchConfigFile(pr: PrRef, _opts?: { bypassCache: boolean }): Promise<ConfigRead> {
    const repoName = this.#repoName(pr);
    try {
      const res = await this.#raw(
        `/git/repositories/${encodeURIComponent(repoName)}/items?path=${encodeURIComponent('/.conventional-comments.json')}&api-version=7.1`,
        { accept: 'text/plain' }
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

  /** §B.6 — l'API rend des WebApiTagDefinition : ni auteur, ni date. Le contrat rend le
   * nom seul, et le repli du §6.3.2 s'applique. */
  async fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]> {
    const repoName = this.#repoName(pr);
    const data = await this.#rest<{ value: { name: string; active?: boolean }[] }>(
      `/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${pr.number}/labels?api-version=7.1`
    );
    return data.value.filter((l) => l.active !== false).map((l) => ({ name: l.name }));
  }

  async fetchHeadSha(pr: PrRef): Promise<string> {
    const data = await this.#pullRequest(pr);
    return data.lastMergeSourceCommit?.commitId ?? '';
  }

  async isDraft(pr: PrRef): Promise<boolean> {
    const data = await this.#pullRequest(pr);
    return data.isDraft === true;
  }

  /** PR Status (§B.7) : la ligne cc/1 dans la description, `context: {genre, name}`,
   * état `GitStatusState`, `targetUrl` vers la page du composant B. */
  async publishStatus(pr: PrRef, result: ComplianceResult): Promise<void> {
    const repoName = this.#repoName(pr);
    const stateMap = { success: 'succeeded', failure: 'failed', neutral: 'notApplicable' } as const;
    await this.#rest(
      `/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${pr.number}/statuses?api-version=7.1`,
      {
        method: 'POST',
        body: {
          state: stateMap[result.state], // calculé par core/ ; l'adaptateur traduit (§B.7)
          description: encodeSummary(result),
          context: this.#opts.statusContext,
          ...(result.targetUrl ? { targetUrl: result.targetUrl } : {}),
        },
      }
    );
  }

  async addLabel(pr: PrRef, name: string): Promise<void> {
    const repoName = this.#repoName(pr);
    // POST …/labels, corps { "name": … } — portée vso.code_write (§B.6). Idempotente.
    await this.#rest(
      `/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${pr.number}/labels?api-version=7.1`,
      { method: 'POST', body: { name } }
    );
  }

  async removeLabel(pr: PrRef, name: string): Promise<void> {
    const repoName = this.#repoName(pr);
    const res = await this.#raw(
      `/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${pr.number}/labels/${encodeURIComponent(name)}?api-version=7.1`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) throw new Error(`removeLabel failed: HTTP ${res.status}`);
  }

  /** `[Scope]\Nom du groupe` (§B.6) — appartenance transitive via l'API d'identités.
   * L'URL est construite sur l'organisation SANS segment `/..` : la normalisation d'URL
   * ferait sinon perdre l'organisation (`https://dev.azure.com/org/../_apis` →
   * `https://dev.azure.com/_apis`) et l'appartenance serait toujours fausse. Une panne
   * remonte en exception : c'est une incapacité à évaluer (§6.4), pas un refus. */
  async isInGroup(user: UserInfo, group: string): Promise<boolean> {
    const res = await this.#raw(
      `/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(group)}&queryMembership=Expanded&api-version=7.1`,
      {},
      true
    );
    if (!res.ok) throw new Error(`identities API: HTTP ${res.status}`);
    const data = (await res.json()) as {
      value?: { providerDisplayName?: string; memberIds?: string[] }[];
    };
    // Jamais de repli sur la première identité de la recherche : sans correspondance
    // exacte du groupe demandé, la réponse est « non » — se rabattre sur une autre
    // identité accorderait l'habilitation d'un AUTRE groupe.
    const identity = data.value?.find((i) => i.providerDisplayName === group);
    return identity?.memberIds?.includes(user.id) ?? false;
  }

  async #pullRequest(pr: PrRef): Promise<AzdoPullRequest> {
    const repoName = this.#repoName(pr);
    return this.#rest<AzdoPullRequest>(
      `/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${pr.number}?api-version=7.1`
    );
  }

  #repoName(pr: PrRef): string {
    return pr.scope[pr.scope.length - 1]!;
  }

  #toComment(pr: PrRef, thread: AzdoThread, raw: AzdoComment): CommentInfo {
    const permalink = `${this.#opts.organizationUrl}/${encodeURIComponent(this.#opts.project)}/_git/${encodeURIComponent(this.#repoName(pr))}/pullRequest/${pr.number}?discussionId=${thread.id}`;
    return {
      id: `${thread.id}-${raw.id}`,
      author: this.#toUser(raw.author),
      body: raw.content ?? '',
      createdAt: raw.publishedDate ?? '',
      ...(raw.lastUpdatedDate ? { updatedAt: raw.lastUpdatedDate } : {}),
      // L'API ne distingue pas l'auteur d'une édition : lastEditedBy absent (§6.1).
      permalink,
      // `commentType: "system"` marque les entrées générées par la plateforme (§4.2) —
      // traduit ici en booléen, core/ n'a pas à connaître le marqueur.
      isSystemGenerated: raw.commentType === 'system',
      canCarryBlockingState: true,
    };
  }

  #toUser(identity: AzdoIdentity): UserInfo {
    return {
      id: identity.id,
      // La comparaison d'exemption porte sur `login` (§4.2) : uniqueName est la valeur
      // comparable — `Project Collection Build Service ({Org})` pour les pipelines (§B.6).
      login: identity.uniqueName ?? identity.displayName,
      displayName: identity.displayName,
      isServiceAccount: /Build Service/i.test(identity.displayName ?? ''),
    };
  }

  async #rest<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.#raw(path, opts);
    if (!res.ok) throw new Error(`Azure DevOps API ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async #raw(
    path: string,
    opts: { method?: string; body?: unknown; accept?: string } = {},
    orgLevel = false
  ): Promise<Response> {
    const token = await this.#opts.token();
    const base = orgLevel
      ? `${this.#opts.organizationUrl}`
      : `${this.#opts.organizationUrl}/${encodeURIComponent(this.#opts.project)}/_apis`;
    return this.#opts.fetchImpl(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
        accept: opts.accept ?? 'application/json',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  }
}

interface AzdoIdentity {
  id: string;
  displayName: string;
  uniqueName?: string;
}

interface AzdoPullRequest {
  pullRequestId: number;
  creationDate: string;
  isDraft?: boolean;
  repository: { name: string };
  createdBy?: AzdoIdentity;
  lastMergeSourceCommit?: { commitId: string };
}

interface AzdoComment {
  id: number;
  content?: string;
  publishedDate?: string;
  lastUpdatedDate?: string;
  commentType?: string;
  author: AzdoIdentity;
  isDeleted?: boolean;
}

interface AzdoThread {
  id: number;
  status?: string;
  comments?: AzdoComment[];
  threadContext?: unknown;
  isDeleted?: boolean;
}
