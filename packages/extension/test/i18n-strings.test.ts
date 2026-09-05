// Le pendant, pour les chaînes que l'extension écrit elle-même, du garde de parité des
// messages de `core/` (`core/test/i18n.test.ts`) : même défaut, même invisibilité, même
// symptôme — une phrase anglaise au milieu de phrases françaises, que seule une relecture
// dans la langue qu'on ne relit pas ferait voir.

import { describe, expect, it } from 'vitest';
import { catalogs, ui } from '../src/ui/strings.js';

describe('§10 — catalogues d’interface de l’extension', () => {
  const { fr, en } = catalogs as { fr: Record<string, string>; en: Record<string, string> };

  it('les deux catalogues portent EXACTEMENT les mêmes clés', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('les paramètres `{clé}` d’une chaîne sont les mêmes dans les deux langues', () => {
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of Object.keys(en)) {
      expect(params(fr[key] ?? ''), key).toEqual(params(en[key]!));
    }
  });

  it('les identifiants de labels ne sont PAS traduits, jusque dans les exemples (§10)', () => {
    // « les identifiants de labels restent en anglais ; seules descriptions et infobulles
    // sont traduites » — un `example.issue` francisé en « probleme: … » ferait insérer par
    // la barre d'outils un préfixe que la validation rejetterait aussitôt.
    const ids = ['praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'decision', 'typo', 'polish', 'quibble'];
    for (const id of ids) {
      // L'exemple OUVRE sur l'identifiant, suivi du deux-points ou de sa décoration — la
      // grammaire du §3.1, jamais une simple présence du mot quelque part dans la phrase.
      for (const lang of ['fr', 'en']) {
        expect(ui(lang, `example.${id}`), `${lang}/${id}`).toMatch(new RegExp(`^${id}(:| \\()`));
      }
    }
    // Idem pour les décorations, qui vivent dans la même grammaire (§3.3).
    expect(ui('fr', 'example.suggestion')).toContain('(non-blocking)');
  });

  it('une langue inconnue se rabat sur l’anglais plutôt que sur la clé', () => {
    expect(ui('de-DE', 'fix.apply')).toBe(ui('en', 'fix.apply'));
    expect(ui('fr-CA', 'fix.apply')).toBe(ui('fr', 'fix.apply'));
  });
});
