// Un GitHub en mémoire, servi à travers `fetch`.
//
// Il sert des ROUTES, pas des méthodes de client : c'est ce qui distingue ce faux d'un
// monde inventé (CLAUDE.md, règle 2). Le code testé fait ses vraies requêtes, avec ses
// vraies URL et sa vraie pagination ; ce qui répond est un état déclaré, pas un
// enregistrement de ce que le code croit demander. Un check run publié ici est REELLEMENT
// relu par `findPublishedCheckRun` au tour suivant, ce qui rend testable la seule chose
// qui compte dans ce support : que l'état survive d'une exécution à l'autre.

export interface FakeComment {
  id: string;
  author: string;
  body: string;
  createdAt?: string;
  lastEditedAt?: string;
  editor?: string;
}

export interface FakeThread {
  id: string;
  isResolved: boolean;
  resolvedBy?: string;
  comments: FakeComment[];
}

export interface FakeCheckRun {
  headSha: string;
  startedAt: string;
  title: string;
  summary: string;
  text: string;
}

export interface FakeRepoState {
  threads: FakeThread[];
  issueComments: FakeComment[];
  reviews: FakeComment[];
  labels: { name: string; by?: string; at?: string }[];
  /** `null` = 404 (fichier absent), sinon le texte servi. */
  configFile: string | null;
  /** Réponses des URL externes (configuration d'organisation, plancher). */
  urls: Record<string, string>;
  headSha: string;
  isDraft: boolean;
  prCreatedAt: string;
  /** Du plus ancien au plus récent, comme l'API des commits d'une PR. */
  commits: string[];
  checkRuns: FakeCheckRun[];
  teams: Record<string, string[]>;
  labelWrites: { op: 'add' | 'remove'; name: string }[];
  /** Routes à faire échouer, pour éprouver le comportement de lecture impossible. */
  fail: Set<string>;
}

export function emptyRepo(overrides: Partial<FakeRepoState> = {}): FakeRepoState {
  return {
    threads: [],
    issueComments: [],
    reviews: [],
    labels: [],
    configFile: JSON.stringify({
      mode: 'enforce',
      activation: { activatedAt: '2026-09-01T00:00:00Z' },
    }),
    urls: {},
    headSha: 'sha-head',
    isDraft: false,
    prCreatedAt: '2026-10-01T00:00:00Z',
    commits: ['sha-head'],
    checkRuns: [],
    teams: {},
    labelWrites: [],
    fail: new Set(),
    ...overrides,
  };
}

const OWNER = 'acme';
const REPO = 'demo';
const NUMBER = 42;

export function fakeGithub(state: FakeRepoState): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    const u = new URL(url);
    const path = u.pathname;
    const page = Number(u.searchParams.get('page') ?? '1');

    for (const marker of state.fail) {
      if (url.includes(marker)) return new Response('boom', { status: 500 });
    }

    // ————— URL externes : configuration d'organisation et plancher —————
    if (!path.startsWith('/repos') && !path.startsWith('/orgs') && path !== '/graphql') {
      const body = state.urls[url];
      return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
    }

    // ————— GraphQL : les fils et leur état de résolution —————
    if (path === '/graphql') {
      const query = JSON.parse(String(init?.body)) as { query: string };
      if (query.query.includes('reviewThreads')) {
        return json({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: state.threads.map((t) => ({
                    id: t.id,
                    isResolved: t.isResolved,
                    resolvedBy: t.resolvedBy ? { login: t.resolvedBy } : null,
                    comments: {
                      pageInfo: { hasNextPage: false, endCursor: null },
                      nodes: t.comments.map(toGraphQlComment),
                    },
                  })),
                },
              },
            },
          },
        });
      }
      return json({ data: { node: { comments: { pageInfo: { hasNextPage: false }, nodes: [] } } } });
    }

    // ————— Appartenance à une équipe —————
    const team = /^\/orgs\/([^/]+)\/teams\/([^/]+)\/memberships\/([^/]+)$/.exec(path);
    if (team) {
      const members = state.teams[`${team[1]}/${team[2]}`] ?? [];
      return members.includes(team[3]!)
        ? json({ state: 'active' })
        : new Response('', { status: 404 });
    }

    const base = `/repos/${OWNER}/${REPO}`;

    if (path === `${base}/contents/.conventional-comments.json`) {
      return state.configFile === null
        ? new Response('', { status: 404 })
        : new Response(state.configFile, { status: 200 });
    }

    if (path === `${base}/issues/${NUMBER}/comments`) {
      return json(page > 1 ? [] : state.issueComments.map(toRestIssueComment));
    }

    if (path === `${base}/pulls/${NUMBER}/reviews`) {
      return json(page > 1 ? [] : state.reviews.map(toRestReview));
    }

    if (path === `${base}/issues/${NUMBER}/labels` && method === 'GET') {
      return json(page > 1 ? [] : state.labels.map((l) => ({ name: l.name })));
    }

    if (path === `${base}/issues/${NUMBER}/labels` && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { labels: string[] };
      for (const name of body.labels) {
        state.labelWrites.push({ op: 'add', name });
        if (!state.labels.some((l) => l.name === name)) state.labels.push({ name });
      }
      return json({});
    }

    const removeLabel = new RegExp(`^${base}/issues/${NUMBER}/labels/(.+)$`).exec(path);
    if (removeLabel && method === 'DELETE') {
      const name = decodeURIComponent(removeLabel[1]!);
      state.labelWrites.push({ op: 'remove', name });
      const before = state.labels.length;
      state.labels = state.labels.filter((l) => l.name !== name);
      return before === state.labels.length ? new Response('', { status: 404 }) : json({});
    }

    if (path === `${base}/issues/${NUMBER}/timeline`) {
      return json(
        page > 1
          ? []
          : state.labels
              .filter((l) => l.by !== undefined)
              .map((l) => ({
                event: 'labeled',
                label: { name: l.name },
                actor: { id: 1, login: l.by },
                created_at: l.at,
              }))
      );
    }

    if (path === `${base}/pulls/${NUMBER}`) {
      return json({
        head: { sha: state.headSha },
        draft: state.isDraft,
        created_at: state.prCreatedAt,
      });
    }

    if (path === `${base}/pulls/${NUMBER}/commits`) {
      return json(page > 1 ? [] : state.commits.map((sha) => ({ sha })));
    }

    if (path === `${base}/pulls` && method === 'GET') {
      return json(page > 1 ? [] : [{ number: NUMBER, created_at: state.prCreatedAt }]);
    }

    const checkRunsFor = new RegExp(`^${base}/commits/([^/]+)/check-runs$`).exec(path);
    if (checkRunsFor) {
      const sha = checkRunsFor[1]!;
      const name = u.searchParams.get('check_name');
      const runs = state.checkRuns
        .filter((c) => c.headSha === sha)
        .filter(() => name === null || name === 'conventional-comments');
      return json({
        total_count: runs.length,
        check_runs: runs.map((c) => ({
          name: 'conventional-comments',
          started_at: c.startedAt,
          output: { title: c.title, summary: c.summary, text: c.text },
        })),
      });
    }

    if (path === `${base}/check-runs` && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as {
        head_sha: string;
        conclusion: string;
        output: { title: string; summary: string; text: string };
      };
      state.checkRuns.push({
        headSha: body.head_sha,
        startedAt: new Date(2026, 0, 1, 0, 0, state.checkRuns.length).toISOString(),
        title: body.output.title,
        summary: body.output.summary,
        text: body.output.text,
      });
      return json({ id: state.checkRuns.length }, 201);
    }

    return new Response(`unrouted: ${method} ${path}`, { status: 404 });
  }) as typeof fetch;

  return { impl, calls };
}

function toGraphQlComment(c: FakeComment) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt ?? '2026-10-02T00:00:00Z',
    lastEditedAt: c.lastEditedAt ?? null,
    url: `https://github.com/acme/demo/pull/42#discussion_r${c.id}`,
    author: { login: c.author, __typename: 'User' },
    editor: c.editor ? { login: c.editor, __typename: 'User' } : null,
  };
}

function toRestIssueComment(c: FakeComment) {
  return {
    id: Number(c.id.replace(/\D/g, '')) || 1,
    body: c.body,
    created_at: c.createdAt ?? '2026-10-02T00:00:00Z',
    html_url: `https://github.com/acme/demo/pull/42#issuecomment-${c.id}`,
    user: { id: 1, login: c.author },
  };
}

function toRestReview(c: FakeComment) {
  return {
    id: Number(c.id.replace(/\D/g, '')) || 1,
    body: c.body,
    submitted_at: c.createdAt ?? '2026-10-02T00:00:00Z',
    html_url: `https://github.com/acme/demo/pull/42#pullrequestreview-${c.id}`,
    user: { id: 1, login: c.author },
  };
}

export const FAKE_PR = {
  platform: 'github' as const,
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: [OWNER, REPO],
  number: NUMBER,
};
