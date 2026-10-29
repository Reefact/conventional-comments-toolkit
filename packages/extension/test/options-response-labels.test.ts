// La page d'options donne le bloc qui désactive les labels de réponse, livrés activés (§3.2,
// §8.2). Elle ne peut pas les désactiver elle-même : elle n'écrit pas le fichier d'un dépôt. Ce qui compte donc,
// c'est que le bloc COLLÉ fasse ce qu'il annonce, et que le message dise ce qui s'est
// réellement passé au moment de la copie.

import { describe, expect, it, vi } from 'vitest';
import { enabledLabels, resolveConfig, ADDED_LABELS } from '@cct/core';
import { copySnippet, responseLabelsSnippet } from '../src/options/response-labels.js';
import { ui } from '../src/ui/strings.js';

describe('page d’options — le bloc des labels de réponse', () => {
  it('collé tel quel dans `.conventional-comments.json`, il désactive tous les labels ajoutés et rien d’autre', () => {
    const repo = { status: 'found' as const, text: responseLabelsSnippet() };
    const { config, notices } = resolveConfig(null, { status: 'absent' }, repo, null, false);
    const active = enabledLabels(config).map((l) => l.id);
    for (const r of ADDED_LABELS) expect(active, r.id).not.toContain(r.id);
    // Rien d'autre ne change : Conventional Comments, et `decision`.
    expect(active).toEqual([
      'praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'typo', 'polish', 'quibble',
      'decision',
    ]);
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

describe('page d’options — le texte nomme tous les labels que le bloc désactive', () => {
  // Le bloc est construit depuis `ADDED_LABELS` ; le texte, lui, est écrit à la main. Il a dit
  // « quatre » et omis `thanks` quand la famille en comptait cinq (revue Reefact, PR #91) : ce
  // test relie le texte à la définition livrée, dans les deux langues.
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} : la section et l’étape de la visite citent chacun des labels ajoutés`, () => {
      const section = ui(lang, 'options.responses.sub').toLowerCase();
      const tour = ui(lang, 'tour.responses.body').toLowerCase();
      for (const l of ADDED_LABELS) {
        expect(section, l.id).toContain(l.id);
        expect(tour, l.id).toContain(l.id);
      }
    });
  }

  it('le texte annonce le bon nombre de labels', () => {
    const words: Record<number, { fr: string; en: string }> = { 5: { fr: 'Cinq', en: 'Five' } };
    const n = words[ADDED_LABELS.length];
    expect(n, `nombre de labels ajoutés : ${ADDED_LABELS.length}`).toBeDefined();
    expect(ui('fr', 'options.responses.sub').startsWith(`${n!.fr} labels`)).toBe(true);
    expect(ui('en', 'options.responses.sub').startsWith(`${n!.en} labels`)).toBe(true);
  });
});
