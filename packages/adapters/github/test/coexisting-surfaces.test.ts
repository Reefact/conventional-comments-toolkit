// @vitest-environment happy-dom
// DEUX SURFACES GITHUB VIVANTES SUR LA MÊME PAGE (§4.1, §9.4).
//
// `selectors.editors` mêle trois générations dans UNE chaîne, et une chaîne rend les éléments
// du PREMIER candidat qui matche — c'est sa sémantique, et elle est juste pour ce qu'elle
// modélise : la dérive dans le TEMPS, où l'on essaie le nom d'aujourd'hui puis celui d'hier.
//
// Elle ne modélise pas deux surfaces vivantes EN MÊME TEMPS. `/pull/N` et `/pull/N/changes`
// coexistent : la vue des fichiers modifiés porte des fils de discussion rendus par la
// génération héritée à côté de son propre composeur React. Le premier candidat qui matche
// gagne alors, et l'autre composeur devient INVISIBLE — ni barre d'outils, ni saisie rapide,
// ni garde d'envoi (§5.4) sur la seule zone où un `issue:` bloque réellement.
//
// Le commit 81e07bb a vu le cas et n'a corrigé que le SILENCE : il compare les surfaces
// trouvées à celles que la page porte et journalise le reste. La dégradation est donc tracée,
// et le champ toujours perdu. C'est ce que ces tests exigent.
//
// FIXTURES : les deux composeurs viennent de mesures déjà consignées dans ce dépôt —
// `packages/extension/test/changes-view-composer.test.ts` (relevé en console sur
// `/pull/45/changes`, 2026-09-04) pour la vue réécrite, et les candidats hérités de
// `selectors.editors` pour l'autre. Aucun n'est inventé ici.

import { beforeEach, describe, expect, it } from 'vitest';
import type { EditorHandle } from '@cct/adapter-shared';
import { GithubClientAdapter } from '../src/index.js';

/** Le composeur de la vue des fichiers modifiés, tel que mesuré. */
const CHANGES_COMPOSER = `
  <div data-testid="progressive-diffs-list">
    <div class="prc-Box-Box-rvcbf">
      <textarea id="changes" aria-label="Markdown value" placeholder="Leave a comment"
        class="prc-Textarea-TextArea-snlco"></textarea>
    </div>
  </div>`;

/** Un composeur de la génération héritée — celui d'une réponse de fil, qui est justement ce
 * que la vue des fichiers modifiés affiche à côté de son propre composeur. */
const LEGACY_COMPOSER = `
  <div class="timeline-comment">
    <textarea id="legacy" name="comment[body]" class="js-comment-field"></textarea>
  </div>`;

function observedIds(): string[] {
  const adapter = new GithubClientAdapter({ documentRef: document });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return editors.map((e) => (e.element as HTMLTextAreaElement).id).sort();
}

describe('§4.1, §9.4 — deux générations de composeur sur la même page', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/45/changes'),
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  it('les observe TOUS LES DEUX, pas seulement celui de la première génération qui matche', () => {
    document.body.innerHTML = LEGACY_COMPOSER + CHANGES_COMPOSER;
    expect(observedIds()).toEqual(['changes', 'legacy']);
  });

  it('…et dans l’autre ordre du document, pour que ce ne soit pas la position qui décide', () => {
    document.body.innerHTML = CHANGES_COMPOSER + LEGACY_COMPOSER;
    expect(observedIds()).toEqual(['changes', 'legacy']);
  });

  it('une seule surface présente reste observée à l’identique — aucune régression', () => {
    document.body.innerHTML = LEGACY_COMPOSER;
    expect(observedIds()).toEqual(['legacy']);
    document.body.innerHTML = CHANGES_COMPOSER;
    expect(observedIds()).toEqual(['changes']);
  });

  it('un même champ n’est jamais remonté deux fois, même s’il répond à plusieurs candidats', () => {
    // Le composeur mesuré répond à TROIS candidats de la chaîne (`aria-label`, `placeholder`,
    // `class`). Réunir les surfaces sans dédoublonner poserait trois barres d'outils sur un
    // seul champ — le défaut symétrique de celui qu'on corrige, et tout aussi visible.
    document.body.innerHTML = CHANGES_COMPOSER;
    expect(observedIds()).toEqual(['changes']);
  });
});
