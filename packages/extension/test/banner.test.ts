import { describe, expect, it } from 'vitest';
import { defaultConfig, type PublishedSummary, type ThreadInfo } from '@cct/core';
import { buildBannerModel, localBlockingUnresolved } from '../src/ui/banner.js';

function thread(body: string, resolution: ThreadInfo['resolution'], id: string): ThreadInfo {
  return {
    id,
    pr: { platform: 'github', createdAt: '', host: 'github.com', scope: ['a', 'b'], number: 1 },
    root: {
      id: `${id}-r`,
      author: { id: 'u', login: 'u', isServiceAccount: false },
      body,
      createdAt: '',
      permalink: `#${id}`,
      isSystemGenerated: false,
      canCarryBlockingState: true,
    },
    replies: [],
    resolution,
    canCarryBlockingState: true,
  };
}

const published = (count: number): PublishedSummary => ({
  state: count > 0 ? 'failure' : 'success',
  isDraft: false,
  exempted: false,
  mode: 'enforce',
  coreVersion: '1.0.0',
  configFingerprint: 'aaaa1111',
  activatedAt: '2026-09-01T00:00:00Z',
  unresolvedBlockingCount: count,
  nonCompliantCommentCount: 0,
  warningCount: 0,
});

describe('§5.5 / CA-03 — bandeau des fils bloquants', () => {
  it('décompte publié en titre, jamais le nombre d’ancres (CA-03)', () => {
    const threads = [thread('issue: a\n\nd', 'unresolved', 't1')];
    // Le serveur compte 3 (édition affaiblissante, résolution refusée, épinglage — §5.5),
    // l'extension n'apparie qu'une ancre.
    const model = buildBannerModel(published(3), threads, defaultConfig(), 'github', 'suggestion', false, []);
    expect(model.count).toBe(3);
    expect(model.anchors).toHaveLength(1);
    expect(model.partial).toBe(true); // « 1 sur 3 localisés »
    expect(model.fromPublished).toBe(true);
  });

  it('issue (non-blocking) n’est jamais compté localement (CA-03)', () => {
    const threads = [thread('issue (non-blocking): a\n\nd', 'unresolved', 't1')];
    expect(localBlockingUnresolved(threads, defaultConfig(), 'github', 'suggestion', false, [])).toHaveLength(0);
  });

  it('sans résumé publié : vue locale, unknown compté non résolu (§5.5, §B.5)', () => {
    const threads = [
      thread('issue: a\n\nd', 'unknown', 't1'),
      thread('issue: b\n\nd', 'resolved', 't2'),
      thread('todo: c\n\nd', 'unresolved', 't3'),
    ];
    const model = buildBannerModel(null, threads, defaultConfig(), 'github', 'suggestion', false, []);
    expect(model.fromPublished).toBe(false);
    expect(model.count).toBe(2); // t1 (unknown → non résolu) et t3 ; t2 résolu exclu
  });

  it('départage E-CONFLICT : une racine issue (blocking, non-blocking) reste comptée', () => {
    const threads = [thread('issue (blocking, non-blocking): a\n\nd', 'unresolved', 't1')];
    expect(localBlockingUnresolved(threads, defaultConfig(), 'github', 'suggestion', false, [])).toHaveLength(1);
  });
});
