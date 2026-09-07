import { describe, expect, it } from 'vitest';
import { decodeSummary, defaultConfig, evaluate, type PrRef } from '@cct/core';
import { AzdoServerAdapter, azdoFacts } from '../src/adapters/azdo/index.js';

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
    pr: AZ_PR,
    platform: { id: 'azdo' },
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
    expect(adapter.platformProfile()).toEqual({ id: 'azdo', suggestionInfoString: null });
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

describe('résidu serveur — pagination de listOpenPrs (§6.4 source 2, §6.2.4)', () => {
  it('Azure DevOps : 250 PR actives → 250 PrRef via $top/$skip — la réconciliation est la seule voie de détection (§B.7)', async () => {
    const { impl, calls } = mockFetch((url) => {
      const skip = Number(/\$skip=(\d+)/.exec(url)?.[1] ?? '0');
      const count = Math.max(0, Math.min(100, 250 - skip));
      return {
        status: 200,
        body: {
          value: Array.from({ length: count }, (_, i) => ({
            pullRequestId: skip + i + 1,
            creationDate: '2026-10-01T00:00:00Z',
          })),
        },
      };
    });
    const adapter = new AzdoServerAdapter({
      organizationUrl: 'https://dev.azure.com/org',
      project: 'proj',
      token: async () => 't',
      webhookSecret: 's',
      fetchImpl: impl,
    });
    const prs = await adapter.listOpenPrs({ host: 'dev.azure.com', scope: ['org', 'proj', 'repo'] });
    expect(prs).toHaveLength(250);
    expect(prs.at(-1)!.number).toBe(250);
    expect(calls.filter((cl) => cl.url.includes('searchCriteria.status=active')).length).toBe(3);
  });

  it('Azure DevOps : exactement 100 PR → une page pleine puis une page vide, terminaison saine', async () => {
    const { impl } = mockFetch((url) => {
      const skip = Number(/\$skip=(\d+)/.exec(url)?.[1] ?? '0');
      const count = Math.max(0, Math.min(100, 100 - skip));
      return {
        status: 200,
        body: {
          value: Array.from({ length: count }, (_, i) => ({
            pullRequestId: skip + i + 1,
            creationDate: '2026-10-01T00:00:00Z',
          })),
        },
      };
    });
    const adapter = new AzdoServerAdapter({
      organizationUrl: 'https://dev.azure.com/org',
      project: 'proj',
      token: async () => 't',
      webhookSecret: 's',
      fetchImpl: impl,
    });
    const prs = await adapter.listOpenPrs({ host: 'dev.azure.com', scope: ['org', 'proj', 'repo'] });
    expect(prs).toHaveLength(100);
  });
});
