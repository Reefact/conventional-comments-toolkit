// Adaptateur factice pour tester l'orchestrateur : l'état de la plateforme est un objet
// mutable que chaque test met en scène.

import type {
  CommentInfo,
  ComplianceResult,
  ConfigRead,
  PlatformProfile,
  PrRef,
  ReviewEvent,
  ThreadInfo,
  UserInfo,
  Zone,
} from '@cct/core';
import type { ServerPlatformAdapter } from '../src/compliance/adapter.js';

export interface FakePlatformState {
  threads: ThreadInfo[];
  loose: { comment: CommentInfo; zone: Zone }[];
  labels: { name: string; by?: UserInfo; at?: string }[];
  isDraft: boolean;
  headSha: string;
  repoConfig: ConfigRead;
  orgConfig: ConfigRead;
  groupMembers: Record<string, string[]>; // group → user ids
  openPrs: PrRef[];
  /** Si vrai, toute lecture d'état échoue (panne d'API). */
  unreachable: boolean;
  failAddLabel?: boolean;
}

export function fakeState(overrides: Partial<FakePlatformState> = {}): FakePlatformState {
  return {
    threads: [],
    loose: [],
    labels: [],
    isDraft: false,
    headSha: 'sha-1',
    repoConfig: { status: 'found', text: '{}' },
    orgConfig: { status: 'absent' },
    groupMembers: {},
    openPrs: [],
    unreachable: false,
    ...overrides,
  };
}

export class FakeAdapter implements ServerPlatformAdapter {
  published: ComplianceResult[] = [];
  labelCalls: { action: 'add' | 'remove'; name: string }[] = [];
  configFetches = 0;
  configBypassFetches = 0;

  constructor(
    public state: FakePlatformState,
    private profile: PlatformProfile = { id: 'github', suggestionInfoString: 'suggestion', slashCommands: false, commandPrefixes: [] }
  ) {}

  platformProfile(): PlatformProfile {
    return this.profile;
  }
  async listOpenPrs(): Promise<PrRef[]> {
    return this.state.openPrs;
  }
  matchesWebhook(): boolean {
    return true;
  }
  verifySignature(): boolean {
    return true;
  }
  parseEvent(): Omit<ReviewEvent, 'sequence'> {
    throw new Error('not used in tests');
  }
  async fetchThreads(): Promise<ThreadInfo[]> {
    this.#check();
    return structuredClone(this.state.threads);
  }
  async fetchStandaloneComments(): Promise<{ comment: CommentInfo; zone: Zone }[]> {
    this.#check();
    return structuredClone(this.state.loose);
  }
  async fetchConfigFile(_pr: PrRef, opts?: { bypassCache: boolean }): Promise<ConfigRead> {
    this.configFetches++;
    if (opts?.bypassCache) this.configBypassFetches++;
    if (this.state.unreachable) return { status: 'unreachable', reason: 'down' };
    return this.state.repoConfig;
  }
  async fetchOrgConfig(url: string | null, _opts?: { bypassCache: boolean }): Promise<ConfigRead> {
    if (url === null) return { status: 'absent' };
    if (this.state.unreachable) return { status: 'unreachable', reason: 'down' };
    return this.state.orgConfig;
  }
  async fetchLabels(): Promise<{ name: string; by?: UserInfo; at?: string }[]> {
    this.#check();
    return structuredClone(this.state.labels);
  }
  async fetchHeadSha(): Promise<string> {
    return this.state.headSha;
  }
  async isDraft(): Promise<boolean> {
    this.#check();
    return this.state.isDraft;
  }
  async publishStatus(_pr: PrRef, result: ComplianceResult): Promise<void> {
    this.published.push(structuredClone(result));
  }
  async addLabel(_pr: PrRef, name: string): Promise<void> {
    if (this.state.failAddLabel) throw new Error('label API down');
    this.labelCalls.push({ action: 'add', name });
    if (!this.state.labels.some((l) => l.name === name)) this.state.labels.push({ name });
  }
  async removeLabel(_pr: PrRef, name: string): Promise<void> {
    this.labelCalls.push({ action: 'remove', name });
    this.state.labels = this.state.labels.filter((l) => l.name !== name);
  }
  async isInGroup(user: UserInfo, group: string): Promise<boolean> {
    return (this.state.groupMembers[group] ?? []).includes(user.id);
  }

  #check(): void {
    if (this.state.unreachable) throw new Error('platform unreachable');
  }
}
