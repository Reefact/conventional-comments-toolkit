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
