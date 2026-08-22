import { describe, expect, it, vi } from 'vitest';
import type { PrRef } from '@cct/core';
import { EvaluationScheduler } from '../src/compliance/scheduler.js';
import { MemoryStorage } from '../src/compliance/storage.js';
import type { Orchestrator, EvaluationOutcome } from '../src/compliance/orchestrator.js';

const PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

describe('§6.4 — coalescence et séquences (étapes 1 à 4)', () => {
  it('une revue en lot est coalescée : un seul recalcul, portant la plus haute séquence', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const calls: number[] = [];
    const orchestrator = {
      evaluatePr: async (_pr: PrRef, sequence: number): Promise<EvaluationOutcome> => {
        calls.push(sequence);
        return { result: null, published: true };
      },
    } as unknown as Orchestrator;
    const scheduler = new EvaluationScheduler(storage, orchestrator);

    // Cinq événements d'une même revue en lot, dans la fenêtre de 10 s par défaut.
    const promises = [
      scheduler.trigger(PR, 'webhook'),
      scheduler.trigger(PR, 'webhook'),
      scheduler.trigger(PR, 'webhook'),
      scheduler.trigger(PR, 'webhook'),
      scheduler.trigger(PR, 'reconcile'),
    ];
    await vi.advanceTimersByTimeAsync(10_001);
    await Promise.all(promises);
    expect(calls).toEqual([5]); // un seul recalcul, séquence la plus haute (5)
    vi.useRealTimers();
  });

  it('chaque déclenchement incrémente le compteur monotone par PR, quelle que soit la source', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const calls: number[] = [];
    const orchestrator = {
      evaluatePr: async (_pr: PrRef, sequence: number): Promise<EvaluationOutcome> => {
        calls.push(sequence);
        return { result: null, published: true };
      },
    } as unknown as Orchestrator;
    const scheduler = new EvaluationScheduler(storage, orchestrator);

    const p1 = scheduler.trigger(PR, 'webhook');
    await vi.advanceTimersByTimeAsync(10_001);
    await p1;
    const p2 = scheduler.trigger(PR, 'manual');
    await vi.advanceTimersByTimeAsync(10_001);
    await p2;
    expect(calls).toEqual([1, 2]);
    vi.useRealTimers();
  });

  it('la fenêtre se lit dans la dernière configuration connue du dépôt (§6.4)', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const { defaultConfig } = await import('@cct/core');
    const cfg = defaultConfig();
    cfg.server.coalesceWindowSeconds = 1;
    await storage.setLastEffectiveConfig('github:github.com:acme/demo', cfg);
    const calls: number[] = [];
    const orchestrator = {
      evaluatePr: async (_pr: PrRef, sequence: number): Promise<EvaluationOutcome> => {
        calls.push(sequence);
        return { result: null, published: true };
      },
    } as unknown as Orchestrator;
    const scheduler = new EvaluationScheduler(storage, orchestrator);
    const p = scheduler.trigger(PR, 'webhook');
    await vi.advanceTimersByTimeAsync(1_001);
    await p;
    expect(calls).toEqual([1]);
    vi.useRealTimers();
  });
});
