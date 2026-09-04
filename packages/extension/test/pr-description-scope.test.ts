// @vitest-environment happy-dom
// §4.1, dernière ligne du tableau : « Description de la PR — ❌ format validé, ❌ peut porter
// un état bloquant — hors périmètre Conventional Comments ». L'extension l'ignorait : le
// `<textarea>` ouvert par « Edit » sur la description matche la chaîne `editors`, et
// `#contextOf()` le faisait tomber dans son REPLI (« ni fil, ni corps de revue, ni
// conversation, donc commentaire de ligne de diff »), donc en zone `thread-root` — la seule
// qui puisse porter un état bloquant. Conséquences visibles, dans cet ordre de gravité :
// en mode `enforce`, la description n'était plus modifiable faute d'un `label:` en tête
// (§5.4) ; et la barre d'outils du §5.1 s'affichait sur un texte qui n'est pas un
// commentaire de revue.
//
// LE FIXTURE EST UNE MESURE, pas une reconstitution de mémoire : la structure ci-dessous est
// recopiée de la page `https://github.com/Reefact/conventional-comments-toolkit/pull/39`
// telle que github.com la sert à un visiteur anonyme (2026-09) — classes, imbrication et
// forme des identifiants (`issue-…` pour la description, `issuecomment-…` pour un
// commentaire de la conversation, `pullrequest-…` pour le commentaire de la description).
//
// UN POINT N'EST PAS MESURÉ et ces tests ne prétendent pas le trancher : le `<textarea>` de
// la description est servi par un `<include-fragment>` que GitHub refuse sans session, donc
// ses attributs propres n'ont pas été observés. C'est la raison d'être de la forme du
// correctif — l'exclusion porte sur les ANCÊTRES, quels que soient les attributs du champ —,
// et le premier test ci-dessous en fait la contre-épreuve : le MÊME champ, hors de cette
// ancestralité, reste observé. Sans lui, l'absence de la description ne prouverait rien, elle
// pourrait tenir à un fixture que la chaîne `editors` ne voit pas du tout.
import { beforeEach, describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';

/** Le champ d'édition, à l'identique partout : ce qui change d'un test à l'autre est ce qui
 * l'entoure, jamais lui. */
const FIELD = (id: string) =>
  `<textarea class="comment-form-textarea js-comment-field" id="${id}">## Summary</textarea>`;

/** La description telle que github.com l'imbrique — trois marqueurs emboîtés, chacun mesuré. */
const DESCRIPTION = (opts: { paletteClass?: boolean; commentClass?: boolean } = {}) => `
  <div class="TimelineItem TimelineItem--condensed pt-0 js-comment-container js-updatable-content${
    opts.paletteClass === false ? '' : ' js-command-palette-pull-body'
  }">
    <div class="timeline-comment-group js-minimizable-comment-group TimelineItem-body my-0" id="issue-5321598100">
      <div id="pullrequest-4420243102" class="timeline-comment-group comment previewable-edit${
        opts.commentClass === false ? '' : ' js-comment'
      } editable-comment timeline-comment">
        <form class="js-comment-update" id="issue-5321598100-edit-form">
          ${FIELD('issue-5321598100-body')}
        </form>
      </div>
    </div>
  </div>`;

/** Un commentaire de la conversation et une réponse de fil : deux zones du §4.1, sur la même
 * page, qui doivent rester observées. */
const IN_SCOPE_ZONES = `
  <div class="TimelineItem js-comment-container">
    <div class="timeline-comment-group TimelineItem-body my-0" id="issuecomment-5513165152">
      <div class="timeline-comment comment previewable-edit js-comment">
        <form class="js-comment-update" id="issuecomment-5513165152-edit-form">
          ${FIELD('issuecomment-5513165152-body')}
        </form>
      </div>
    </div>
  </div>
  <div class="review-thread-component js-comment-container js-resolvable-timeline-thread-container" id="discussion_r1">
    <div class="review-comment js-comment"></div>
    <form class="js-new-comment-form">${FIELD('reply-1')}</form>
  </div>`;

function observe(): { adapter: GithubClientAdapter; ids: string[] } {
  const adapter = new GithubClientAdapter({ documentRef: document });
  const ids: string[] = [];
  adapter.observeEditors((editor) => ids.push((editor.element as HTMLTextAreaElement).id)).dispose();
  return { adapter, ids };
}

describe('§4.1 — la description de la PR est hors périmètre', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/39'),
      configurable: true,
    });
  });

  it('le même champ, hors de l’ancestralité de la description, reste observé', () => {
    document.body.innerHTML = `<form class="js-new-comment-form">${FIELD('issue-5321598100-body')}</form>`;
    expect(observe().ids).toEqual(['issue-5321598100-body']);
  });

  it('observeEditors ne remonte jamais l’éditeur de la description', () => {
    document.body.innerHTML = DESCRIPTION() + IN_SCOPE_ZONES;
    expect(observe().ids).not.toContain('issue-5321598100-body');
  });

  it('les zones du §4.1 de la même page restent observées', () => {
    document.body.innerHTML = DESCRIPTION() + IN_SCOPE_ZONES;
    expect(observe().ids).toEqual(['issuecomment-5513165152-body', 'reply-1']);
  });

  // Les trois candidats de la chaîne sont emboîtés dans le MÊME rendu (cf. selectors.ts) :
  // chacun doit suffire à lui seul, ce qui fait du renommage de l'un un incident sans
  // conséquence. On les retire de l'extérieur vers l'intérieur.
  it('la classe extérieure renommée, les marqueurs intérieurs attrapent encore la description', () => {
    document.body.innerHTML = DESCRIPTION({ paletteClass: false });
    expect(observe().ids).toEqual([]);
    document.body.innerHTML = DESCRIPTION({ paletteClass: false, commentClass: false });
    expect(observe().ids).toEqual([]);
  });

  // La page des fichiers modifiés n'a AUCUNE description de PR : la chaîne n'y matche rien,
  // et ce silence est le cas nominal — il ne doit ni exclure un éditeur, ni être journalisé
  // comme une dégradation de sélecteur (§9.4, CA-11).
  it('sur une page sans description, rien n’est exclu et rien n’est journalisé', () => {
    document.body.innerHTML = `<div class="js-diff-progressive-container">${FIELD('inline-1')}</div>`;
    const { adapter, ids } = observe();
    expect(ids).toEqual(['inline-1']);
    expect(adapter.log.failures.some((f) => f.chain === 'pr-description')).toBe(false);
  });
});
