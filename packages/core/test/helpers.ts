import type {
  CommentInfo,
  EffectiveConfig,
  EvaluationContext,
  EvaluationInput,
  PlatformProfile,
  PrRef,
  ThreadInfo,
  UserInfo,
  ValidationInput,
  Zone,
} from '../src/types.js';
import { defaultConfig } from '../src/config/defaults.js';

export const githubProfile: PlatformProfile = {
  id: 'github',
  suggestionInfoString: 'suggestion',
  slashCommands: true,
  commandPrefixes: [
    '@dependabot',
    '@copilot',
    '@coderabbitai',
    '@codex',
    '@claude',
    '@mergifyio',
    '@renovate',
    '@rustbot',
    '@bors',
  ],
};

export const azdoProfile: PlatformProfile = {
  id: 'azdo',
  suggestionInfoString: null,
  slashCommands: false,
  commandPrefixes: [],
};

export function user(login: string, opts: Partial<UserInfo> = {}): UserInfo {
  return { id: `id-${login}`, login, isServiceAccount: false, ...opts };
}

export function config(overrides: (c: EffectiveConfig) => void = () => {}): EffectiveConfig {
  const c = defaultConfig();
  overrides(c);
  return c;
}

let commentSeq = 0;
export function comment(body: string, opts: Partial<CommentInfo> = {}): CommentInfo {
  commentSeq++;
  return {
    id: opts.id ?? `c${commentSeq}`,
    author: opts.author ?? user('reviewer'),
    body,
    createdAt: '2026-10-01T10:00:00Z',
    permalink: opts.permalink ?? `https://example.test/comment/${commentSeq}`,
    isSystemGenerated: false,
    canCarryBlockingState: true,
    ...opts,
  };
}

export function pr(opts: Partial<PrRef> = {}): PrRef {
  return {
    platform: 'github',
    createdAt: '2026-10-01T00:00:00Z',
    host: 'github.com',
    scope: ['acme', 'demo'],
    number: 42,
    ...opts,
  };
}

let threadSeq = 0;
export function thread(root: CommentInfo, opts: Partial<ThreadInfo> = {}): ThreadInfo {
  threadSeq++;
  return {
    id: opts.id ?? `t${threadSeq}`,
    pr: pr(),
    root,
    replies: [],
    resolution: 'unresolved',
    canCarryBlockingState: root.canCarryBlockingState,
    ...opts,
  };
}

export function vInput(body: string, opts: Partial<ValidationInput> = {}): ValidationInput {
  return {
    body,
    platform: githubProfile,
    isSystemGenerated: false,
    zone: 'thread-root' as Zone,
    canCarryBlockingState: true,
    author: user('reviewer'),
    ...opts,
  };
}

export function ctx(opts: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    activatedAt: '2026-09-01T00:00:00Z',
    isDraft: false,
    isOverrideMember: () => false,
    knownBlockingThreadIds: [],
    firstVerdicts: {},
    ...opts,
  };
}

export function evalInput(opts: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    pr: pr(),
    platform: githubProfile,
    threads: [],
    loose: [],
    config: config(),
    configNotices: [],
    ctx: ctx(),
    ...opts,
  };
}

export function codes(diags: { code: string }[]): string[] {
  return diags.map((d) => d.code);
}

export function codeSev(diags: { code: string; severity: string }[]): [string, string][] {
  return diags.map((d) => [d.code, d.severity]);
}
