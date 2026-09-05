// @vitest-environment happy-dom
// §4.1, PREMIÈRE ligne du tableau : « Commentaire inline sur une ligne de diff — cœur de la
// revue ; porte un état de résolution ». C'est la zone où un `issue:` bloque réellement, et
// c'était exactement celle où l'extension ne posait plus rien : sur la nouvelle vue des
// fichiers modifiés (`/pull/N/changes`), aucun des six candidats de la chaîne `editors` ne
// matchait le composeur. Le paradoxe observé par l'utilisateur : la barre d'outils s'affichait
// dans la conversation générale — pour y avertir, via `W-NOT-BLOCKABLE`, qu'un `issue:` n'y
// bloque rien — et manquait sur la seule zone qui compte.
//
// LE FIXTURE EST UNE MESURE, pas une reconstitution de mémoire : relevé en console sur
// `https://github.com/Reefact/conventional-comments-toolkit/pull/45/changes`, session ouverte
// et composeur de ligne ouvert (2026-09-04). Le champ y est le SEUL <textarea> du document, et
// l'ancêtre le plus proche portant un `data-testid` est la liste de diffs entière — d'où
// l'échec du candidat `div[data-testid*="comment-composer"] textarea`, qui n'avait aucun
// conteneur à trouver.
//
// Deux valeurs sont reproduites POUR CE QU'ELLES SONT, c'est-à-dire instables : le hachage de
// build de Primer (`-snlco`) et l'identifiant `useId` de React (`_r_qm_`). Le troisième test
// est leur contre-épreuve — un hachage différent ne doit rien changer.
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '@cct/core';
import { GithubClientAdapter } from '@cct/adapter-github';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';
import { writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle } from '@cct/adapter-shared';

/** Le composeur mesuré. Chaque prise peut être retirée séparément : c'est ce qui permet de
 * vérifier qu'aucune ne porte la détection à elle seule par accident. */
const COMPOSER = (opts: { aria?: boolean; placeholder?: boolean; cls?: string } = {}) => `
  <div data-testid="progressive-diffs-list">
    <div class="prc-Box-Box-rvcbf">
      <textarea id="_r_qm_"
        ${opts.aria === false ? '' : 'aria-label="Markdown value"'}
        ${opts.placeholder === false ? '' : 'placeholder="Leave a comment"'}
        class="${opts.cls ?? 'prc-Textarea-TextArea-snlco'}"></textarea>
    </div>
  </div>`;

function observe(): { adapter: GithubClientAdapter; editors: EditorHandle[] } {
  const adapter = new GithubClientAdapter({ documentRef: document });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((editor) => editors.push(editor)).dispose();
  return { adapter, editors };
}

describe('§4.1 — le composeur de la nouvelle vue des fichiers modifiés', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/45/changes'),
      configurable: true,
    });
  });

  it('est observé, et classé dans la zone qui porte un état bloquant', () => {
    document.body.innerHTML = COMPOSER();
    const { editors } = observe();
    expect(editors.map((e) => (e.element as HTMLTextAreaElement).id)).toEqual(['_r_qm_']);
    expect(editors[0]!.context.zone).toBe('thread-root');
    expect(editors[0]!.context.canCarryBlockingState).toBe(true);
  });

  // Les trois prises visent le MÊME élément aujourd'hui : leur ordre ne joue que le jour où
  // GitHub en réécrit une. Chacune doit donc suffire seule, prises de la plus spécifique à la
  // plus large — on les retire dans cet ordre.
  it('reste observé si le nom accessible change', () => {
    document.body.innerHTML = COMPOSER({ aria: false });
    expect(observe().editors).toHaveLength(1);
  });

  it('reste observé si le texte du placeholder est traduit ou réécrit', () => {
    document.body.innerHTML = COMPOSER({ aria: false, placeholder: false });
    expect(observe().editors).toHaveLength(1);
  });

  it('ne dépend pas du hachage de build de la classe Primer', () => {
    document.body.innerHTML = COMPOSER({ aria: false, placeholder: false, cls: 'prc-Textarea-TextArea-zzzzz' });
    expect(observe().editors).toHaveLength(1);
  });

  // L'ORDRE des candidats est un choix, donc il se vérifie. Les trois prises mesurées sont en
  // FIN de chaîne pour rester strictement additives : `queryChainAll` ne rend que les éléments
  // du PREMIER candidat qui matche, si bien qu'en tête de chaîne `placeholder="Leave a comment"`
  // n'aurait ramené, sur une page héritée, que le composeur principal — et aurait fait
  // disparaître les réponses de fil, que `textarea.js-comment-field` attrape aujourd'hui.
  it('sur une page héritée, les prises mesurées n’évincent aucun éditeur', () => {
    document.body.innerHTML = `
      <form class="js-new-comment-form">
        <textarea id="principal" class="js-comment-field" placeholder="Leave a comment"></textarea>
      </form>
      <div class="review-thread-component js-resolvable-timeline-thread-container">
        <form class="js-new-comment-form"><textarea id="reponse" class="js-comment-field"></textarea></form>
      </div>`;
    const ids = observe().editors.map((e) => (e.element as HTMLTextAreaElement).id);
    expect(ids).toEqual(['principal', 'reponse']);
  });

  // Contre-épreuve : sans aucune des trois prises, plus rien n'est reconnu. Sans elle, les
  // tests ci-dessus pourraient passer grâce à un candidat hérité que le fixture satisferait
  // par hasard, et ne prouveraient rien.
  it('privé des trois prises, il n’est plus reconnu — c’est bien elles qui l’attrapent', () => {
    document.body.innerHTML = COMPOSER({ aria: false, placeholder: false, cls: '' });
    expect(observe().editors).toEqual([]);
  });
});

// CA-11 / §9.4 — la dégradation est silencieuse pour l'utilisateur, jamais pour le journal.
// C'est le second versant du défaut : la chaîne `editors` ne matchant plus rien, l'extension
// était inerte ET muette. `observeEditors` était le seul point de l'adaptateur GitHub à ne
// poser aucun `log.degraded()`, là où `merge-button`, `thread-anchor` et `rendered-comment` en
// posent un.
describe('CA-11 — une chaîne `editors` qui ne reconnaît plus rien laisse une trace', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/45/changes'),
      configurable: true,
    });
  });

  it('une surface de saisie qu’aucun candidat ne reconnaît est journalisée', () => {
    document.body.innerHTML = '<div data-testid="progressive-diffs-list"><textarea id="inconnu"></textarea></div>';
    const { adapter, editors } = observe();
    expect(editors).toEqual([]); // rien n'est décoré : la dégradation reste silencieuse à l'écran
    expect(adapter.log.failures.map((f) => f.chain)).toContain('editors');
  });

  // Le défaut trouvé en revue : la condition ne peut pas porter sur l'échec TOTAL de la
  // chaîne. `queryChainAll` s'arrête au premier candidat qui ramène un élément, donc une page
  // où deux générations coexistent — ce que `selectors.editors` envisage explicitement —
  // laissait la seconde invisible ET sans trace.
  it('un éditeur reconnu n’excuse pas une surface que rien ne reconnaît', () => {
    document.body.innerHTML = `${COMPOSER()}<div><textarea id="inconnu"></textarea></div>`;
    const { adapter: a, editors } = observe();
    expect(editors.map((e) => (e.element as HTMLTextAreaElement).id)).toEqual(['_r_qm_']); // l'un est vu…
    expect(a.log.failures.map((f) => f.chain)).toContain('editors'); // …l'autre est journalisé
  });

  // Le cas NOMINAL, et la raison pour laquelle la condition ne porte pas sur le seul échec de
  // la chaîne : sur une PR dont aucun composeur n'est ouvert, ne rien trouver est la norme.
  // Journaliser ici remplirait le journal de non-événements et évincerait les vraies
  // dégradations, comme `merge-button` le faisait sur une PR fermée (cf. `SelectorLog`).
  it('une page sans aucune surface de saisie ne journalise rien', () => {
    document.body.innerHTML = '<div data-testid="progressive-diffs-list">aucun composeur ouvert</div>';
    const { adapter, editors } = observe();
    expect(editors).toEqual([]);
    expect(adapter.log.failures.map((f) => f.chain)).not.toContain('editors');
  });

  it('un composeur reconnu ne journalise rien non plus', () => {
    document.body.innerHTML = COMPOSER();
    const { adapter, editors } = observe();
    expect(editors).toHaveLength(1);
    expect(adapter.log.failures.map((f) => f.chain)).not.toContain('editors');
  });
});

// §4.1 — « Corps d'une revue soumise en lot : format validé, ne porte AUCUN état bloquant ».
// C'est le panneau « Finish your comments » (Submit comments / Start a review). MESURÉ sur
// `/pull/48/changes` : ses trois candidats historiques y comptent 0, et le champ y est
// indiscernable de celui d'un commentaire de ligne — mêmes `aria-label`, `placeholder` et
// classe. Seuls ses ancêtres le distinguent, et le fixture les reproduit dans leur ordre relevé.
const PANNEAU_REVUE = `
  <div class="ReviewMenu-module__AnchoredReviewBody__kV00L">
    <div class="CommentBox-module__commentBoxContainer__fVeTk">
      <fieldset class="MarkdownEditor-module__fieldSet__RU0NL">
        <div class="MarkdownEditor-module__container__H4O8J">
          <div class="ReviewMenuContent-module__CommentBoxContainer__hDeoQ">
            <div class="MarkdownInput-module__inputWrapper__vOI3M">
              <div class="InlineAutocomplete-module__container__NQUmo">
                <span class="MarkdownInput-module__textArea__BRDa8">
                  <textarea id="revue" aria-label="Markdown value" class="prc-Textarea-TextArea-snlco"></textarea>
                </span>
              </div>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  </div>`;

describe('§4.1 — le corps d’une revue en lot ne porte pas d’état bloquant', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes'),
      configurable: true,
    });
  });

  it('le champ du panneau de revue est classé `review-body`', () => {
    document.body.innerHTML = PANNEAU_REVUE;
    const { editors } = observe();
    expect(editors).toHaveLength(1);
    expect(editors[0]!.context.zone).toBe('review-body');
    // La conséquence visible : `W-NOT-BLOCKABLE` peut enfin s'afficher (§3.5, CA-21).
    expect(editors[0]!.context.canCarryBlockingState).toBe(false);
  });

  // Contre-épreuve : le MÊME champ, hors du panneau, reste une racine de fil — sans quoi le
  // test ci-dessus passerait avec un fixture que rien ne distingue.
  it('le même champ hors du panneau reste une racine de fil', () => {
    document.body.innerHTML = `
      <div class="MarkdownInput-module__inputWrapper__vOI3M">
        <div class="InlineAutocomplete-module__container__NQUmo">
          <span class="MarkdownInput-module__textArea__BRDa8">
            <textarea id="ligne" aria-label="Markdown value" class="prc-Textarea-TextArea-snlco"></textarea>
          </span>
        </div>
      </div>`;
    const { editors } = observe();
    expect(editors[0]!.context.zone).toBe('thread-root');
    expect(editors[0]!.context.canCarryBlockingState).toBe(true);
  });
});

// §4.3 — la garde d'envoi. MESURÉ sur la vue `…/changes`, boîte de réponse ouverte : le
// composeur n'a aucun `form`, ses boutons sont `type="button"`, et le pied en porte trois.
// *Cancel* est un `<button>` nu et premier enfant du groupe ; *Reply* et *Start a review* sont
// chacun enveloppés d'un `<div>`. Aucun attribut ne les sépare — `data-variant` vaut `default`
// pour *Reply* COMME pour *Cancel*.
const PIED = `
  <div class="Footer-module__footer__asFN1">
    <div class="Footer-module__childrenStyling__XjmP5">
      <button id="annuler" type="button" data-variant="default" class="prc-Button-ButtonBase-9n-Xk py-1 px-2">Cancel</button>
      <div><button id="repondre" type="button" data-variant="default" class="prc-Button-ButtonBase-9n-Xk py-1 px-2">Reply</button></div>
      <div><button id="revue" type="button" data-variant="primary" class="prc-Button-ButtonBase-9n-Xk py-1 px-2">Start a review</button></div>
    </div>
  </div>`;

// La date de création de la PR conditionne le périmètre d'activation (§6.2.3) : sans elle, la
// garde reste désarmée et le test passerait sans rien prouver.
const COMPOSEUR_COMPLET = `
  <relative-time datetime="2026-10-01T00:00:00Z"></relative-time>
  <div class="MarkdownEditor-module__container__H4O8J">${COMPOSER()}${PIED}</div>`;

describe('§4.3 — la garde d’envoi sur le composeur de la nouvelle vue', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes'),
      configurable: true,
    });
  });

  it('les deux boutons qui publient sont des contrôles d’envoi, jamais celui qui annule', () => {
    document.body.innerHTML = COMPOSEUR_COMPLET;
    const { adapter: a, editors } = observe();
    const ids = a.getSubmitControls(editors[0]!).map((c) => (c.element as HTMLElement).id);
    expect(ids).toEqual(['repondre', 'revue']);
    expect(ids).not.toContain('annuler');
  });

  // Le clic bloqué, bout en bout : mode `enforce`, commentaire sans label, clic intercepté en
  // capture sur le bouton qui publie — et laissé passer sur celui qui annule, sans quoi
  // l'auteur d'un commentaire non conforme ne pourrait plus en sortir.
  it('en `enforce`, le clic qui publie est intercepté et celui qui annule passe', async () => {
    document.body.innerHTML = COMPOSEUR_COMPLET;
    const { adapter: a, editors } = observe();
    const config = defaultConfig();
    config.mode = 'enforce';
    config.activation.activatedAt = '2026-09-01T00:00:00Z';
    const controller = new EditorController({
      adapter: a,
      editor: editors[0]!,
      resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
      published: null,
      lang: 'fr',
      currentUserLogin: 'alice',
    });
    controller.attach();
    // Le blocage suit la validation, débattue : sans texte non conforme ET sans l'attente,
    // rien n'est encore armé et le test passerait pour une mauvaise raison.
    writeToTextField(editors[0]!.element as HTMLTextAreaElement, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect((document.getElementById('repondre') as HTMLElement).getAttribute('aria-disabled')).toBe('true');
    expect((document.getElementById('annuler') as HTMLElement).hasAttribute('aria-disabled')).toBe(false);

    const clic = (id: string): boolean => {
      const bouton = document.getElementById(id)!;
      let recu = false;
      bouton.addEventListener('click', () => (recu = true));
      bouton.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      return recu;
    };
    expect(clic('repondre')).toBe(false);
    expect(clic('revue')).toBe(false);
    expect(clic('annuler')).toBe(true);
    controller.dispose();
  });
});
