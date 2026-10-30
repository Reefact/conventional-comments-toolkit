// @vitest-environment happy-dom
//
// Le balayage des champs de commentaire est un POINT D'ENTRÉE (§9.4, CA-11) : même raison, même
// câblage que côté GitHub — voir `packages/adapters/github/test/guard-entry.test.ts`. Azure DevOps
// n'a pas d'équivalent de Turbo : le premier balayage et l'observateur de mutations suffisent.

import { afterEach, describe, expect, it } from 'vitest';
import type { EntryGuard } from '@cct/adapter-shared';
import { AzdoClientAdapter } from '../src/index.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function countingGuard(): { guardEntry: EntryGuard; calls: () => number } {
  let calls = 0;
  const guardEntry: EntryGuard = (fn) => (...args) => {
    calls += 1;
    return fn(...args);
  };
  return { guardEntry, calls: () => calls };
}

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = '';
});

describe('§9.4 — Azure DevOps : le balayage des champs passe par `guardEntry`', () => {
  it('le premier balayage est enrobé', () => {
    const { guardEntry, calls } = countingGuard();
    const adapter = new AzdoClientAdapter({ documentRef: document, guardEntry });

    disposers.push(adapter.observeEditors(() => {}).dispose);

    expect(calls()).toBe(1);
  });

  it('le balayage déclenché par une mutation du DOM est enrobé', async () => {
    const { guardEntry, calls } = countingGuard();
    const adapter = new AzdoClientAdapter({ documentRef: document, guardEntry });
    disposers.push(adapter.observeEditors(() => {}).dispose);
    const before = calls();

    document.body.appendChild(document.createElement('div'));
    await tick();

    expect(calls()).toBeGreaterThan(before);
  });

  it('sans `guardEntry`, l’adaptateur balaie comme avant', () => {
    const adapter = new AzdoClientAdapter({ documentRef: document });

    expect(() => adapter.observeEditors(() => {}).dispose()).not.toThrow();
  });
});
