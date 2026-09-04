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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { ClientConfigResolver } from '../src/config-resolver.js';
import {
  observePrChromeNavigation,
  RENDER_RETRY_THROTTLE_MS,
  RENDER_RETRY_WINDOW_MS,
} from '../src/content-internal.js';

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

// Le second versant du même hors-périmètre : la description porte un `.comment-body`
// (MESURÉ : un, sur la page de `pull/39`), donc `decorateComment` y posait un badge dès
// qu'elle commençait par `note: …` ou `issue: …` — sur un texte dont la convention ne dit
// rien.
const DESCRIPTION_BODY = (text: string) => `
  <div class="TimelineItem js-comment-container js-command-palette-pull-body">
    <div id="pullrequest-4420243102" class="js-comment">
      <div class="comment-body markdown-body js-comment-body">${text}</div>
    </div>
  </div>`;

const COMMENT_BODY = (text: string) => `
  <div class="TimelineItem js-comment-container">
    <div id="issuecomment-5513165152" class="timeline-comment js-comment">
      <div class="comment-body markdown-body js-comment-body">${text}</div>
    </div>
  </div>`;

describe('§5.5 — la description ne reçoit pas de badge', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/39'),
      configurable: true,
    });
  });

  it('getRenderedComments écarte la description et garde les commentaires', () => {
    document.body.innerHTML = DESCRIPTION_BODY('note: description') + COMMENT_BODY('issue: un vrai commentaire');
    const bodies = new GithubClientAdapter({ documentRef: document }).getRenderedComments();
    expect(bodies.map((b) => b.bodyText)).toEqual(['issue: un vrai commentaire']);
  });

  // Les deux SONDES, elles, continuent de la compter — et ce n'est pas un oubli : elles ne
  // servent pas à décorer mais à savoir si la page a bougé. Le test suivant dit pourquoi
  // cette divergence est nécessaire, et pas seulement tolérable.
  it('les sondes de signature comptent toujours la description', () => {
    document.body.innerHTML = DESCRIPTION_BODY('note: description') + COMMENT_BODY('issue: un vrai commentaire');
    const adapter = new GithubClientAdapter({ documentRef: document });
    expect(adapter.getRenderedCommentCount()).toBe(2);
    expect(adapter.getRenderedCommentElements()).toHaveLength(2);
  });
});

describe('§5.5 — écarter la description ne rend pas l’extension sourde', () => {
  const disposers: (() => void)[] = [];
  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    document.body.innerHTML = '';
    // Même précaution que `pr-chrome-navigation.test.ts` : un `GithubClientAdapter` relit
    // `document.location` à chaque appel, et le laisser sur une PR ferait revivre
    // l'observateur d'un test suivant dans le document partagé par le fichier.
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pulls'),
      configurable: true,
    });
  });

  // Le piège que l'exclusion des badges ouvrait, et qui n'est visible qu'ici : `showed`
  // décide si l'observateur continue de rendre passé `RENDER_RETRY_WINDOW_MS`. Sur une PR
  // SANS AUCUN COMMENTAIRE, sans fil et sans résumé publié (composant B non déployé), la
  // description était le seul corps rendu — la retirer du décompte faisait tomber `showed`
  // à `false`, et l'observateur devenait muet cinq secondes plus tard : le PREMIER
  // commentaire posté n'aurait plus jamais reçu ses badges avant un rechargement complet.
  it('le premier commentaire posté après la fenêtre d’hydratation reçoit ses badges', async () => {
    document.body.innerHTML = DESCRIPTION_BODY('## Summary');
    // `fetchImpl` substitué : sans lui, la lecture de configuration du §8.1.2 partirait pour
    // de vrai vers github.com depuis la suite de tests.
    const adapter = new GithubClientAdapter({
      documentRef: document,
      fetchImpl: async () => new Response('', { status: 404 }),
    });
    const resolver = new ClientConfigResolver(async () => null);
    let t = 0;
    disposers.push(observePrChromeNavigation(adapter, resolver, document, () => t));
    await settle();
    expect(document.querySelectorAll('.cct-badge')).toHaveLength(0); // rien à décorer encore

    t += RENDER_RETRY_WINDOW_MS + 1; // la fenêtre d'hydratation est écoulée
    document.body.insertAdjacentHTML('beforeend', COMMENT_BODY('issue: le build casse'));
    await settle();

    const badged = document.querySelector('#issuecomment-5513165152 .cct-badge');
    expect(badged).not.toBeNull();
    // Et la description, elle, n'a toujours reçu aucun badge.
    expect(document.querySelectorAll('.js-command-palette-pull-body .cct-badge')).toHaveLength(0);
  });
});

/** Attente RÉELLE, et non un simple vidage de microtâches : une mutation qui arrive pendant
 * qu'un rendu est encore en vol est relancée par un `setTimeout(RENDER_RETRY_THROTTLE_MS)`
 * (content-internal.ts, `missedMutation`). Un `await Promise.resolve()` répété n'atteint
 * jamais ce réveil-là, et le test échouerait pour une raison qui n'est pas la sienne. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RENDER_RETRY_THROTTLE_MS * 2 + 50));
}
