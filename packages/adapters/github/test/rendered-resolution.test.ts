// @vitest-environment happy-dom
// §5.5, §9.2.3 — l'état de résolution que `getRenderedThreadElements()` expose avec chaque fil
// rendu, sur les pages capturées. C'est ce que la signature de reprise du code partagé compare
// à chaque mutation (`contentSignatureOf`) : sans lui, résoudre un fil sur la vue `…/changes`,
// où l'état est porté par un bouton VOISIN du fil (`#resolvedMarkerBeside()`), ne changeait rien
// de ce que la signature regarde, et le bandeau n'était pas recalculé.
//
// Deux propriétés, sur chaque vue : l'état exposé est EXACTEMENT celui de `getThreads()` (même
// lecture, même identifiant), et la page porte bien les deux états — sans quoi l'accord
// pourrait n'être qu'une constante.

import { describe, expect, it } from 'vitest';
import { load, T } from './helpers/real-pages.js';

const CASES = [
  // Vue classique (Conversation) : l'état est déclaré par le conteneur du fil (`classic.ts`).
  ['01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331', ['resolved', 'unresolved']],
  // Vue `…/changes` : le bouton de dé-résolution est le VOISIN du fil — le cas du défaut.
  ['05-files-reponse-fil-ligne.html', '/Reefact/just-dummies/pull/331/changes', ['resolved', 'unknown']],
  // Overview : l'état est déclaré par le groupe du fil (`overview.ts`). Aucune capture Overview
  // ne porte de fil RÉSOLU (relevé sur les quinze) : seul l'état ouvert y est vérifié.
  ['03-overview-commentaires-prefixes.html', '/Reefact/just-dummies/pull/548', ['unresolved']],
] as const;

describe('§5.5 — getRenderedThreadElements() expose l’état de résolution de getThreads()', () => {
  it.each(CASES)('%s', async (file, path, states) => {
    const page = load(file, path);
    const rendered = page.adapter.getRenderedThreadElements();
    const threads = await page.adapter.getThreads();
    expect(rendered.map((t) => [t.id, t.resolution])).toEqual(threads.map((t) => [t.id, t.resolution]));
    expect([...new Set(rendered.map((t) => t.resolution))].sort()).toEqual([...states].sort());
  }, T);

  it('vue `…/changes` : résoudre un fil (le bouton voisin retiré) change l’état exposé, sans toucher au fil', () => {
    const page = load('05-files-reponse-fil-ligne.html', '/Reefact/just-dummies/pull/331/changes');
    const before = page.adapter.getRenderedThreadElements();
    const resolved = before.find((t) => t.resolution === 'resolved')!;
    const textBefore = resolved.element.textContent;
    // Le marqueur MESURÉ des deux états (selectors.ts, `resolvedMarker`) : sur cette vue, il est
    // dans la boîte du fil, à côté de lui.
    const marker = resolved.element.parentElement!.querySelector('[data-testid="unified-comment-unresolve-button"]');
    expect(marker).not.toBeNull();
    expect(resolved.element.contains(marker)).toBe(false); // le marqueur est bien HORS du fil
    marker!.remove();
    const after = page.adapter.getRenderedThreadElements().find((t) => t.id === resolved.id)!;
    expect(after.resolution).not.toBe('resolved');
    expect(after.element.textContent).toBe(textBefore); // rien d'autre n'a bougé dans le fil
  }, T);
});
