// @vitest-environment happy-dom
// §8.1.3, règle 3 — les trois adaptateurs honorent `bypassCache` sur leurs lectures de
// configuration : la requête part en `cache: 'reload'`, et le relais du document
// d'organisation reçoit l'option. Que `reload` écarte bien le cache HTTP du navigateur est une
// affirmation sur le navigateur, mesurée à part dans Chromium (`npm run check:config-cache-bypass`).
// Ce fichier vérifie seulement que l'option ARRIVE à la requête — et qu'elle n'arrive pas sans
// `bypassCache`, où rien ne doit changer.

import { describe, expect, it } from 'vitest';
import type { ConfigRead, PrRef } from '@cct/core';
import { bypassCacheInit } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { GitlabClientAdapter } from '@cct/adapter-gitlab';

const ORG_URL = 'https://interne.example/cc/organisation.json';

function recordingFetch() {
  const inits: (RequestInit | undefined)[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    inits.push(init);
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { inits, fetchImpl };
}

const GITHUB_PR: PrRef = { platform: 'github', createdAt: '', host: 'github.com', scope: ['acme', 'demo'], number: 1 };
const AZDO_PR: PrRef = { platform: 'azdo', createdAt: '', host: 'dev.azure.com', scope: ['o', 'p', 'r'], number: 1 };

describe('§8.1.3 règle 3, CA-27 — `bypassCache` arrive jusqu’à la requête, dans les trois adaptateurs', () => {
  it('bypassCacheInit : `cache: reload` avec l’option, rien sans elle', () => {
    expect(bypassCacheInit({ bypassCache: true })).toEqual({ cache: 'reload' });
    expect(bypassCacheInit({ bypassCache: false })).toEqual({});
    expect(bypassCacheInit()).toEqual({});
  });

  it.each([
    ['github', (f: typeof fetch) => new GithubClientAdapter({ documentRef: document, fetchImpl: f }), GITHUB_PR],
    ['azdo', (f: typeof fetch) => new AzdoClientAdapter({ documentRef: document, fetchImpl: f }), AZDO_PR],
  ] as const)('%s : fichier de dépôt — reload avec l’option, inchangé sans', async (_id, make, pr) => {
    const { inits, fetchImpl } = recordingFetch();
    const adapter = make(fetchImpl);
    await adapter.getRepoConfig(pr);
    await adapter.getRepoConfig(pr, { bypassCache: true });
    expect(inits[0]?.cache).toBeUndefined();
    expect(inits[1]?.cache).toBe('reload');
    expect(inits[1]?.credentials).toBe(inits[0]?.credentials); // seul le cache change
  });

  it.each([
    ['github', (f: typeof fetch) => new GithubClientAdapter({ documentRef: document, fetchImpl: f })],
    ['azdo', (f: typeof fetch) => new AzdoClientAdapter({ documentRef: document, fetchImpl: f })],
    ['gitlab', (f: typeof fetch) => new GitlabClientAdapter({ documentRef: document, fetchImpl: f })],
  ] as const)('%s : document d’organisation lu directement — reload avec l’option, inchangé sans', async (_id, make) => {
    const { inits, fetchImpl } = recordingFetch();
    const adapter = make(fetchImpl);
    await adapter.getOrgConfig(ORG_URL);
    await adapter.getOrgConfig(ORG_URL, { bypassCache: true });
    expect(inits[0]?.cache).toBeUndefined();
    expect(inits[1]?.cache).toBe('reload');
  });

  it.each([
    ['github', GithubClientAdapter],
    ['azdo', AzdoClientAdapter],
    ['gitlab', GitlabClientAdapter],
  ] as const)('%s : document d’organisation relayé — l’option est transmise au relais', async (_id, Adapter) => {
    const seen: ({ bypassCache: boolean } | undefined)[] = [];
    const adapter = new Adapter({
      documentRef: document,
      readOrgConfig: (_url: string, opts?: { bypassCache: boolean }) => {
        seen.push(opts);
        return Promise.resolve<ConfigRead>({ status: 'absent' });
      },
    });
    await adapter.getOrgConfig(ORG_URL);
    await adapter.getOrgConfig(ORG_URL, { bypassCache: true });
    expect(seen[0]?.bypassCache ?? false).toBe(false);
    expect(seen[1]).toEqual({ bypassCache: true });
  });
});
