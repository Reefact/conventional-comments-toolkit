// §10 — « Interface disponible en français et en anglais ». Une clé présente dans un
// catalogue et absente de l'autre ne CASSE rien : `t()` se rabat sur l'anglais et rend un
// texte parfaitement lisible. C'est précisément ce qui rend le défaut coûteux — il ne se
// voit que dans la langue qu'on ne relit pas, une phrase anglaise au milieu de phrases
// françaises, et rien dans la suite de tests ne s'en émeut. La parité se vérifie donc ici,
// mécaniquement, plutôt qu'à la relecture.

import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en.js';
import { fr } from '../src/i18n/fr.js';
import { availableLanguages, resolveLang, t } from '../src/i18n/index.js';

describe('§10 — catalogues de messages', () => {
  it('les deux catalogues portent EXACTEMENT les mêmes clés', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('aucune valeur vide, dans CHACUN des deux catalogues', () => {
    // Chacun parcouru pour son compte, jamais fusionné (revue Reefact, PR #53) : le test
    // précédent impose des jeux de clés identiques, donc `{ ...en, ...fr }` écrase TOUTES les
    // valeurs anglaises par les françaises — ce garde ne relisait alors que le français.
    // Mesuré : `'and': ''` posé dans en.ts laissait passer les quatre tests de ce fichier.
    // C'est le catalogue anglais qui est le plus exposé, en plus : `t()` s'y rabat en
    // dernier ressort, donc une valeur vide y est celle qu'aucun repli ne peut rattraper.
    for (const [lang, catalog] of Object.entries({ en, fr })) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim(), `${lang}/${key}`).not.toBe('');
      }
    }
  });

  it('les paramètres `{clé}` d’un message sont les mêmes dans les deux langues', () => {
    // Un `{label}` oublié à la traduction ne se voit pas non plus : le message reste une
    // phrase, amputée du seul détail qui la rendait actionnable.
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of Object.keys(en)) {
      expect(params(fr[key] ?? ''), key).toEqual(params(en[key]!));
    }
  });

  it('chaque langue annoncée par `availableLanguages` a bien son catalogue', () => {
    for (const lang of availableLanguages) {
      expect(resolveLang(lang)).toBe(lang);
      // Repli sur la clé elle-même si le catalogue manquait : `t()` ne jette jamais.
      expect(t(lang, 'diag.W-NO-DISCUSSION')).not.toBe('diag.W-NO-DISCUSSION');
    }
  });
});
