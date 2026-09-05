// @vitest-environment happy-dom
// Troisième versant du DOM de la vue `/pull/N/changes`, après `changes-view-composer.test.ts`
// (ce que l'extension y écrit) et `changes-view-thread.test.ts` (ce qu'elle y lit d'un fil) :
// l'APERÇU du champ en cours de rédaction.
//
// Symptôme signalé : sur `…/changes`, passer sur l'onglet « Preview » affiche `issue: …` en
// toutes lettres, là où la même bascule sur `/pull/N` montre le badge du §5.5. La décoration
// de l'aperçu n'a jamais été une exigence — c'est un effet de bord de la génération héritée,
// dont l'aperçu porte `comment-body` — mais l'écart entre les deux vues, lui, est un défaut.
//
// LE FIXTURE EST UNE MESURE, et il faut dire de QUOI : pas de la page. `…/changes` répond
// **302 vers `/files` sans session** (2026-09-05), cette vue n'était donc pas ouvrable depuis
// l'environnement de développement — contrairement aux deux fichiers voisins, dont les relevés
// viennent d'une console ouverte sur la vraie page. Les classes et l'emboîtement reproduits ici
// viennent du CODE LIVRÉ par github.githubassets.com : `selectors.previewBody` cite les deux
// chunks, ce qu'ils rendent, et ce que cette forme de mesure ne peut pas garantir.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { ClientConfigResolver } from '../src/config-resolver.js';
import { observePrChromeNavigation } from '../src/content-internal.js';

/** Le composeur de la nouvelle vue, onglet « Preview » actif. En mode « Write » l'enveloppe
 * n'existe pas du tout — le rendu mesuré est `"preview" === mode && <div …>` —, d'où le
 * `write` de ce fixture, qui rend le champ SEUL. */
const COMPOSEUR = (opts: { texte?: string; write?: boolean; hachages?: boolean; globale?: boolean } = {}) => {
  const suffixe = opts.hachages === false ? '__zzzzz' : '__M5C8O';
  const corps = [opts.globale === false ? '' : 'markdown-body', 'MarkdownViewer-module__markdownBody__yGuuU']
    .filter(Boolean)
    .join(' ');
  return `
  <div class="MarkdownEditor-module__container__H4O8J">
    <textarea aria-label="Markdown value" placeholder="Leave a comment" class="prc-Textarea-TextArea-snlco"></textarea>
    ${
      opts.write
        ? ''
        : `<div aria-live="polite" tabindex="-1" class="MarkdownEditor-module__previewViewerWrapper${suffixe}">
             <h2 class="MarkdownEditor-module__previewHeader__CZcUw">Rendered Markdown Preview</h2>
             <div class="${corps}"><p>${opts.texte ?? 'issue: le nom est ambigu'}</p></div>
           </div>`
    }
  </div>`;
};

/** Un fil rendu de la même vue, réduit à ce qui compte ici : son corps, que la chaîne
 * `comment-body` attrape. Relevé complet dans `changes-view-thread.test.ts`. */
const FIL = (corps = 'issue (non-blocking): la date reste celle de la première occurrence.') => `
  <div class="rounded-2 bgColor-default">
    <div data-testid="review-thread">
      <div class="ReviewThreadComment-module__ReviewThreadContainer__m2xlo">
        <a data-testid="avatar-link" href="/Reefact">Reefact</a>
        <div class="markdown-body ReviewThreadComment-module__SafeHTMLBox__yw3LK"><p>${corps}</p></div>
      </div>
    </div>
  </div>`;

/** La génération héritée, telle que la feuille de style livrée la décrit (mesurée le
 * 2026-09-05) : `.previewable-comment-form` porte `.write-content` et `.preview-content`, que
 * `write-selected`/`preview-selected` font alterner, et le corps de l'aperçu est un
 * `.comment-body` — ce qui explique que les badges s'y affichent depuis toujours. */
const HERITE = (texte = 'issue: le nom est ambigu') => `
  <form class="js-new-comment-form">
    <div class="previewable-comment-form js-previewable-comment-form preview-selected">
      <div class="write-content js-write-bucket"><textarea name="comment[body]" class="js-comment-field"></textarea></div>
      <div class="preview-content">
        <div class="comment-body markdown-body js-preview-body"><p>${texte}</p></div>
      </div>
    </div>
  </form>`;

function adapter(): GithubClientAdapter {
  return new GithubClientAdapter({ documentRef: document });
}

function corpsRendus(): { texte: string; classe: string }[] {
  return adapter()
    .getRenderedComments()
    .map(({ element, bodyText }) => ({ texte: bodyText.trim(), classe: element.className }));
}

beforeEach(() => {
  Object.defineProperty(document, 'location', {
    value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes'),
    configurable: true,
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('§5.5 — l’aperçu d’un champ, sur la nouvelle vue des fichiers modifiés', () => {
  it('est un corps à décorer, et son titre n’entre pas dans le texte relu', () => {
    document.body.innerHTML = COMPOSEUR();
    // Le `<h2>Rendered Markdown Preview</h2>` est DANS l'enveloppe : prendre l'enveloppe
    // entière ferait entrer son texte dans le corps relu, et `analyze()` ne reconnaîtrait
    // plus le préfixe. D'où la prise en deux morceaux, et cette assertion sur le texte EXACT.
    expect(corpsRendus()).toEqual([{ texte: 'issue: le nom est ambigu', classe: expect.stringContaining('markdown-body') }]);
  });

  // Passe AVANT comme APRÈS le correctif, et il faut le dire : c'est une garde — la chaîne
  // ne doit pas se mettre à attraper le champ lui-même ou son conteneur — pas une preuve.
  it('en mode « Write », il n’y a rien à décorer', () => {
    document.body.innerHTML = COMPOSEUR({ write: true });
    expect(corpsRendus()).toEqual([]);
  });

  // LE défaut, et la raison pour laquelle une chaîne de plus ne suffisait pas : `queryChainAll`
  // ne rend que les éléments du PREMIER candidat qui matche. Un candidat d'aperçu ajouté à la
  // chaîne `comment-body` serait resté derrière celui des fils — donc jamais atteint dès qu'un
  // fil est rendu, c'est-à-dire dans le cas signalé — et, placé devant, il aurait évincé les
  // corps de fil dès qu'un aperçu s'ouvre. Ce test échoue des DEUX façons.
  it('un fil rendu et un aperçu ouvert sont décorés tous les deux', () => {
    document.body.innerHTML = FIL() + COMPOSEUR();
    expect(corpsRendus().map((c) => c.texte)).toEqual([
      'issue (non-blocking): la date reste celle de la première occurrence.',
      'issue: le nom est ambigu',
    ]);
  });

  // Sans ce compte, le correctif de la chaîne serait resté sans effet : ouvrir l'aperçu ne
  // change ni le résumé publié, ni les identifiants de fils, ni le nombre de corps publiés —
  // la signature de reprise (`chromeSignatureOf`) resterait identique et `run()` ressortirait
  // avant de rendre. Le second versant, `getRenderedCommentElements()`, porte le cas d'une
  // SECONDE rédaction suivie d'un second aperçu : les comptes n'y bougent pas, seul le digest
  // de texte voit que le corps n'est plus celui que nos badges décrivaient.
  it('le compte et les éléments sondés par le rendu le voient apparaître', () => {
    document.body.innerHTML = FIL();
    expect(adapter().getRenderedCommentCount()).toBe(1);
    expect(adapter().getRenderedCommentElements()).toHaveLength(1);

    document.body.innerHTML = FIL() + COMPOSEUR();
    expect(adapter().getRenderedCommentCount()).toBe(2);
    expect(adapter().getRenderedCommentElements()).toHaveLength(2);
  });

  it('ne dépend ni du hachage de build ni de la classe de module du corps', () => {
    document.body.innerHTML = COMPOSEUR({ hachages: false });
    expect(corpsRendus()).toHaveLength(1);

    // `markdown-body` retirée : le repli par la classe de module du viewer prend le relais.
    document.body.innerHTML = COMPOSEUR({ globale: false });
    expect(corpsRendus()).toHaveLength(1);
  });

  // Un brouillon n'est le corps d'AUCUN fil : `getThreads()` lit la chaîne `comment-body`, où
  // l'aperçu n'entre pas. La garde vaut pour le jour où GitHub renommera `SafeHTMLBox` — une
  // chaîne unique aurait alors fait lire au fil le texte que quelqu'un est en train d'écrire.
  //
  // Passe AVANT comme APRÈS le correctif : c'est le prix de la chaîne séparée, et ce test est
  // là pour qu'il reste payé si quelqu'un décide un jour de les réunir.
  it('un aperçu ouvert dans un fil n’est jamais lu comme le corps du fil', async () => {
    document.body.innerHTML = `
      <div class="rounded-2 bgColor-default">
        <div data-testid="review-thread">
          <div class="ReviewThreadComment-module__ReviewThreadContainer__m2xlo">
            <a data-testid="avatar-link" href="/Reefact">Reefact</a>
            <div class="markdown-body ReviewThreadComment-module__SafeHTMLBox__yw3LK"><p>issue: le nom est ambigu</p></div>
          </div>
          <div class="AddCommentEditor-module__AddCommentEditor__SOA0y">${COMPOSEUR({ texte: 'note: brouillon de réponse' })}</div>
        </div>
      </div>`;
    const threads = await adapter().getThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]!.root.body.trim()).toBe('issue: le nom est ambigu');
  });
});

describe('§5.5 — la génération héritée garde exactement ce qu’elle avait', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pull/48'),
      configurable: true,
    });
  });

  // La chaîne `preview-body` n'a AUCUN candidat hérité, et c'est délibéré : l'aperçu y porte
  // déjà `comment-body`. Lui en donner un le ferait décorer deux fois — d'où l'assertion sur
  // le compte, et non sur la seule présence.
  //
  // Passe AVANT comme APRÈS le correctif — c'est exactement ce qu'on lui demande : la vue où
  // les badges marchaient déjà doit rester à l'identique, à l'élément près.
  it('son aperçu reste attrapé une seule fois, par la chaîne `comment-body`', () => {
    document.body.innerHTML = HERITE();
    expect(corpsRendus()).toEqual([
      { texte: 'issue: le nom est ambigu', classe: 'comment-body markdown-body js-preview-body' },
    ]);
    expect(adapter().getRenderedCommentCount()).toBe(1);
  });
});

describe('§5.5 — de bout en bout : le badge atterrit dans l’aperçu', () => {
  const observations: (() => void)[] = [];

  afterEach(() => {
    for (const dispose of observations.splice(0)) dispose();
    document.body.innerHTML = '';
    // Le document happy-dom est partagé par tout le fichier : laisser `location` sur une PR
    // ferait revivre, à la prochaine mutation, un observateur d'un test suivant.
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/Reefact/conventional-comments-toolkit/pulls'),
      configurable: true,
    });
  });

  /** Le chemin réel : `observePrChromeNavigation` → `renderPrChrome` → `decorateComment`.
   * Configuration absente (404) : les défauts s'appliquent, `issue` est un label connu. */
  it('l’aperçu porte le badge de son label, comme un commentaire publié', async () => {
    document.body.innerHTML = COMPOSEUR();
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const client = new GithubClientAdapter({ documentRef: document, fetchImpl: notFound });
    observations.push(observePrChromeNavigation(client, new ClientConfigResolver(async () => null), document));
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    const apercu = document.querySelector('[class*="previewViewerWrapper"] .markdown-body')!;
    expect(apercu.querySelector('.cct-badge')?.textContent).toContain('issue');
    // Le contenu stocké n'est pas touché (§5.5) : le préfixe est MASQUÉ, pas retiré.
    expect(apercu.textContent).toContain('le nom est ambigu');
  });
});
