// Non-régression des écarts confirmés par la revue adversariale du composant B.

import { describe, expect, it } from 'vitest';
import type { CommentInfo, PrRef, ThreadInfo, UserInfo } from '@cct/core';
import { Orchestrator } from '../src/compliance/orchestrator.js';
import { MemoryStorage } from '../src/compliance/storage.js';
import { ConfigCache } from '../src/compliance/cache.js';
import { AdminEntryPoint } from '../src/compliance/admin.js';
import { OrgModeWatch } from '../src/compliance/scheduler.js';
import { GithubServerAdapter } from '../src/adapters/github/index.js';
import { FakeAdapter, fakeState } from './fake-adapter.js';

const alice: UserInfo = { id: 'u-alice', login: 'alice', isServiceAccount: false };
const lead: UserInfo = { id: 'u-lead', login: 'lead', isServiceAccount: false };

const PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

const comment = (body: string, id: string, author: UserInfo = alice): CommentInfo => ({
  id,
  author,
  body,
  createdAt: '2026-10-02T00:00:00Z',
  permalink: `https://example.test/${id}`,
  isSystemGenerated: false,
  canCarryBlockingState: true,
});
const thread = (root: CommentInfo, opts: Partial<ThreadInfo> = {}): ThreadInfo => ({
  id: `t-${root.id}`,
  pr: PR,
  root,
  replies: [],
  resolution: 'unresolved',
  canCarryBlockingState: true,
  ...opts,
});

const enforceConfig = {
  status: 'found' as const,
  text: JSON.stringify({
    mode: 'enforce',
    activation: { activatedAt: '2026-09-01T00:00:00Z' },
    resolverOverrideGroup: ['acme/leads'],
  }),
};

function makeEnv(state: Parameters<typeof fakeState>[0]) {
  const adapter = new FakeAdapter(fakeState(state));
  const storage = new MemoryStorage();
  const clock = { now: new Date('2026-10-05T12:00:00Z') };
  const orchestrator = new Orchestrator({
    adapter,
    storage,
    cache: new ConfigCache(() => clock.now.getTime()),
    floorProvider: async () => null,
    facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: true, requiresStatusTargetUrl: false },
    now: () => clock.now,
  });
  return { adapter, storage, orchestrator, clock };
}

let seq = 100;

describe('écart serveur — une panne d’isInGroup est une incapacité à évaluer, pas un refus', () => {
  it('résolution par un membre habilité + API des groupes en panne → délai de grâce, jamais un rouge', async () => {
    const root = comment('issue: fuite mémoire\n\nd', 'c1');
    const env = makeEnv({
      repoConfig: enforceConfig,
      threads: [
        thread(root, {
          resolution: 'resolved',
          resolvedBy: lead,
          replies: [comment('decision: hors périmètre, dette suivie en PROJ-142', 'c2', lead)],
        }),
      ],
      groupMembers: { 'acme/leads': [lead.id] },
    });
    // Tour 1 nominal : la résolution est retenue, statut vert.
    await env.orchestrator.evaluatePr(PR, ++seq);
    expect(env.adapter.published[0]!.state).toBe('success');

    // L'API des groupes tombe : convertir la panne en « non habilité » repasserait le
    // check au rouge sur une information qui n'a pas pu être lue.
    env.adapter.isInGroup = async () => {
      throw new Error('groups API down');
    };
    env.adapter.state.headSha = 'sha-2';
    const outcome = await env.orchestrator.evaluatePr(PR, ++seq);
    expect(outcome.skipped).toBe('grace'); // statut précédent en place
    expect(env.adapter.published).toHaveLength(1);
  });
});

describe('écart serveur — porte 14.c : un échec de relecture du SHA abandonne la publication', () => {
  it('fetchHeadSha en panne → rien publié, statut précédent conservé', async () => {
    const env = makeEnv({ repoConfig: enforceConfig, threads: [thread(comment('issue: x\n\nd', 'c1'))] });
    await env.orchestrator.evaluatePr(PR, ++seq);
    expect(env.adapter.published).toHaveLength(1);
    env.adapter.fetchHeadSha = async () => {
      throw new Error('API down');
    };
    env.adapter.state.threads = [];
    const outcome = await env.orchestrator.evaluatePr(PR, ++seq);
    expect(outcome.published).toBe(false);
    expect(env.adapter.published).toHaveLength(1);
  });
});

describe('écart serveur — rapport à blanc : l’habilitation est réellement résolue', () => {
  it('un fil résolu par un membre habilité avec decision valide n’apparaît pas comme futur échec', async () => {
    const root = comment('issue: fuite mémoire\n\nd', 'c1');
    const adapter = new FakeAdapter(
      fakeState({
        repoConfig: enforceConfig,
        openPrs: [PR],
        threads: [
          thread(root, {
            resolution: 'resolved',
            resolvedBy: lead,
            replies: [comment('decision: hors périmètre, dette suivie en PROJ-142', 'c2', lead)],
          }),
        ],
        groupMembers: { 'acme/leads': [lead.id] },
      })
    );
    const admin = new AdminEntryPoint({
      adapter,
      storage: new MemoryStorage(),
      floorProvider: async () => null,
      facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: true, requiresStatusTargetUrl: false },
    });
    const report = await admin.dryRun(
      { platform: 'github', host: 'github.com', scope: ['acme', 'demo'] },
      '2026-09-01T00:00:00Z'
    );
    expect(report[0]!.unresolvedBlockingThreads).toHaveLength(0); // résolution retenue (§6.1 cas 2)
  });
});

describe('écart serveur — §6.3.3 : l’assouplissement du mode est observé sans attendre le TTL (CA-27)', () => {
  const orgDoc = (mode: string) =>
    ({
      status: 'found',
      text: JSON.stringify({
        mode,
        activation: { activatedAt: '2026-09-01T00:00:00Z' },
        resolverOverrideGroup: ['acme/leads'],
      }),
    }) as const;

  it('org enforce → warn : la sonde invalide le cache, l’évaluation suivante débloque la PR en ~2 minutes', async () => {
    const adapter = new FakeAdapter(
      fakeState({
        repoConfig: { status: 'found', text: '{}' },
        orgConfig: orgDoc('enforce'),
        threads: [thread(comment('issue: fuite mémoire\n\nd', 'c1'))],
      })
    );
    const storage = new MemoryStorage();
    const clock = { now: new Date('2026-10-05T12:00:00Z') };
    const orchestrator = new Orchestrator({
      adapter,
      storage,
      cache: new ConfigCache(() => clock.now.getTime()),
      floorProvider: async () => ({ configUrl: 'https://config.example/org.json' }),
      facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: true, requiresStatusTargetUrl: false },
      now: () => clock.now,
    });
    const watch = new OrgModeWatch(orchestrator);
    const advance = (s: number) => (clock.now = new Date(clock.now.getTime() + s * 1000));

    // T0 : org en enforce, fil bloquant non résolu → échec publié.
    await orchestrator.evaluatePr(PR, ++seq);
    expect(adapter.published[0]!.state).toBe('failure');

    // T0+30 s : première sonde — elle enregistre le mode courant du document d'org.
    advance(30);
    expect((await watch.runOnce()).observed).toBe('enforce');

    // T0+60 s : retour arrière — l'organisation repasse le mode à warn (§6.3.3).
    advance(30);
    adapter.state.orgConfig = orgDoc('warn');

    // T0+90 s : la sonde observe l'assouplissement et invalide TOUT le cache —
    // sans elle, l'entrée org resterait servie jusqu'à configCacheTtlSeconds (3600 s).
    advance(30);
    expect(await watch.runOnce()).toEqual({ observed: 'warn', invalidated: true });

    // T0+120 s : l'évaluation suivante juge en warn — statut jamais en échec (§6.2.2),
    // la PR est débloquée « en quelques minutes », pas au terme du TTL.
    advance(30);
    adapter.state.headSha = 'sha-2';
    await orchestrator.evaluatePr(PR, ++seq);
    expect(adapter.published.at(-1)!.state).toBe('success');
  });

  it('la sonde ne conclut rien d’une panne ou d’un document invalide (§8.1.5)', async () => {
    const adapter = new FakeAdapter(fakeState({ orgConfig: orgDoc('enforce') }));
    const clock = { now: new Date('2026-10-05T12:00:00Z') };
    const cache = new ConfigCache(() => clock.now.getTime());
    const orchestrator = new Orchestrator({
      adapter,
      storage: new MemoryStorage(),
      cache,
      floorProvider: async () => ({ configUrl: 'https://config.example/org.json' }),
      facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: true, requiresStatusTargetUrl: false },
      now: () => clock.now,
    });
    expect((await orchestrator.probeOrgModeSoftening()).observed).toBe('enforce');

    adapter.state.unreachable = true;
    expect(await orchestrator.probeOrgModeSoftening()).toEqual({ observed: null, invalidated: false });

    adapter.state.unreachable = false;
    adapter.state.orgConfig = { status: 'found', text: '{"mode": "nonsense"}' };
    expect(await orchestrator.probeOrgModeSoftening()).toEqual({ observed: null, invalidated: false });
  });
});

describe('écart serveur — parseEvent GitHub ne fabrique pas de PR pour une issue simple', () => {
  const gh = new GithubServerAdapter({ token: async () => 't', webhookSecret: 's' });

  it('issue_comment sur une issue qui n’est pas une PR → rejeté', () => {
    expect(() =>
      gh.parseEvent({
        action: 'created',
        repository: { name: 'demo', owner: { login: 'acme' } },
        issue: { number: 7, created_at: '2026-10-01T00:00:00Z' }, // pas de champ pull_request
        comment: { id: 1 },
        sender: { id: 9, login: 'alice' },
      })
    ).toThrow(/pull request/);
  });

  it('issue_comment sur une issue qui EST une PR → accepté', () => {
    const event = gh.parseEvent({
      action: 'created',
      repository: { name: 'demo', owner: { login: 'acme' } },
      issue: { number: 7, created_at: '2026-10-01T00:00:00Z', pull_request: { url: 'https://…' } },
      comment: { id: 1 },
      sender: { id: 9, login: 'alice' },
    });
    expect(event.pr.number).toBe(7);
  });
});
