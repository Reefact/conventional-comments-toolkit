// La page d'options donne le bloc qui désactive les labels de réponse, livrés activés (§3.2,
// §8.2). Elle ne peut pas les désactiver elle-même : elle n'écrit pas le fichier d'un dépôt. Ce qui compte donc,
// c'est que le bloc COLLÉ fasse ce qu'il annonce, et que le message dise ce qui s'est
// réellement passé au moment de la copie.

import { describe, expect, it, vi } from 'vitest';
import { enabledLabels, resolveConfig, ADDED_LABELS } from '@cct/core';
import { copySnippet, responseLabelsSnippet } from '../src/options/response-labels.js';

describe('page d’options — le bloc des labels de réponse', () => {
  it('collé tel quel dans `.conventional-comments.json`, il désactive les quatre labels et rien d’autre', () => {
    const repo = { status: 'found' as const, text: responseLabelsSnippet() };
    const { config, notices } = resolveConfig(null, { status: 'absent' }, repo, null, false);
    const active = enabledLabels(config).map((l) => l.id);
    for (const r of ADDED_LABELS) expect(active, r.id).not.toContain(r.id);
    // Rien d'autre ne change : les dix labels de base, et eux seuls.
    expect(active).toEqual(['praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'decision']);
    expect(notices).toEqual([]);
  });

  it('il est construit depuis la définition livrée, pas recopié', () => {
    const ids = (JSON.parse(responseLabelsSnippet()) as { labels: { id: string }[] }).labels.map((l) => l.id);
    expect(ids).toEqual(ADDED_LABELS.map((l) => l.id));
  });

  it('le message dit « copié » seulement quand le presse-papiers a accepté', async () => {
    const select = vi.fn();
    const writeText = vi.fn(async () => {});
    expect(await copySnippet('x', { writeText }, select)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('x');
    expect(select).not.toHaveBeenCalled();
  });

  it('presse-papiers refusé ou absent : le bloc est sélectionné pour une copie manuelle', async () => {
    const refused = { writeText: async () => Promise.reject(new DOMException('denied', 'NotAllowedError')) };
    const select1 = vi.fn();
    expect(await copySnippet('x', refused, select1)).toBe('manual');
    expect(select1).toHaveBeenCalledOnce();

    const select2 = vi.fn();
    expect(await copySnippet('x', undefined, select2)).toBe('manual');
    expect(select2).toHaveBeenCalledOnce();
  });
});
