import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHttpServer } from '../src/http.js';
import { MemoryStorage } from '../src/compliance/storage.js';
import { ConfigCache } from '../src/compliance/cache.js';
import { Orchestrator } from '../src/compliance/orchestrator.js';
import { EvaluationScheduler } from '../src/compliance/scheduler.js';
import { AdminEntryPoint } from '../src/compliance/admin.js';
import { GithubServerAdapter } from '../src/adapters/github/index.js';
import { FakeAdapter, fakeState } from './fake-adapter.js';

let server: Server;
let base: string;
const storage = new MemoryStorage();
const adminToken = 'secret-admin-token';
const webhookSecret = 'webhook-secret';

beforeAll(async () => {
  const adapter = new FakeAdapter(
    fakeState({
      repoConfig: {
        status: 'found',
        text: JSON.stringify({ mode: 'enforce', activation: { activatedAt: '2026-09-01T00:00:00Z' }, resolverOverrideGroup: ['acme/leads'] }),
      },
      openPrs: [
        { platform: 'github', createdAt: '2026-10-01T00:00:00Z', host: 'github.com', scope: ['acme', 'demo'], number: 42 },
      ],
      groupMembers: { 'acme/leads': ['u-lead'] },
    })
  );
  // GithubServerAdapter porte la vérification de signature réelle ; on la teste via son
  // implémentation, indépendamment de l'orchestration.
  const gh = new GithubServerAdapter({ token: async () => 't', webhookSecret });
  const orchestrator = new Orchestrator({
    adapter,
    storage,
    cache: new ConfigCache(),
    floorProvider: async () => null,
    facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: false, requiresStatusTargetUrl: false },
  });
  const scheduler = new EvaluationScheduler(storage, orchestrator);
  const admin = new AdminEntryPoint({
    adapter,
    storage,
    floorProvider: async () => null,
    facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: false, requiresStatusTargetUrl: false },
  });

  server = createHttpServer({
    platforms: [
      { id: 'github', adapter: gh, scheduler },
      { id: 'github-fake', adapter, scheduler },
    ],
    admin: new Map([['github-fake', admin]]),
    storage,
    cache: new ConfigCache(),
    adminToken,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('couche HTTP — webhooks (§6.4)', () => {
  it('rejette une charge non signée (401)', async () => {
    const res = await fetch(`${base}/webhook/github`, {
      method: 'POST',
      body: JSON.stringify({ repository: {}, pull_request: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('accepte une charge correctement signée (202)', async () => {
    const raw = JSON.stringify({
      repository: { name: 'demo', owner: { login: 'acme' } },
      pull_request: { number: 42, created_at: '2026-10-01T00:00:00Z' },
      sender: { id: 1, login: 'alice' },
    });
    const signature = `sha256=${createHmac('sha256', webhookSecret).update(raw).digest('hex')}`;
    const res = await fetch(`${base}/webhook/github`, {
      method: 'POST',
      headers: { 'x-hub-signature-256': signature, 'content-type': 'application/json' },
      body: raw,
    });
    expect(res.status).toBe(202);
  });

  it('plateforme inconnue → 404', async () => {
    const res = await fetch(`${base}/webhook/gitlab`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(404);
  });
});

describe('couche HTTP — administration (§6.2.4)', () => {
  it('refuse sans jeton d’administration (401)', async () => {
    const res = await fetch(`${base}/admin/dry-run`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('CA-34 : rapport à blanc via HTTP, aucun statut publié', async () => {
    const res = await fetch(`${base}/admin/dry-run`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'github-fake',
        repo: { platform: 'github', host: 'github.com', scope: ['acme', 'demo'] },
        activatedAt: '2026-09-01T00:00:00Z',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: unknown[] };
    expect(Array.isArray(body.report)).toBe(true);
  });

  it('CA-10 : le journal des exemptions est lisible via l’administration', async () => {
    await storage.appendExemptionLog({
      prKey: 'github:github.com:acme/demo#42',
      action: 'granted',
      by: { id: 'u-lead', login: 'lead' },
      at: '2026-10-05T00:00:00Z',
      reason: 'correctif urgent',
    });
    const res = await fetch(`${base}/admin/exemption-log`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = (await res.json()) as { entries: { by: { login: string }; at: string }[] };
    expect(body.entries.some((e) => e.by.login === 'lead' && e.at === '2026-10-05T00:00:00Z')).toBe(true);
  });

  it('CA-27 : l’invalidation du cache est exposée (retour arrière §6.3.3)', async () => {
    const res = await fetch(`${base}/admin/cache/invalidate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });
});

describe('couche HTTP — page de statut (targetUrl, §6.3.1)', () => {
  it('CA-25 : la sortie complète est accessible derrière la targetUrl', async () => {
    await storage.setLastPublished('github:github.com:acme/demo#42', {
      headSha: 'sha-1',
      state: 'failure',
      counts: { unresolvedThreads: 1, nonCompliantComments: 0, warnings: 0 },
      configFingerprint: 'aaaa1111',
      noticeKinds: [],
      threadIds: ['t1'],
      commentIds: [],
      at: '2026-10-05T00:00:00Z',
      machineLine: 'cc/1 state=failure draft=0 exempt=0 mode=enforce activated=- core=1.0.0 cfg=aaaa1111 t=1 c=0 w=0',
      headline: '1 fil bloquant non résolu.',
      humanOutput: '# Sortie complète\n- [issue: x](https://example.test/c1) — @alice',
    });
    // L'alias chemin → clé est écrit par l'orchestrateur à la publication ; l'URL de la
    // page ne porte pas l'hôte (§6.3.1).
    await storage.setPrPathAlias('github/acme/demo#42', 'github:github.com:acme/demo#42');
    const res = await fetch(`${base}/status/pr/github/acme/demo/42`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lastPublished: { state: string };
      machineLine: string;
      humanOutput: string;
    };
    expect(body.lastPublished.state).toBe('failure');
    // « La même sortie » que le §6.3.1 : ligne machine et sortie humaine complète (CA-25).
    expect(body.machineLine).toContain('cc/1 ');
    expect(body.humanOutput).toContain('https://example.test/c1');
  });

  it('PR sans résultat publié → 404', async () => {
    const res = await fetch(`${base}/status/pr/github/acme/demo/999`);
    expect(res.status).toBe(404);
  });
});
