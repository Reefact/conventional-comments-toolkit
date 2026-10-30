// @vitest-environment happy-dom
//
// Le balayage des champs de commentaire est un POINT D'ENTRÉE (§9.4, CA-11) : ce qu'il lève doit
// être relevé avec ce que le code faisait. L'adaptateur ne sait pas relever — il ne peut pas
// importer l'extension —, il enrobe donc son balayage avec le `guardEntry` qu'on lui injecte.
//
// Ce qui se teste ici est le CÂBLAGE : que les trois déclencheurs passent par l'enrobage, et non
// un seul d'entre eux. Un `scan()` enrobé à la création mais appelé nu par l'observateur
// laisserait sans contexte les exceptions de tous les balayages suivants.

import { afterEach, describe, expect, it } from 'vitest';
import type { EntryGuard } from '@cct/adapter-shared';
import { GithubClientAdapter } from '../src/index.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Un enrobage qui COMPTE ses appels : il ne relève rien, il dit combien de fois il a servi. */
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

describe('§9.4 — GitHub : le balayage des champs passe par `guardEntry`', () => {
  it('le premier balayage est enrobé', () => {
    const { guardEntry, calls } = countingGuard();
    const adapter = new GithubClientAdapter({ documentRef: document, guardEntry });

    disposers.push(adapter.observeEditors(() => {}).dispose);

    expect(calls()).toBe(1);
  });

  it('le balayage déclenché par une mutation du DOM est enrobé', async () => {
    const { guardEntry, calls } = countingGuard();
    const adapter = new GithubClientAdapter({ documentRef: document, guardEntry });
    disposers.push(adapter.observeEditors(() => {}).dispose);
    const before = calls();

    document.body.appendChild(document.createElement('div'));
    await tick();

    expect(calls()).toBeGreaterThan(before);
  });

  it.each(['turbo:load', 'turbo:frame-load'])('le balayage déclenché par `%s` est enrobé', (type) => {
    const { guardEntry, calls } = countingGuard();
    const adapter = new GithubClientAdapter({ documentRef: document, guardEntry });
    disposers.push(adapter.observeEditors(() => {}).dispose);
    const before = calls();

    document.dispatchEvent(new Event(type));

    expect(calls()).toBe(before + 1);
  });

  it('sans `guardEntry` — hors extension, tests —, l’adaptateur balaie comme avant', () => {
    const adapter = new GithubClientAdapter({ documentRef: document });

    expect(() => adapter.observeEditors(() => {}).dispose()).not.toThrow();
  });
});
