// Les phrases du journal (§9.4, CA-11) : chaque identifiant du vocabulaire fermé en a une, dans les
// DEUX langues, et le catalogue n'en garde aucune qui ne désigne plus rien.
//
// Le vocabulaire est défini dans le paquet partagé (`SELECTOR_PROBLEMS`), les phrases dans les
// catalogues de l'extension : deux endroits qui ne se voient pas, donc deux listes qui
// divergeraient sans ce test — l'une écrirait un identifiant que l'autre ne dit pas, et la page
// d'options retomberait sur le nom de la chaîne sans que rien ne le signale.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELECTOR_PROBLEMS } from '@cct/adapter-shared';
import { ERROR_CONTEXTS } from '../src/error-capture.js';
import { ui } from '../src/ui/strings.js';

const KEY = (id: string) => `options.journal.problem.${id}`;

describe('§9.4 — le vocabulaire des problèmes a ses phrases', () => {
  it.each(['fr', 'en'])('chaque identifiant a une phrase en %s', (lang) => {
    for (const id of SELECTOR_PROBLEMS) {
      const text = ui(lang, KEY(id));
      // `ui()` rend la clé elle-même quand le catalogue ne la connaît pas.
      expect(text, `${lang} : ${id}`).not.toBe(KEY(id));
      expect(text.trim().length, `${lang} : ${id}`).toBeGreaterThan(0);
    }
  });

  it('les deux langues ne disent pas la même chose mot pour mot', () => {
    // Une phrase restée en français dans le catalogue anglais passerait le test précédent.
    for (const id of SELECTOR_PROBLEMS) {
      expect(ui('fr', KEY(id)), id).not.toBe(ui('en', KEY(id)));
    }
  });

  it('le catalogue ne garde aucune phrase pour un identifiant qui n’existe plus', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/extension/src/ui/strings.ts'), 'utf8');
    const declared = new Set(
      [...source.matchAll(/'options\.journal\.problem\.([a-z-]+)'/g)].map((m) => m[1]!)
    );

    expect([...declared].sort()).toEqual([...SELECTOR_PROBLEMS].sort());
  });
});

// Même garde pour les exceptions : chaque CONTEXTE (ce que le code faisait) a sa phrase, et la
// phrase de repli — celle d'une exception qu'aucun point d'entrée n'a relevée — existe aussi.
describe('§9.4 — les contextes d’erreur ont leurs phrases', () => {
  const KEY_CONTEXT = (id: string) => `options.journal.error.${id}`;

  it.each(['fr', 'en'])('chaque contexte a une phrase en %s, et le repli aussi', (lang) => {
    for (const id of ERROR_CONTEXTS) {
      expect(ui(lang, KEY_CONTEXT(id)), `${lang} : ${id}`).not.toBe(KEY_CONTEXT(id));
    }
    expect(ui(lang, 'options.journal.error')).not.toBe('options.journal.error');
  });

  it('les phrases de contexte et celle du repli sont toutes différentes', () => {
    for (const lang of ['fr', 'en']) {
      const phrases = [...ERROR_CONTEXTS.map((id) => ui(lang, KEY_CONTEXT(id))), ui(lang, 'options.journal.error')];
      expect(new Set(phrases).size, lang).toBe(phrases.length);
    }
  });

  it('le catalogue ne garde aucune phrase pour un contexte qui n’existe plus', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/extension/src/ui/strings.ts'), 'utf8');
    const declared = new Set(
      [...source.matchAll(/'options\.journal\.error\.([a-z-]+)'/g)].map((m) => m[1]!)
    );

    expect([...declared].sort()).toEqual([...ERROR_CONTEXTS].sort());
  });
});

