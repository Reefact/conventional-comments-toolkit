// Adaptateur client Azure DevOps (composant A, §9.2.3, annexe B).
//
// Réécrit le 2026-11-09 sur les captures de dev.azure.com (test/fixtures/pages/, CAPTURES.md) : la
// version précédente avait été écrite de mémoire et n'avait jamais fonctionné. Tout ce qu'il lit
// vient des chaînes de selectors.ts, MESURÉES. Ce que les captures n'ont pas établi prend la
// réponse prudente du contrat, écrite à l'endroit où elle s'applique :
// - la lecture du fichier de configuration du dépôt n'est pas mesurée (§B.4) : `unreachable`, et
//   l'extension est en état dégradé au sens du §5.4 — elle assiste sans bloquer ;
// - le châssis de l'éditeur n'est pas mesuré : réponse neutre (§5.1, §5.3) ;
// - l'état d'un fil n'a pas de marque de structure, seulement un libellé localisé : lu en
//   anglais, `unknown` sinon (selectors.ts, `threadStateLabel`).

import type {
  CommentInfo,
  ConfigRead,
  Disposable,
  PlatformProfile,
  PrRef,
  PublishedSummary,
  ThreadInfo,
  UserInfo,
} from '@cct/core';
import {
  adapterFetch,
  closestChain,
  commentBodyText,
  queryChain,
  queryChainAll,
  writeToTextField,
  NEUTRAL_EDITOR_CHROME,
  SelectorLog,
  type ClientAdapterOptions,
  type EditorChrome,
  type EditorContext,
  type EditorHandle,
  type EntryGuard,
  type PlatformAdapter,
  type RenderedBodyShape,
  type SubmitControl,
} from '@cct/adapter-shared';
import { selectors } from './selectors.js';

/** La forme du corps rendu d'Azure DevOps (§5.5). MESURÉE le 2026-11-09, dans la page, sur un
 * commentaire de test publié pour cela (PR 1, fil 11) — fin de ligne simple, saut forcé (deux
 * espaces), puis un second paragraphe : `P(#text BR #text BR #text BR #text)`, puis `P(#text)`.
 * Azure DevOps rend donc CHAQUE fin de ligne d'un paragraphe par un `<br>`, simple ou forcée, et
 * chaque paragraphe par un `<p>` (aussi 03 : `issue (blocking)` = `P, P, UL`). */
const AZDO_BODY_SHAPE: RenderedBodyShape = Object.freeze({ paragraphTags: ['P'], lineBreakTag: 'BR' });

/** Les libellés d'état MESURÉS, interface en anglais (selectors.ts, `threadStateLabel`). `Unknown`
 * n'y est pas : c'est ce que la page affiche pour un fil `byDesign`, résolu — le pied du fil le
 * dit (`threadFooterButton`). Toute autre langue rend `unknown`, compté non résolu (§5.5, §B.5) :
 * une vue locale qui en compte trop, jamais trop peu. */
const STATE_LABELS: Readonly<Record<string, ThreadInfo['resolution']>> = {
  active: 'unresolved',
  pending: 'unresolved',
  resolved: 'resolved',
  "won't fix": 'resolved',
  closed: 'resolved',
  'by design': 'resolved',
};
const FOOTER_LABELS: Readonly<Record<string, ThreadInfo['resolution']>> = {
  resolve: 'unresolved',
  reactivate: 'resolved',
};

/** Chemin d'une PR sur `dev.azure.com` : `/<org>/<projet>/_git/<dépôt>/pullrequest/<n>` (URLs des
 * captures), la vue se lisant dans `?_a=` (descriptor.ts). Les organisations `*.visualstudio.com`
 * et Azure DevOps Server ne sont pas capturées : ni leur hôte ni leurs chemins ne sont reconnus
 * (décision du propriétaire, 2026-11-09), plutôt que des sélecteurs que personne n'y a mesurés.
 * L'HÔTE est vérifié, pas seulement le chemin : `{org}.visualstudio.com/DefaultCollection/<projet>/…`
 * a la même forme, la collection à la place de l'organisation. */
const PR_HOST = 'dev.azure.com';
const PR_PATH = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)\/?$/;

export class AzdoClientAdapter implements PlatformAdapter {
  #fetch: typeof fetch;
  #doc: Document;
  #readOrgConfig?: (url: string) => Promise<ConfigRead> | null;
  readonly log: SelectorLog;
  #guardEntry: EntryGuard;
  #editorSeq = 0;
  /** Identifiant natif de chaque fil, retenu quand il a été LU : il disparaît de la page quand la
   * réponse au fil est ouverte (selectors.ts, `threadIdCarrier`). Que la page garde le même
   * élément de fil entre les deux états n'est pas mesuré : sinon, l'identifiant de repli prend
   * le relais. */
  #threadIds = new WeakMap<Element, string>();

  constructor(opts: ClientAdapterOptions = {}) {
    this.#fetch = adapterFetch(opts.fetchImpl);
    this.#doc = opts.documentRef ?? document;
    this.#readOrgConfig = opts.readOrgConfig;
    this.log = opts.log ?? new SelectorLog();
    this.#guardEntry = opts.guardEntry ?? ((fn) => fn);
  }

  /** Étage 0 : le bouton *Insert a suggestion* de l'éditeur de ligne insère un bloc
   * `` ```suggestion `` (MESURÉ le 2026-11-09, CAPTURES.md) — le marqueur que le §B.6 laissait à
   * établir, le même que sur GitHub. */
  platformProfile(): PlatformProfile {
    return { id: 'azdo', suggestionInfoString: 'suggestion' };
  }

  /** §B.4 — non mesurée. L'API REST répond à la session du navigateur depuis la PAGE (mesuré le
   * 2026-11-09 en créant les PR de test, CAPTURES.md) ; ce qu'elle fait depuis un SCRIPT DE
   * CONTENU (cookies, CORS, redirections) n'a pas été mesuré, et le dépôt a appris ce que coûte
   * une lecture supposée (`check:content-script-cors`). D'ici là : `unreachable`, donc état
   * dégradé — l'extension assiste sans bloquer (§5.4). */
  async getRepoConfig(_pr: PrRef): Promise<ConfigRead> {
    return { status: 'unreachable', reason: 'Azure DevOps repository config read not measured yet (spec §B.4)' };
  }

  async getOrgConfig(url: string | null): Promise<ConfigRead> {
    if (url === null) return { status: 'absent' };
    // `null` : l'appelant décline pour CETTE url (même origine que la page) — la lecture
    // directe ci-dessous est alors la bonne.
    const relayed = this.#readOrgConfig?.(url);
    if (relayed) return relayed;
    try {
      const res = await this.#fetch(url, { credentials: 'include' });
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  /** SPA sans équivalent de Turbo : `MutationObserver` sur la racine (§B.3). Les éditeurs
   * apparaissent au clic sur un champ replié, et les fils au défilement — le fil d'activité est
   * virtualisé (CAPTURES.md) : tout arrive TARD, l'observateur est le seul chemin. */
  observeEditors(cb: (editor: EditorHandle) => void): Disposable {
    const seen = new WeakSet<Element>();
    const scan = this.#guardEntry(() => {
      for (const el of queryChainAll(this.#doc, selectors.editors)) {
        if (seen.has(el)) continue;
        // Marqué « vu » APRÈS #toHandle() : un champ balayé avant que la page ne désigne une PR
        // reste réexaminable au balayage suivant (§9.2.3).
        const handle = this.#toHandle(el);
        if (!handle) continue;
        seen.add(el);
        cb(handle);
      }
    });
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(this.#doc.documentElement, { childList: true, subtree: true });
    return { dispose: () => observer.disconnect() };
  }

  /** Le châssis de l'éditeur n'a pas été mesuré (styles, géométrie) : réponse neutre, et le code
   * partagé applique ses règles géométriques. */
  getEditorChrome(_editor: EditorHandle): EditorChrome {
    return NEUTRAL_EDITOR_CHROME;
  }

  renderedBodyShape(): RenderedBodyShape {
    return AZDO_BODY_SHAPE;
  }

  /** Les boutons d'envoi de l'éditeur : tous ceux de sa rangée sauf le premier, *Cancel*
   * (selectors.ts, `submitButtons`). Le primaire publie ; l'autre — *Reply & resolve*, *Update &
   * resolve* — publie ET change l'état du fil (§B.6, §4.3). */
  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    const box = closestChain(editor.element, selectors.editorContainer).element;
    if (!box) return [];
    return queryChainAll(box, selectors.submitButtons).map((element) => ({
      element,
      kind: element.matches(selectors.primarySubmit.candidates[0]!) ? ('submit' as const) : ('submit-and-resolve' as const),
    }));
  }

  readValue(editor: EditorHandle): string {
    return (editor.element as HTMLTextAreaElement).value ?? '';
  }

  writeValue(editor: EditorHandle, text: string, caret?: number): void {
    writeToTextField(editor.element as HTMLTextAreaElement, text, caret); // §9.3
  }

  /** Fils lus dans le DOM uniquement (§9.2.3, §10) — les seuls PUBLIÉS : un fil en cours de
   * création (nouveau commentaire, 01 et 04) n'a aucun commentaire et n'est pas un fil. Un fil
   * que la page n'a pas encore rendu — fil d'activité virtualisé — n'est pas rapporté : ni
   * résolu, ni `unknown`. */
  async getThreads(): Promise<ThreadInfo[]> {
    const pr = this.currentPr();
    if (!pr) return [];
    return this.#publishedThreads().map(({ id, element }) => {
      const [root, ...replies] = queryChainAll(element, selectors.comment);
      // Tout fil d'Azure DevOps a un état et un bouton *Resolve* — le commentaire général comme
      // le fil de ligne (03) : tous portent un état bloquant (§4.1).
      return {
        id,
        pr,
        root: { ...this.#comment(root!, id), permalink: '', canCarryBlockingState: true },
        replies: replies.map((c) => this.#comment(c, id)),
        resolution: this.#resolution(element),
        canCarryBlockingState: true,
      };
    });
  }

  /** Un commentaire publié. `permalink` vide : aucune ancre de fil ou de commentaire n'a été
   * mesurée sur Azure DevOps, et le bandeau ne doit pas pointer vers une adresse supposée. */
  #comment(comment: Element, threadId: string): CommentInfo {
    const bodyEl = queryChain(comment, selectors.commentBody).element;
    const name = queryChain(comment, selectors.commentAuthor).element?.getAttribute('aria-label') ?? '';
    const n = this.#commentNumber(comment);
    return {
      id: n ? `${threadId}/${n}` : '',
      author: displayUser(name),
      body: bodyEl ? azdoBodyText(bodyEl) : '',
      createdAt: queryChain(comment, selectors.commentTime).element?.getAttribute('datetime') ?? '',
      permalink: '',
      isSystemGenerated: false,
      canCarryBlockingState: false,
    };
  }

  /** Numéro du commentaire dans son fil, lu sur son bouton *Delete* — rendu sur ses propres
   * commentaires seulement, et retiré pendant leur modification (06) : `undefined` alors. */
  #commentNumber(comment: Element): string | undefined {
    const id = queryChain(comment, selectors.commentDeleteButton).element?.id ?? '';
    return /^__bolt-delete-comment-(\d+)$/.exec(id)?.[1];
  }

  /** L'état d'un fil, lu sur son libellé, puis sur le bouton de son pied — deux textes
   * d'interface (selectors.ts). Le libellé disparaît pendant la modification de la racine (06),
   * le pied pendant une réponse (02) : l'un supplée l'autre. */
  #resolution(thread: Element): ThreadInfo['resolution'] {
    const read = (chain: typeof selectors.threadStateLabel, labels: typeof STATE_LABELS) =>
      labels[(queryChain(thread, chain).element?.textContent ?? '').trim().toLowerCase()];
    return read(selectors.threadStateLabel, STATE_LABELS) ?? read(selectors.threadFooterButton, FOOTER_LABELS) ?? 'unknown';
  }

  /** Identifiant d'un fil : le natif, lu sur `threadIdCarrier` et retenu ; sinon la date de sa
   * racine, à la milliseconde, qui ne change pas d'un balayage à l'autre. `undefined` pour un fil
   * sans commentaire — un nouveau fil n'a pas d'identifiant (`threadId--1`). */
  #threadId(thread: Element): string | undefined {
    const carrier = queryChain(thread, selectors.threadIdCarrier).element;
    const native = carrier ? /(?:^|\s)threadId-(\d+)(?:\s|$)/.exec(carrier.className)?.[1] : undefined;
    if (native) {
      this.#threadIds.set(thread, native);
      return native;
    }
    const known = this.#threadIds.get(thread);
    if (known) return known;
    const root = queryChain(thread, selectors.comment).element;
    const at = root ? queryChain(root, selectors.commentTime).element?.getAttribute('datetime') : null;
    return at ? `dom-thread-${at}` : undefined;
  }

  #publishedThreads(): { id: string; element: Element }[] {
    return queryChainAll(this.#doc, selectors.thread)
      .filter((element) => queryChain(element, selectors.comment).element !== null)
      .map((element, i) => ({ id: this.#threadId(element) ?? `dom-thread-${i}`, element }));
  }

  /** Le bouton *Complete*. Son absence est la NORME sur une PR abandonnée — où le même
   * emplacement porte *Reactivate*, qui ne doit jamais être intercepté — et en plein écran ; elle
   * n'est journalisée qu'ailleurs (selectors.ts). */
  getCompletionControl(): SubmitControl | null {
    if (queryChain(this.#doc, selectors.prSettledState).element) return null;
    const { element } = queryChain(this.#doc, selectors.completeButton);
    if (!element) {
      if (!queryChain(this.#doc, selectors.fullScreen).element) this.log.degraded(selectors.completeButton);
      return null;
    }
    this.log.recovered(selectors.completeButton);
    return { element, kind: 'complete-pr' };
  }

  /** Le nom AFFICHÉ de l'utilisateur, seule identité que la page porte — la même que celle des
   * auteurs (`commentAuthor`), si bien que les deux se comparent. Vide dans une vue qui ne rend
   * aucun champ replié (Files sans fil, MESURÉ). */
  async getCurrentUser(): Promise<UserInfo> {
    return displayUser(queryChain(this.#doc, selectors.currentUser).element?.getAttribute('aria-label') ?? '');
  }

  /** Aucun vérificateur n'est livré pour Azure DevOps (§B.7) : aucune ligne cc/1 à lire. */
  readPublishedResult(): PublishedSummary | null {
    return null;
  }

  getRenderedComments(): { element: Element; bodyText: string }[] {
    return this.getRenderedCommentElements().map((element) => ({ element, bodyText: azdoBodyText(element) }));
  }

  /** Les corps des commentaires PUBLIÉS, cherchés dans chaque commentaire — jamais à l'échelle du
   * document, où `commentBody` attraperait aussi la description de la PR (03) —, plus les
   * APERÇUS en direct d'une composition (`previewBody`, §5.5). */
  getRenderedCommentElements(): Element[] {
    const published = queryChainAll(this.#doc, selectors.comment)
      .map((comment) => queryChain(comment, selectors.commentBody).element)
      .filter((el): el is Element => el !== null);
    return [...published, ...queryChainAll(this.#doc, selectors.previewBody)];
  }

  getBannerMount(): Element | null {
    return queryChain(this.#doc, selectors.bannerMount).element;
  }

  /** §5.5 — dans l'Overview, avant le fil d'activité (selectors.ts, `activityFeed`) : posé avant
   * le premier fil, il tombait dans la carte de ce fil. Dans Files, AUCUN filtre (`null`) : les
   * fils y sont intercalés dans le diff (même décision que GitLab, 2026-11-08). */
  getThreadFilterMount(): Element | null {
    if (this.#isFilesView()) return null;
    return queryChain(this.#doc, selectors.activityFeed).element;
  }

  /** Ce que le filtre MASQUE : dans l'Overview, la ligne du fil d'activité qui porte le fil —
   * carte et frise comprises —, ailleurs le fil lui-même (selectors.ts, `timelineRow`). Les
   * identifiants restent ceux de `getThreads()`. */
  getRenderedThreadElements(): { id: string; element: Element }[] {
    return this.#publishedThreads().map(({ id, element }) => ({
      id,
      element: closestChain(element, selectors.timelineRow).element ?? element,
    }));
  }

  currentPr(): PrRef | null {
    const loc = this.#doc.location;
    if (loc?.hostname !== PR_HOST) return null;
    const m = PR_PATH.exec(loc.pathname);
    if (!m) return null;
    // Lecture DOM seulement une fois la PR reconnue (§9.2.3) : hors PR, currentPr() ne coûte
    // qu'une expression régulière.
    const createdAt =
      queryChainAll(this.#doc, selectors.prCreatedAt)
        .find((el) => !closestChain(el, selectors.activityCard).element)
        ?.getAttribute('datetime') ?? '';
    if (createdAt) this.log.recovered(selectors.prCreatedAt);
    // Une date inconnue vaut mieux qu'une date fausse : l'extension ne bloque alors jamais. La
    // vue Files ne porte AUCUNE date de création (MESURÉ) : son absence n'y est pas une rupture.
    else if (!this.#isFilesView()) this.log.degraded(selectors.prCreatedAt);
    return {
      platform: 'azdo',
      createdAt,
      // `host` et non `hostname` : il porte le port d'une instance non standard.
      host: loc!.host,
      scope: [decodeURIComponent(m[1]!), decodeURIComponent(m[2]!), decodeURIComponent(m[3]!)],
      number: Number(m[4]),
    };
  }

  #isFilesView(): boolean {
    return new URLSearchParams(this.#doc.location?.search ?? '').get('_a') === 'files';
  }

  #toHandle(el: Element): EditorHandle | null {
    const pr = this.currentPr();
    if (!pr) return null;
    this.#editorSeq++;
    return { id: `azdo-editor-${this.#editorSeq}`, element: el, context: this.#contextOf(el, pr) };
  }

  /** Zone du champ (§4.1). Règle MESURÉE sur les éditeurs des captures (01, 02, 04, 05, 06, dans
   * les deux vues et les trois modes) :
   *   1. dans un commentaire publié → MODIFICATION de ce commentaire ;
   *   2. sinon, dans un fil qui a des commentaires → RÉPONSE ;
   *   3. sinon, nouveau fil : de LIGNE dans le diff de Files, GÉNÉRAL dans l'Overview. */
  #contextOf(el: Element, pr: PrRef): EditorContext {
    const thread = closestChain(el, selectors.thread).element;
    const comments = thread ? queryChainAll(thread, selectors.comment) : [];
    const threadId = thread ? this.#threadId(thread) : undefined;
    const edited = closestChain(el, selectors.comment).element;
    if (edited) {
      const n = this.#commentNumber(edited);
      const commentId = n && threadId ? `${threadId}/${n}` : undefined;
      // La RACINE d'un fil reste 'thread-root' (§4.1, §4.3) : la classer 'reply' la soustrairait
      // à la validation par défaut.
      return comments[0] === edited
        ? { zone: 'thread-root', action: 'edit', pr, threadId, commentId, canCarryBlockingState: true, inScope: true }
        : { zone: 'reply', action: 'edit', pr, threadId, commentId, canCarryBlockingState: false, inScope: true };
    }
    if (comments.length > 0) {
      return { zone: 'reply', action: 'compose', pr, threadId, canCarryBlockingState: false, inScope: true };
    }
    if (closestChain(el, selectors.diffDiscussion).element) {
      return { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true };
    }
    // Commentaire général : sur Azure DevOps, c'est un FIL, avec un état et un bouton *Resolve*
    // (03, les fils 1 à 4) — il porte donc un état bloquant, comme sur GitLab et contrairement à
    // GitHub.
    return { zone: 'conversation', action: 'compose', pr, canCarryBlockingState: true, inScope: true };
  }
}

function displayUser(name: string): UserInfo {
  return { id: `display:${name.toLowerCase()}`, login: name, isServiceAccount: false };
}

/** Le texte d'un corps rendu, sans le bouton *Copy to clipboard* qu'Azure DevOps pose DANS le
 * corps devant chaque bloc de code (selectors.ts, `codeCopyButton`) : son texte deviendrait la
 * ligne de préfixe d'un commentaire qui cite du code avant elle (§3.4.1). La page n'est pas
 * touchée : le bouton est retiré d'une copie. */
function azdoBodyText(body: Element): string {
  if (!queryChain(body, selectors.codeCopyButton).element) return commentBodyText(body);
  const clone = body.cloneNode(true) as Element;
  for (const button of queryChainAll(clone, selectors.codeCopyButton)) button.remove();
  return commentBodyText(clone);
}
