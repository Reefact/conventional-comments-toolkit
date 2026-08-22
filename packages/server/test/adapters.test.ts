import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { decodeSummary, evaluate, type PrRef } from '@cct/core';
import { GithubServerAdapter, githubFacts } from '../src/adapters/github/index.js';
import { AzdoServerAdapter, azdoFacts } from '../src/adapters/azdo/index.js';
import { defaultConfig } from '@cct/core';

const GH_PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};
const AZ_PR: PrRef = {
  platform: 'azdo',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'dev.azure.com',
  scope: ['org', 'proj', 'repo'],
  number: 7,
};

function sampleResult() {
  const config = defaultConfig();
  config.mode = 'enforce';
  config.server.statusTargetUrl = 'https://cc.example/status';
  const result = evaluate({
    pr: GH_PR,
    platform: { id: 'github', suggestionInfoString: 'suggestion', slashPrefixes: [] },
    threads: [],
    loose: [],
    config,
    configNotices: [],
    ctx: {
      activatedAt: '2026-09-01T00:00:00Z',
      isDraft: false,
      isOverrideMember: () => false,
      knownBlockingThreadIds: [],
      firstVerdicts: {},
    },
  });
  result.headSha = 'abc123';
  return result;
}

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown; text?: string }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });
    const res = handler(url, init);
    return new Response(res.text ?? JSON.stringify(res.body ?? {}), {
      status: res.status,
      headers: { 'content-type': res.text !== undefined ? 'text/plain' : 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe('Annexe A — adaptateur serveur GitHub', () => {
  it('faits de plateforme : provenance exposée, résolutions notifiées, corps de statut rendu', () => {
    expect(githubFacts).toEqual({
      threadStatusEmitsPrUpdated: true,
      labelProvenanceExposed: true,
      requiresStatusTargetUrl: false,
    });
  });

  it('vérifie la signature HMAC X-Hub-Signature-256 et rejette les charges non signées (§6.4)', () => {
    const adapter = new GithubServerAdapter({ token: async () => 't', webhookSecret: 'secret' });
    const raw = JSON.stringify({ repository: {}, pull_request: {} });
    const signature = `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`;
    expect(adapter.verifySignature({}, { 'x-hub-signature-256': signature, 'x-raw-body': raw })).toBe(true);
    expect(adapter.verifySignature({}, { 'x-hub-signature-256': 'sha256=deadbeef', 'x-raw-body': raw })).toBe(false);
    expect(adapter.verifySignature({}, { 'x-raw-body': raw })).toBe(false);
  });

  it('publie un check run : ligne cc/1 dans output.title, sortie humaine dans le corps (§A.8)', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 201, body: {} }));
    const adapter = new GithubServerAdapter({ token: async () => 't', webhookSecret: 's', fetchImpl: impl });
    await adapter.publishStatus(GH_PR, sampleResult());
    const call = calls.find((c) => c.url.endsWith('/repos/acme/demo/check-runs'))!;
    const body = JSON.parse(String(call.init!.body)) as {
      name: string;
      head_sha: string;
      conclusion: string;
      output: { title: string; summary: string };
    };
    expect(body.name).toBe('conventional-comments');
    expect(body.head_sha).toBe('abc123');
    expect(body.conclusion).toBe('success');
    // La ligne machine est relisible caractère pour caractère (§6.3.1).
    const summary = decodeSummary(body.output.title);
    expect(summary).not.toBeNull();
    expect(summary!.mode).toBe('enforce');
    expect(body.output.summary.length).toBeGreaterThan(0);
  });

  it('neutral → conclusion neutral, qui satisfait une vérification obligatoire (§A.8)', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 201, body: {} }));
    const adapter = new GithubServerAdapter({ token: async () => 't', webhookSecret: 's', fetchImpl: impl });
    const result = sampleResult();
    result.state = 'neutral';
    await adapter.publishStatus(GH_PR, result);
    const body = JSON.parse(String(calls[0]!.init!.body)) as { conclusion: string };
    expect(body.conclusion).toBe('neutral');
  });

  it('fetchConfigFile : 404 → absent, erreur réseau → unreachable, 200 → found (§9.2.2)', async () => {
    const notFound = new GithubServerAdapter({
      token: async () => 't',
      webhookSecret: 's',
      fetchImpl: mockFetch(() => ({ status: 404 })).impl,
    });
    expect((await notFound.fetchConfigFile(GH_PR)).status).toBe('absent');
    const found = new GithubServerAdapter({
      token: async () => 't',
      webhookSecret: 's',
      fetchImpl: mockFetch(() => ({ status: 200, text: '{"mode":"warn"}' })).impl,
    });
    expect(await found.fetchConfigFile(GH_PR)).toEqual({ status: 'found', text: '{"mode":"warn"}' });
    const down = new GithubServerAdapter({
      token: async () => 't',
      webhookSecret: 's',
      fetchImpl: (async () => {
        throw new Error('network');
      }) as unknown as typeof fetch,
    });
    expect((await down.fetchConfigFile(GH_PR)).status).toBe('unreachable');
  });

  it('removeLabel est idempotente : 404 n’est jamais une erreur (§9.2.4)', async () => {
    const adapter = new GithubServerAdapter({
      token: async () => 't',
      webhookSecret: 's',
      fetchImpl: mockFetch(() => ({ status: 404 })).impl,
    });
    await expect(adapter.removeLabel(GH_PR, 'cc-override')).resolves.toBeUndefined();
  });

  it('parseEvent extrait la PR — seuls pr et la séquence sont consommés (§9.2.1)', () => {
    const adapter = new GithubServerAdapter({ token: async () => 't', webhookSecret: 's' });
    const event = adapter.parseEvent({
      action: 'created',
      repository: { name: 'demo', owner: { login: 'acme' } },
      pull_request: { number: 42, created_at: '2026-10-01T00:00:00Z' },
      comment: { id: 1 },
      sender: { id: 9, login: 'alice' },
    });
    expect(event.pr).toMatchObject({ platform: 'github', scope: ['acme', 'demo'], number: 42 });
    expect(event.kind).toBe('comment.created');
  });
});

describe('Annexe B — adaptateur serveur Azure DevOps', () => {
  const opts = {
    organizationUrl: 'https://dev.azure.com/org',
    project: 'proj',
    token: async () => 't',
    webhookSecret: 's',
  };

  it('faits de plateforme : chemin de repli, targetUrl obligatoire, voie événementielle non établie (§B)', () => {
    expect(azdoFacts).toEqual({
      threadStatusEmitsPrUpdated: false,
      labelProvenanceExposed: false,
      requiresStatusTargetUrl: true,
    });
  });

  it('profil : pas d’étage 0 (info string non établie), pas de commande slash native (§B.6)', () => {
    const adapter = new AzdoServerAdapter(opts);
    expect(adapter.platformProfile()).toEqual({ id: 'azdo', suggestionInfoString: null, slashPrefixes: [] });
  });

  it('mapping des statuts de fil en camelCase à initiale minuscule (§B.5)', async () => {
    const { impl } = mockFetch((url) => {
      if (url.includes('/threads')) {
        return {
          status: 200,
          body: {
            value: [
              { id: 1, status: 'fixed', comments: [c('issue: a\n\nd')] },
              { id: 2, status: 'wontFix', comments: [c('issue: b\n\nd')] },
              { id: 3, status: 'byDesign', comments: [c('issue: c\n\nd')] },
              { id: 4, status: 'closed', comments: [c('issue: d\n\nd')] },
              { id: 5, status: 'active', comments: [c('issue: e\n\nd')] },
              { id: 6, status: 'pending', comments: [c('issue: f\n\nd')] },
              { id: 7, comments: [c('issue: g\n\nd')] }, // aucun statut posé → unknown
            ],
          },
        };
      }
      return { status: 200, body: {} };
    });
    const adapter = new AzdoServerAdapter({ ...opts, fetchImpl: impl });
    const threads = await adapter.fetchThreads(AZ_PR);
    expect(threads.map((t) => t.resolution)).toEqual([
      'resolved',
      'resolved',
      'resolved',
      'resolved',
      'unresolved',
      'unresolved',
      'unresolved', // un fil bloquant sans statut ne compte jamais comme traité (§B.5)
    ]);
    // Aucun resolvedBy : la plateforme n'expose pas l'auteur (§B.5).
    expect(threads.every((t) => t.resolvedBy === undefined)).toBe(true);
  });

  it('commentaires système traduits en isSystemGenerated (§4.2, CA-20)', async () => {
    const { impl } = mockFetch((url) => {
      if (url.includes('/threads')) {
        return {
          status: 200,
          body: {
            value: [
              { id: 1, status: 'active', comments: [{ ...c('Updated branch'), commentType: 'system' }] },
            ],
          },
        };
      }
      return { status: 200, body: {} };
    });
    const adapter = new AzdoServerAdapter({ ...opts, fetchImpl: impl });
    const threads = await adapter.fetchThreads(AZ_PR);
    expect(threads[0]!.root.isSystemGenerated).toBe(true);
  });

  it('publie un PR Status : cc/1 dans la description, context genre/name, état GitStatusState (§B.7)', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 200, body: {} }));
    const adapter = new AzdoServerAdapter({ ...opts, fetchImpl: impl });
    const result = sampleResult();
    result.state = 'neutral';
    await adapter.publishStatus(AZ_PR, result);
    const call = calls.find((cl) => cl.url.includes('/statuses?api-version=7.1'))!;
    expect(call).toBeDefined(); // le paramètre api-version est obligatoire (§B.7)
    const body = JSON.parse(String(call.init!.body)) as {
      state: string;
      description: string;
      context: { genre: string; name: string };
      targetUrl?: string;
    };
    expect(body.state).toBe('notApplicable'); // neutral → notApplicable (§B.7)
    expect(body.context).toEqual({ genre: 'conventional-comments', name: 'compliance' });
    expect(decodeSummary(body.description)).not.toBeNull();
    expect(body.targetUrl).toContain('https://cc.example/status');
  });

  it('fetchLabels rend le nom seul — ni by ni at (§B.6)', async () => {
    const { impl } = mockFetch((url) => {
      if (url.includes('/labels')) return { status: 200, body: { value: [{ name: 'cc-override', active: true }] } };
      return { status: 200, body: {} };
    });
    const adapter = new AzdoServerAdapter({ ...opts, fetchImpl: impl });
    expect(await adapter.fetchLabels(AZ_PR)).toEqual([{ name: 'cc-override' }]);
  });

  it('identités de service : Build Service marqué isServiceAccount (§B.6)', async () => {
    const { impl } = mockFetch((url) => {
      if (url.includes('/threads')) {
        return {
          status: 200,
          body: {
            value: [
              {
                id: 1,
                status: 'active',
                comments: [
                  {
                    ...c('Analysis complete'),
                    author: {
                      id: 'svc',
                      displayName: 'Project Collection Build Service (org)',
                      uniqueName: 'Project Collection Build Service (org)',
                    },
                  },
                ],
              },
            ],
          },
        };
      }
      return { status: 200, body: {} };
    });
    const adapter = new AzdoServerAdapter({ ...opts, fetchImpl: impl });
    const threads = await adapter.fetchThreads(AZ_PR);
    expect(threads[0]!.root.author.isServiceAccount).toBe(true);
    expect(threads[0]!.root.author.login).toBe('Project Collection Build Service (org)');
  });
});

let cid = 0;
function c(content: string) {
  cid++;
  return {
    id: cid,
    content,
    publishedDate: '2026-10-02T00:00:00Z',
    author: { id: `u-${cid}`, displayName: `User ${cid}`, uniqueName: `user${cid}@example.test` },
  };
}
