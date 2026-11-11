// §10 — « Interface disponible en français et en anglais ». Une clé présente dans un
// catalogue et absente de l'autre ne CASSE rien : `t()` se rabat sur l'anglais et rend un
// texte parfaitement lisible. C'est précisément ce qui rend le défaut coûteux — il ne se
// voit que dans la langue qu'on ne relit pas, une phrase anglaise au milieu de phrases
// françaises, et rien dans la suite de tests ne s'en émeut. La parité se vérifie donc ici,
// mécaniquement, plutôt qu'à la relecture.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en.js';
import { fr } from '../src/i18n/fr.js';
import { availableLanguages, resolveLang, t } from '../src/i18n/index.js';
import { NOTICE_LEVELS } from '../src/config/notices.js';

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

// Les avis de configuration (§5.3, §9.2.1) portent une clé de message, rendue par `t()` dans la
// langue de l'interface. La parité ci-dessus ne voit pas une clé ABSENTE DES DEUX catalogues :
// `t()` rend alors la clé elle-même, `notice.config.unknown-key`, dans les deux langues. Ce
// garde lit donc les clés là où core les écrit — ses sources — et les cherche dans CHAQUE
// catalogue, puis l'inverse : une entrée que plus aucun code n'écrit est une traduction morte.
describe('§5.3, §10 — chaque clé d’avis écrite par core a son entrée dans les deux catalogues', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url));
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [readFileSync(join(dir, e.name), 'utf8')] : []
    );
  // Une clé d'avis est écrite EN TOUTES LETTRES dans les sources : `'floor-override'`, ou une
  // famille suivie d'un nom (`'config.unknown-key'`). Le niveau, seul paramètre que le catalogue
  // rend lui-même (`notice.level.<niveau>`, voir `noticeText()`), vient de `NOTICE_LEVELS`.
  const CODE = /'(floor-override|(?:invalid|config|floor|unsupported)\.[a-z-]+)'/g;

  const used = (): Set<string> => {
    const out = new Set<string>(NOTICE_LEVELS.map((l) => `level.${l}`));
    for (const text of sources(SRC)) for (const m of text.matchAll(CODE)) out.add(m[1]!);
    return out;
  };

  it('aucune clé d’avis n’est composée à l’exécution — le relevé ci-dessous la manquerait', () => {
    // `makeNotice(kind, \`…${x}\`)`, `warning(\`…\`)`, `floorWarning(\`…\`)` : une clé en
    // gabarit échappe à la lecture des sources. Le pluriel, comme le niveau, se choisit entre
    // deux clés écrites en toutes lettres.
    const composed = /(?:makeNotice\([^,]+,|\b(?:warning|floorWarning|bad)\((?:key, )?)\s*`/;
    for (const text of sources(SRC)) expect(text).not.toMatch(composed);
  });

  it('chaque clé écrite par core est traduite en anglais ET en français', () => {
    const codes = used();
    expect(codes.size).toBeGreaterThan(50); // le relevé lit bien les sources
    for (const code of codes) {
      expect(en[`notice.${code}`], `en/notice.${code}`).toBeDefined();
      expect(fr[`notice.${code}`], `fr/notice.${code}`).toBeDefined();
    }
  });

  it('chaque entrée `notice.*` des catalogues est écrite par core', () => {
    const codes = used();
    for (const key of Object.keys(en).filter((k) => k.startsWith('notice.'))) {
      expect(codes.has(key.slice('notice.'.length)), key).toBe(true);
    }
  });
});
