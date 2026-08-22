import { describe, expect, it } from 'vitest';
import type { CommentInfo, PrRef, ThreadInfo, UserInfo } from '@cct/core';
import { AdminEntryPoint, AdminError } from '../src/compliance/admin.js';
import { MemoryStorage } from '../src/compliance/storage.js';
import { prKey } from '../src/compliance/keys.js';
import { FakeAdapter, fakeState } from './fake-adapter.js';

const lead: UserInfo = { id: 'u-lead', login: 'lead', isServiceAccount: false };
const bob: UserInfo = { id: 'u-bob', login: 'bob', isServiceAccount: false };
const alice: UserInfo = { id: 'u-alice', login: 'alice', isServiceAccount: false };

const PR: PrRef = {
  platform: 'azdo',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'dev.azure.com',
  scope: ['org', 'proj', 'repo'],
  number: 7,
};

const comment = (body: string, id: string): CommentInfo => ({
  id,
  author: alice,
  body,
  createdAt: '2026-10-02T00:00:00Z',
  permalink: `https://example.test/${id}`,
  isSystemGenerated: false,
  canCarryBlockingState: true,
});
const thread = (root: CommentInfo, id: string): ThreadInfo => ({
  id,
  pr: PR,
  root,
  replies: [],
  resolution: 'unresolved',
  canCarryBlockingState: true,
});

function makeAdmin(overrides: Parameters<typeof fakeState>[0] = {}) {
  const adapter = new FakeAdapter(
    fakeState({
      repoConfig: {
        status: 'found',
        text: JSON.stringify({ mode: 'enforce', resolverOverrideGroup: ['org/leads'] }),
      },
      groupMembers: { 'org/leads': [lead.id] },
      ...overrides,
    }),
    { id: 'azdo', suggestionInfoString: null, slashPrefixes: [] }
  );
  const storage = new MemoryStorage();
  const admin = new AdminEntryPoint({
    adapter,
    storage,
    floorProvider: async () => null,
    facts: { threadStatusEmitsPrUpdated: false, labelProvenanceExposed: false, requiresStatusTargetUrl: true },
  });
  return { adapter, storage, admin };
}

describe('§6.2.4 — exemption sur le chemin de repli (CA-39)', () => {
  it('octroi nominal : en attente → étiquette posée → confirmée → journalisée (CA-10)', async () => {
    const { adapter, storage, admin } = makeAdmin();
    await admin.grantExemption(PR, lead, 'correctif urgent');
    const active = await storage.getActiveExemption(prKey(PR));
    expect(active?.state).toBe('confirmed');
    expect(active?.by.login).toBe('lead');
    expect(adapter.labelCalls).toContainEqual({ action: 'add', name: 'cc-override' });
    const log = await storage.readExemptionLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'granted', by: { login: 'lead' }, reason: 'correctif urgent' });
    expect(log[0]!.at).toBeTruthy();
  });

  it('CA-39 : pose d’étiquette en échec → aucune exemption active, appel en échec', async () => {
    const { storage, admin } = makeAdmin({ failAddLabel: true });
    await expect(admin.grantExemption(PR, lead)).rejects.toThrow(AdminError);
    expect(await storage.getActiveExemption(prKey(PR))).toBeNull(); // rien ne fuit
  });

  it('atteindre le point d’entrée ne suffit pas : demandeur non habilité refusé et journalisé', async () => {
    const { storage, admin } = makeAdmin();
    await expect(admin.grantExemption(PR, bob)).rejects.toThrow(/resolverOverrideGroup/);
    expect(await storage.getActiveExemption(prKey(PR))).toBeNull();
    const log = await storage.readExemptionLog();
    expect(log[0]).toMatchObject({ action: 'refused', by: { login: 'bob' } });
  });

  it('révocation : supprime l’exemption ET retire l’étiquette (§6.3.2)', async () => {
    const { adapter, storage, admin } = makeAdmin();
    await admin.grantExemption(PR, lead);
    await admin.revokeExemption(PR, lead, 'posée par erreur');
    expect(await storage.getActiveExemption(prKey(PR))).toBeNull();
    expect(adapter.labelCalls).toContainEqual({ action: 'remove', name: 'cc-override' });
    const log = await storage.readExemptionLog();
    expect(log.map((e) => e.action)).toEqual(['granted', 'revoked']);
  });

  it('sur une plateforme à provenance exposée, le point d’entrée renvoie vers l’étiquette', async () => {
    const adapter = new FakeAdapter(fakeState({ groupMembers: { 'org/leads': [lead.id] } }));
    const admin = new AdminEntryPoint({
      adapter,
      storage: new MemoryStorage(),
      floorProvider: async () => null,
      facts: { threadStatusEmitsPrUpdated: true, labelProvenanceExposed: true, requiresStatusTargetUrl: false },
    });
    await expect(admin.grantExemption(PR, lead)).rejects.toThrow(/provenance/);
  });
});

describe('§6.2.4 — rapport à blanc (CA-34)', () => {
  it('restitue ce qui échouerait, sans rien publier ni persister', async () => {
    const { adapter, storage, admin } = makeAdmin({
      openPrs: [PR],
      threads: [thread(comment('issue: fuite mémoire\n\nd', 'c1'), 't1'), thread(comment('pas de label', 'c2'), 't2')],
    });
    const report = await admin.dryRun(
      { platform: 'azdo', host: 'dev.azure.com', scope: ['org', 'proj', 'repo'] },
      '2026-09-01T00:00:00Z'
    );
    expect(report).toHaveLength(1);
    expect(report[0]!.unresolvedBlockingThreads).toHaveLength(1);
    expect(report[0]!.unresolvedBlockingThreads[0]).toMatchObject({ author: 'alice', label: 'issue' });
    expect(report[0]!.formatDiagnostics.some((d) => d.code === 'E-NO-LABEL')).toBe(true);
    // Rien publié, rien persisté (§6.2.4).
    expect(adapter.published).toHaveLength(0);
    expect(await storage.getPinnedConfig(prKey(PR))).toBeNull();
  });

  it('la date hypothétique filtre les PR antérieures', async () => {
    const oldPr = { ...PR, createdAt: '2026-01-01T00:00:00Z' };
    const { admin } = makeAdmin({
      openPrs: [oldPr],
      threads: [thread(comment('issue: fuite mémoire\n\nd', 'c1'), 't1')],
    });
    const report = await admin.dryRun(
      { platform: 'azdo', host: 'dev.azure.com', scope: ['org', 'proj', 'repo'] },
      '2026-09-01T00:00:00Z'
    );
    expect(report[0]!.unresolvedBlockingThreads).toHaveLength(0);
    expect(report[0]!.formatDiagnostics).toHaveLength(0);
  });

  it('setActivatedAt valide la date et la persiste', async () => {
    const { storage, admin } = makeAdmin();
    await admin.setActivatedAt({ platform: 'azdo', host: 'dev.azure.com', scope: ['org', 'proj', 'repo'] }, '2026-09-01T00:00:00Z');
    expect(await storage.getStoredActivatedAt('azdo:dev.azure.com:org/proj/repo')).toBe('2026-09-01T00:00:00Z');
    await expect(
      admin.setActivatedAt({ platform: 'azdo', host: 'dev.azure.com', scope: ['org', 'proj', 'repo'] }, 'pas-une-date')
    ).rejects.toThrow(AdminError);
  });
});
