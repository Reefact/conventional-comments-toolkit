// Un faux GitHub qui sert des ROUTES, jamais des méthodes de client.
//
// La distinction n'est pas de goût. Un faux qui exposerait `fetchThreads()` testerait que
// l'appelant appelle la bonne méthode, ce que le compilateur dit déjà ; il ne testerait ni
// l'URL construite, ni la pagination, ni la requête GraphQL, ni la lecture de la réponse.
// En servant `fetch`, le code fait ses vraies requêtes et le faux constate ce qu'elles sont.
//
// Un faux est une affirmation sur l'environnement, et se révise comme du code. Ce que
// celui-ci affirme, et qui vient de l'annexe A : l'état d'un fil n'est lisible qu'en
// GraphQL, la pagination REST se fait par `page` avec `per_page=100`, une étiquette absente
// donne 404 sur DELETE, et un fichier absent donne 404 sur la route `contents`.

export interface FakeThread {
  id: string;
  isResolved: boolean;
  resolvedBy?: string;
  comments: { id: string; body: string; author: string; createdAt?: string }[];
}

export interface FakeRepoState {
  threads: FakeThread[];
  issueComments: { id: number; body: string; author: string }[];
  reviews: { id: number; body: string; author: string }[];
  labels: { name: string; by?: string; at?: string }[];
  openPrs: { number: number; created_at: string }[];
  prs: Record<number, { created_at: string; draft: boolean; head: string }>;
  /** Contenu de `.conventional-comments.json`, ou `null` pour un fichier absent. */
  configFile: string | null;
  /** Documents servis par URL absolue — configuration d'organisation, plancher. */
  urls: Record<string, string>;
}

export interface FakeGithub {
  fetch: typeof fetch;
  /** Toutes les requêtes reçues, dans l'ordre — ce qui permet de prouver une pagination ou
   * l'ABSENCE d'un appel, comme pour `isInGroup` qui ne doit en faire aucun. */
  requests: { method: string; url: string; body?: unknown }[];
  /** Les check runs publiés, dans l'ordre. */
  published: { name: string; head_sha: string; conclusion: string; title: string; summary: string }[];
  /** Les étiquettes retirées, dans l'ordre. */
  removedLabels: string[];
}

export function fakeRepoState(over: Partial<FakeRepoState> = {}): FakeRepoState {
  return {
    threads: [],
    issueComments: [],
    reviews: [],
    labels: [],
    openPrs: [],
    prs: { 42: { created_at: '2026-10-01T00:00:00Z', draft: false, head: 'sha-head' } },
    configFile: null,
    urls: {},
    ...over,
  };
}

export function fakeGithub(state: FakeRepoState, opts: { apiBase?: string } = {}): FakeGithub {
  const apiBase = opts.apiBase ?? 'https://api.github.com';
  const out: FakeGithub = { fetch: undefined as never, requests: [], published: [], removedLabels: [] };

  out.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    out.requests.push({ method, url, ...(body !== undefined ? { body } : {}) });

    // Documents servis par URL absolue : plancher et configuration d'organisation.
    if (!url.startsWith(apiBase)) {
      const served = state.urls[url];
      return served === undefined ? json(404, { message: 'Not Found' }) : text(200, served);
    }

    const path = url.slice(apiBase.length);

    if (path === '/graphql' && method === 'POST') return json(200, graphql(state, body));

    // Publication du check run (§A.8).
    if (/^\/repos\/[^/]+\/[^/]+\/check-runs$/.test(path) && method === 'POST') {
      out.published.push({
        name: body.name,
        head_sha: body.head_sha,
        conclusion: body.conclusion,
        title: body.output.title,
        summary: body.output.summary,
      });
      return json(201, { id: 1 });
    }

    // Retrait d'étiquette — 404 quand elle est absente, ce que l'appelant doit absorber.
    const removal = /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/labels\/(.+)$/.exec(path);
    if (removal && method === 'DELETE') {
      const name = decodeURIComponent(removal[1]!);
      if (!state.labels.some((label) => label.name === name)) return json(404, { message: 'Label does not exist' });
      state.labels = state.labels.filter((label) => label.name !== name);
      out.removedLabels.push(name);
      return json(200, []);
    }

    if (/\/contents\/\.conventional-comments\.json/.test(path)) {
      return state.configFile === null ? json(404, { message: 'Not Found' }) : text(200, state.configFile);
    }

    const page = Number(new URL(url).searchParams.get('page') ?? '1');
    if (/\/issues\/\d+\/comments/.test(path)) {
      return json(200, paged(page, state.issueComments.map(toIssueComment)));
    }
    if (/\/pulls\/\d+\/reviews/.test(path)) {
      return json(200, paged(page, state.reviews.map(toReview)));
    }
    if (/\/issues\/\d+\/labels/.test(path)) {
      return json(200, paged(page, state.labels.map((label) => ({ name: label.name }))));
    }
    if (/\/issues\/\d+\/timeline/.test(path)) {
      return json(200, paged(page, state.labels.filter((label) => label.by).map(toTimelineEvent)));
    }
    if (/\/pulls\?/.test(path)) {
      const head = new URL(url).searchParams.get('head');
      const prs = head === null ? state.openPrs : state.openPrs.filter(() => true);
      return json(200, paged(page, prs));
    }
    const single = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(path);
    if (single) {
      const pr = state.prs[Number(single[1])];
      if (!pr) return json(404, { message: 'Not Found' });
      return json(200, { created_at: pr.created_at, draft: pr.draft, head: { sha: pr.head } });
    }

    return json(404, { message: `unrouted: ${method} ${path}` });
  }) as typeof fetch;

  return out;
}

/** Les deux requêtes GraphQL de l'adaptateur : les fils d'une PR, et la suite des réponses
 * d'un fil au-delà de 100. Une seule page ici — la pagination REST est celle qui se teste. */
function graphql(state: FakeRepoState, body: { query: string; variables: Record<string, unknown> }) {
  if (body.query.includes('reviewThreads')) {
    return {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: state.threads.map((thread) => ({
                id: thread.id,
                isResolved: thread.isResolved,
                resolvedBy: thread.resolvedBy ? { login: thread.resolvedBy } : null,
                comments: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: thread.comments.map(toGraphQlComment),
                },
              })),
            },
          },
        },
      },
    };
  }
  return { data: { node: { comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } };
}

function toGraphQlComment(comment: { id: string; body: string; author: string; createdAt?: string }) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt ?? '2026-10-02T00:00:00Z',
    lastEditedAt: null,
    url: `https://github.com/acme/demo/pull/42#discussion_r${comment.id}`,
    author: { login: comment.author, __typename: 'User' },
  };
}

function toIssueComment(comment: { id: number; body: string; author: string }) {
  return {
    id: comment.id,
    body: comment.body,
    created_at: '2026-10-02T00:00:00Z',
    html_url: `https://github.com/acme/demo/pull/42#issuecomment-${comment.id}`,
    user: { id: comment.id, login: comment.author, type: 'User' },
  };
}

function toReview(review: { id: number; body: string; author: string }) {
  return {
    id: review.id,
    body: review.body,
    submitted_at: '2026-10-02T00:00:00Z',
    html_url: `https://github.com/acme/demo/pull/42#pullrequestreview-${review.id}`,
    user: { id: review.id, login: review.author, type: 'User' },
  };
}

function toTimelineEvent(label: { name: string; by?: string; at?: string }) {
  return {
    event: 'labeled',
    label: { name: label.name },
    actor: { id: 900, login: label.by, type: 'User' },
    created_at: label.at ?? '2026-10-03T00:00:00Z',
  };
}

/** La pagination de l'adaptateur s'arrête sur une page incomplète : tout tient en page 1. */
function paged<T>(page: number, all: T[]): T[] {
  return page === 1 ? all : [];
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function text(status: number, payload: string): Response {
  return new Response(payload, { status, headers: { 'content-type': 'text/plain' } });
}
