// @vitest-environment happy-dom
// Second versant du DOM de la vue `/pull/N/changes` : ce que l'extension LIT d'un fil, après
// `changes-view-composer.test.ts` qui traite ce qu'elle y écrit. Quatre chaînes y étaient à
// zéro — `rendered-comment`, `comment-body`, `comment-author`, `resolved-marker` — et aucune
// ne le journalisait.
//
// LE FIXTURE EST UNE MESURE : structure relevée sur
// `https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes`, fil de
// `packages/adapters/shared/src/index.ts` ligne 257, session ouverte (2026-09-04). Les
// hachages de modules CSS sont ceux du relevé ; les tests vérifient qu'aucune prise n'en
// dépend.
//
// Le relevé porte deux faits qui ne se devinent pas, et qui sont chacun un test ici :
// le marqueur de résolution est SŒUR de `[data-testid="review-thread"]` et non dedans ; le
// champ d'ÉDITION est dans le commentaire édité, là où le champ de RÉPONSE est ailleurs.
import { beforeEach, describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import type { EditorHandle } from '@cct/adapter-shared';

const COMMENT = (opts: { body?: string; author?: string; editor?: string; reply?: boolean; corpsReconnu?: boolean; permalien?: string } = {}) => `
  <div class="ReviewThreadComment-module__ReviewThreadContainer__m2xlo ReviewThreadComment-module__anchorable__kHiVn${
    opts.reply ? ' ReviewThreadComment-module__isReply__tjdPF' : ''
  }">
    <div class="ReviewThreadComment-module__ReviewThreadInnerContainer__ONuV_">
      <div data-testid="comment-header" class="ActivityHeader-module__ActivityHeaderContainer__BnNwC">
        <a class="Avatar-module__avatarLink__LpV3I prc-Link-Link-9ZwDx" href="/Reefact"><img data-testid="github-avatar"></a>
        <a data-testid="avatar-link" class="ActivityHeader-module__AuthorName__VJr9h" href="/Reefact">${opts.author ?? 'Reefact'}</a>
        <span class="ActivityHeader-module__HeaderMutedText__D3G5r"><a class="ActivityHeader-module__HeaderLink__WnxQu prc-Link-Link-9ZwDx" href="${
          opts.permalien ?? PERMALIEN_RACINE
        }">on Sep 4, 2026</a></span>
      </div>
    </div>
    <div class="ReviewThreadComment-module__ReviewThreadWrapper__maToZ">
      <div class="ReviewThreadComment-module__BodyHTMLContainer__HYeiL">
        <div class="markdown-body ${opts.corpsReconnu === false ? 'Autre-module__Inconnu__zzzzz' : 'ReviewThreadComment-module__SafeHTMLBox__yw3LK'}"><p>${opts.body ?? ''}</p></div>
      </div>
      ${
        opts.editor
          ? `<div class="CommentBox-module__commentBoxContainer__fVeTk"><textarea id="${opts.editor}" aria-label="Markdown value" class="prc-Textarea-TextArea-snlco"></textarea></div>`
          : ''
      }
    </div>
  </div>`;

const THREAD = (
  opts: { resolu?: boolean; reponse?: string; editeRacine?: string; editeReponse?: string; corpsReconnu?: boolean } = {}
) => `
  <div class="mt-1 border rounded-2 color-border-default mb-1">
    <div class="rounded-2 bgColor-default">
      <div data-testid="review-thread">
        <div class="ReviewThread-module__ReviewThreadContainer__TvwhT">
          ${COMMENT({ body: 'issue (non-blocking): la date reste celle de la première occurrence.', editor: opts.editeRacine, corpsReconnu: opts.corpsReconnu })}
          ${COMMENT({ body: 'note: le contrat corrigé est cohérent avec le journal.', reply: true, editor: opts.editeReponse, corpsReconnu: opts.corpsReconnu, permalien: PERMALIEN_REPONSE })}
          <div class="rounded-bottom-2 p-2 bgColor-inset">
            <div class="AddCommentEditor-module__AddCommentEditor__SOA0y">
              <div class="AddCommentEditor-module__ConversationCommentBox__qxXdE AddCommentEditor-module__isReplying__jv7w0">
                ${opts.reponse ? `<textarea id="${opts.reponse}" aria-label="Markdown value" class="prc-Textarea-TextArea-snlco"></textarea>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
      ${
        opts.resolu === false
          ? ''
          : '<div data-testid="unified-comment-actions" class="d-flex flex-items-center p-2 border-top"><button data-testid="unified-comment-unresolve-button">Unresolve comment</button></div>'
      }
    </div>
  </div>`;

/** Les deux permaliens mesurés du fil : le §9.2.3 exige des identifiants que cette vue ne
 * met sur aucun conteneur, et c'est le fragment de ces liens qui les porte. */
const PERMALIEN_RACINE = 'https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes#r3932637709';
const PERMALIEN_REPONSE = 'https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes#r3932676203';

function adapter(): GithubClientAdapter {
  return new GithubClientAdapter({ documentRef: document });
}

function observe(): { adapter: GithubClientAdapter; editors: EditorHandle[] } {
  const a = adapter();
  const editors: EditorHandle[] = [];
  a.observeEditors((editor) => editors.push(editor)).dispose();
  return { adapter: a, editors };
}

beforeEach(() => {
  Object.defineProperty(document, 'location', {
    value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes'),
    configurable: true,
  });
});

describe('§9.2.3 — un fil de la nouvelle vue se lit', () => {
  it('corps et auteur sont lus, et le fil est vu comme résolu', async () => {
    document.body.innerHTML = THREAD();
    const threads = await adapter().getThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]!.root.body).toContain('issue (non-blocking):');
    expect(threads[0]!.root.author.login).toBe('Reefact');
    expect(threads[0]!.resolution).toBe('resolved');
  });

  // Le marqueur mesuré est le bouton de DÉ-résolution : présent quand le fil est résolu,
  // absent sinon (mesuré dans les deux états). Son absence ne dit pas « ouvert » mais
  // « non su » — `getThreads()` ne produit que 'resolved' et 'unknown' (§9.2.1).
  // Test de CARACTÉRISATION, et il faut le dire : il passe aussi SANS le candidat mesuré
  // ajouté à `threadAnchor`, le repli large `a[href*="#"]` attrapant déjà ce lien-ci — les
  // liens d'avatar et d'auteur n'ayant pas de fragment. Il fixe ce que la vue rend
  // aujourd'hui (permalien de la DATE, fragment `#r<id>`), il ne prouve pas un correctif.
  it('l’ancre du fil est le permalien du premier commentaire, jamais le lien de l’auteur', async () => {
    document.body.innerHTML = THREAD();
    const threads = await adapter().getThreads();
    expect(threads[0]!.root.permalink).toBe(
      'https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes#r3932637709'
    );
  });

  it('sans le bouton de dé-résolution, la résolution reste inconnue', async () => {
    document.body.innerHTML = THREAD({ resolu: false });
    const threads = await adapter().getThreads();
    expect(threads[0]!.resolution).toBe('unknown');
  });

  // La garde du voisinage : le marqueur étant hors du fil, deux fils partageant une boîte
  // feraient lire à l'un l'état de l'autre. Configuration non observée, mais un fil bloquant
  // déclaré résolu par son voisin est le défaut qu'on ne veut pas prendre le risque d'écrire.
  it('deux fils dans la même boîte : aucun n’adopte le marqueur du voisin', async () => {
    document.body.innerHTML = `
      <div class="rounded-2 bgColor-default">
        <div data-testid="review-thread"><div class="ReviewThread-module__ReviewThreadContainer__TvwhT">${COMMENT({ body: 'issue: un' })}</div></div>
        <div data-testid="review-thread"><div class="ReviewThread-module__ReviewThreadContainer__TvwhT">${COMMENT({ body: 'issue: deux' })}</div></div>
        <div data-testid="unified-comment-actions"><button data-testid="unified-comment-unresolve-button">Unresolve comment</button></div>
      </div>`;
    const threads = await adapter().getThreads();
    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t.resolution)).toEqual(['unknown', 'unknown']);
  });
});

describe('§4.1 — la zone d’un champ, dans un fil de la nouvelle vue', () => {
  it('la boîte de réponse est une réponse, qui ne porte aucun état bloquant', () => {
    document.body.innerHTML = THREAD({ reponse: 'reponse' });
    const { editors } = observe();
    expect(editors).toHaveLength(1);
    expect(editors[0]!.context.zone).toBe('reply');
    expect(editors[0]!.context.canCarryBlockingState).toBe(false);
    expect(editors[0]!.context.action).toBe('compose');
  });

  // §4.1, §4.3 : « L'ÉDITION du commentaire RACINE d'un fil reste zone 'thread-root' — la
  // classer 'reply' la soustrairait à la validation par défaut et à la monotonie. » C'est
  // exactement ce qui se produisait ici, faute de reconnaître un commentaire rendu.
  it('l’édition de la RACINE reste une racine de fil', () => {
    document.body.innerHTML = THREAD({ editeRacine: 'edition-racine' });
    const { editors } = observe();
    expect(editors[0]!.context.zone).toBe('thread-root');
    expect(editors[0]!.context.canCarryBlockingState).toBe(true);
    expect(editors[0]!.context.action).toBe('edit');
  });

  // §9.2.3 : `threadId` pour toute zone `reply` et toute édition, `commentId` pour toute
  // édition. Aucun conteneur de cette vue ne porte d'`id` — les deux se lisent donc dans le
  // fragment du permalien, et le test le vérifie sur les TROIS cas que le contrat couvre.
  it('les identifiants sont lus dans le permalien, faute d’`id` sur la page', () => {
    document.body.innerHTML = THREAD({ editeRacine: 'edition-racine' });
    expect(observe().editors[0]!.context).toMatchObject({ threadId: 'r3932637709', commentId: 'r3932637709' });

    document.body.innerHTML = THREAD({ editeReponse: 'edition-reponse' });
    expect(observe().editors[0]!.context).toMatchObject({ threadId: 'r3932637709', commentId: 'r3932676203' });

    document.body.innerHTML = THREAD({ reponse: 'reponse' });
    const composition = observe().editors[0]!.context;
    expect(composition.threadId).toBe('r3932637709');
    expect(composition.commentId).toBeUndefined(); // rien n'est édité : le §9.2.3 ne l'exige pas
  });

  it('l’édition d’une RÉPONSE reste une réponse', () => {
    document.body.innerHTML = THREAD({ editeReponse: 'edition-reponse' });
    const { editors } = observe();
    expect(editors[0]!.context.zone).toBe('reply');
    expect(editors[0]!.context.canCarryBlockingState).toBe(false);
    expect(editors[0]!.context.action).toBe('edit');
  });
});

describe('CA-11 — ce que l’extension ne sait plus lire, elle l’écrit', () => {
  it('un corps de commentaire non reconnu est journalisé', async () => {
    document.body.innerHTML = THREAD({ corpsReconnu: false });
    const a = adapter();
    await a.getThreads();
    expect(a.log.failures.map((f) => f.chain)).toContain('comment-body');
  });

  it('un fil dont aucun commentaire n’est reconnu est journalisé à l’édition', () => {
    document.body.innerHTML = `
      <div class="rounded-2 bgColor-default">
        <div data-testid="review-thread">
          <div class="js-comment-edit-form"><textarea id="edit" class="js-comment-field"></textarea></div>
        </div>
      </div>`;
    const { adapter: a, editors } = observe();
    expect(editors[0]!.context.zone).toBe('reply'); // le repli, jamais 'thread-root' par défaut
    expect(a.log.failures.map((f) => f.chain)).toContain('rendered-comment');
  });

  it('un fil entièrement reconnu ne journalise ni corps ni auteur', async () => {
    document.body.innerHTML = THREAD();
    const a = adapter();
    await a.getThreads();
    const chains = a.log.failures.map((f) => f.chain);
    expect(chains).not.toContain('comment-body');
    expect(chains).not.toContain('comment-author');
    expect(chains).not.toContain('thread-anchor');
  });
});
