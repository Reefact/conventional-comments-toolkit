// Adaptateur client GitLab (composant A, §9.2.3, annexe C).
//
// Tout ce qu'il lit vient des chaînes de selectors.ts, MESURÉES sur des captures de gitlab.com.
// Ce que les captures n'ont pas établi prend la réponse prudente du contrat, écrite à l'endroit
// où elle s'applique :
// - l'éditeur de texte enrichi n'est pas observé (§C.2) : ni lecture ni écriture tant que la
//   façon d'y écrire n'est pas mesurée ;
// - la lecture du fichier de configuration du dépôt n'est pas mesurée (§C.4) : `unreachable`,
//   et l'extension est en état dégradé au sens du §5.4 — elle assiste sans bloquer ;
// - pas d'étage 0 : le marqueur du bloc de suggestion n'est pas fixé pour GitLab (§C.6).

import type {
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
  matchesChain,
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

/** La forme du corps rendu de GitLab (§5.5). MESURÉE le 2026-11-08 :
 *   - paragraphe : `<p>` — corps publiés des captures (03-overview-commentaires-discussion) ;
 *   - fin de ligne SIMPLE dans un paragraphe : PAS de `<br>` — le `<p>` garde un retour à la ligne
 *     DANS son nœud de texte, que la page affiche comme une espace. Mesuré sur un commentaire
 *     publié (« suggestion: sujet de test » suivi d'une ligne collée, !1) et par l'API de rendu
 *     Markdown de GitLab (`POST /api/v4/markdown`), qui rend la même structure ;
 *   - saut de ligne FORCÉ (deux espaces ou `\` en fin de ligne) : `<br>` — même API.
 * D'où `lineBreakTag: 'BR'` : il borne le sujet sur un saut forcé, et la fin de ligne simple est
 * bornée par le code partagé, qui coupe aussi le sujet sur un retour à la ligne littéral d'un nœud
 * de texte (`subjectNodes`, extension/src/ui/badges.ts). Une première version rendait `null` faute
 * de cette mesure : le préfixe restait affiché sous un badge seul (validation du propriétaire). */
const GITLAB_BODY_SHAPE: RenderedBodyShape = Object.freeze({ paragraphTags: ['P'], lineBreakTag: 'BR' });

/** Chemin d'une merge request : `/<groupe>[/<sous-groupe>…]/<projet>/-/merge_requests/<n>`, suivi
 * de `/diffs` sur l'onglet Changes (URLs des captures). Le groupe peut être imbriqué : tout ce qui
 * précède le projet est l'espace de noms. */
const MR_PATH = /^\/(.+)\/([^/]+)\/-\/merge_requests\/(\d+)(\/diffs)?\/?$/;

export class GitlabClientAdapter implements PlatformAdapter {
  #fetch: typeof fetch;
  #doc: Document;
  #readOrgConfig?: (url: string) => Promise<ConfigRead> | null;
  readonly log: SelectorLog;
  #guardEntry: EntryGuard;
  #editorSeq = 0;

  constructor(opts: ClientAdapterOptions = {}) {
    this.#fetch = adapterFetch(opts.fetchImpl);
    this.#doc = opts.documentRef ?? document;
    this.#readOrgConfig = opts.readOrgConfig;
    this.log = opts.log ?? new SelectorLog();
    this.#guardEntry = opts.guardEntry ?? ((fn) => fn);
  }

  platformProfile(): PlatformProfile {
    // Pas d'étage 0 : le marqueur GitLab porte une plage de lignes (`suggestion:-0+0`), que la
    // détection de core/ ne reconnaît pas, et la spec ne l'a pas encore fixé (§C.6).
    return { id: 'gitlab', suggestionInfoString: null };
  }

  /** §C.4 — non mesurée. Une route de fichier brut existe peut-être ; ce qu'elle fait depuis un
   * script de contenu (redirection, CORS, cookies) n'a pas été mesuré, et le dépôt a appris ce
   * que coûte une lecture supposée (`check:content-script-cors`). D'ici là : `unreachable`, donc
   * état dégradé — l'extension assiste sans bloquer (§5.4). */
  async getRepoConfig(_pr: PrRef): Promise<ConfigRead> {
    return { status: 'unreachable', reason: 'GitLab repository config read not measured yet (spec §C.4)' };
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

  /** Vues dynamiques : `MutationObserver` sur la racine (§C.3), comme sur Azure DevOps. Seules les
   * <textarea> sont observées ; l'éditeur de texte enrichi ne l'est pas (§C.2, en tête). */
  observeEditors(cb: (editor: EditorHandle) => void): Disposable {
    const seen = new WeakSet<Element>();
    const scan = this.#guardEntry(() => {
      for (const el of queryChainAll(this.#doc, selectors.editors)) {
        if (seen.has(el)) continue;
        // Marqué « vu » APRÈS #toHandle() : un champ balayé avant que la page ne désigne une
        // merge request reste réexaminable au balayage suivant (§9.2.3).
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
   * partagé applique ses règles géométriques — comme pour Azure DevOps. */
  getEditorChrome(_editor: EditorHandle): EditorChrome {
    return NEUTRAL_EDITOR_CHROME;
  }

  /** §5.5 — la forme MESURÉE du corps rendu de GitLab, `GITLAB_BODY_SHAPE` ci-dessous. */
  renderedBodyShape(): RenderedBodyShape {
    return GITLAB_BODY_SHAPE;
  }

  /** Les boutons d'envoi du FORMULAIRE de l'éditeur — y compris « … and close merge request »,
   * qui publie le commentaire quand le champ en porte un. Champ vide, il ne fait que fermer : la
   * validation l'exempte alors (corps vide, §4.2), et il n'est pas bloqué. Jamais un bouton qui
   * annule (`cancelButtons`), jamais le bouton de fusion. */
  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    const form = editor.element.closest('form');
    if (!form) return [];
    const controls = [
      ...queryChainAll(form, selectors.submitButtons),
      ...queryChainAll(form, selectors.closeReopenButton),
    ];
    return controls.map((element) => ({ element, kind: 'submit' as const }));
  }

  readValue(editor: EditorHandle): string {
    return (editor.element as HTMLTextAreaElement).value ?? '';
  }

  writeValue(editor: EditorHandle, text: string, caret?: number): void {
    writeToTextField(editor.element as HTMLTextAreaElement, text, caret); // §9.3
  }

  /** Fils lus dans le DOM uniquement (§9.2.3, §10). L'état : `resolved` sur la marque de
   * résolution, `unresolved` sur celle d'un fil ouvert, `unknown` sinon. En Rapid Diffs, un fil
   * résolu n'est pas dans le DOM (§C.5) : il n'est pas rendu ici du tout, ce qui ne le compte
   * pas pour résolu. */
  async getThreads(): Promise<ThreadInfo[]> {
    const pr = this.currentPr();
    if (!pr) return [];
    return queryChainAll(this.#doc, selectors.thread).map((el, i) => {
      const id = this.#threadId(el) ?? `dom-thread-${i}`;
      const root = queryChain(el, selectors.noteContainer).element;
      const bodyEl = root ? queryChain(root, selectors.commentBody).element : null;
      const login = (root ? queryChain(root, selectors.commentAuthor).element : null)?.getAttribute('data-username') ?? '';
      return {
        id,
        pr,
        root: {
          id,
          author: { id: `login:${login.toLowerCase()}`, login, isServiceAccount: false },
          // Un fil résolu de l'Overview est REPLIÉ sans ses notes (§C.5) : corps vide, ce qui
          // n'est pas une rupture — la page ne l'a pas rendu.
          body: bodyEl ? commentBodyText(bodyEl) : '',
          createdAt: '',
          permalink: `#${id}`,
          isSystemGenerated: false,
          canCarryBlockingState: true,
        },
        replies: [],
        resolution: this.#resolution(el),
        canCarryBlockingState: true,
      };
    });
  }

  #resolution(thread: Element): ThreadInfo['resolution'] {
    if (matchesChain(thread, selectors.threadResolved).element) return 'resolved';
    if (matchesChain(thread, selectors.threadUnresolved).element) return 'unresolved';
    return 'unknown';
  }

  /** Identifiant d'un fil : celui de sa PREMIÈRE note (`note_<id>`), lu sur le lien d'horodatage
   * quand il existe (seul porteur dans un fil résolu replié), sur la première note sinon (Rapid
   * Diffs). L'identifiant natif du fil n'est pas lisible dans les captures (selectors.ts). */
  #threadId(thread: Element): string | undefined {
    const href = queryChain(thread, selectors.threadAnchor).element?.getAttribute('href');
    const fromAnchor = href?.split('#')[1];
    if (fromAnchor) return fromAnchor;
    return queryChain(thread, selectors.noteContainer).element?.id || undefined;
  }

  getCompletionControl(): SubmitControl | null {
    const { element } = queryChain(this.#doc, selectors.mergeButton);
    if (!element) {
      // Absent sur l'onglet Changes et sur une merge request fermée : c'est la norme mesurée,
      // pas une rupture (selectors.ts, `mergeButton`). Partout ailleurs, la chaîne est journalisée.
      const onChanges = MR_PATH.exec(this.#doc.location?.pathname ?? '')?.[4] !== undefined;
      if (!onChanges && !queryChain(this.#doc, selectors.prSettledState).element) {
        this.log.degraded(selectors.mergeButton);
      }
      return null;
    }
    this.log.recovered(selectors.mergeButton);
    return { element, kind: 'complete-pr' };
  }

  /** Le nom se lit sur le chemin du lien du menu utilisateur (`href="/<username>"`). */
  async getCurrentUser(): Promise<UserInfo> {
    const href = queryChain(this.#doc, selectors.currentUser).element?.getAttribute('href') ?? '';
    const login = href.replace(/^\//, '').split('/')[0] ?? '';
    return { id: `login:${login.toLowerCase()}`, login, isServiceAccount: false };
  }

  /** Aucun vérificateur n'est livré pour GitLab (§C.7) : aucune ligne cc/1 à lire. */
  readPublishedResult(): PublishedSummary | null {
    return null;
  }

  /** Corps des commentaires publiés, cherchés DANS chaque conteneur de note — jamais à l'échelle
   * du document, où `commentBody` attraperait aussi la description de la merge request et les
   * porteurs d'aperçu vides — plus les aperçus réellement affichés (§5.5). */
  getRenderedComments(): { element: Element; bodyText: string }[] {
    return this.getRenderedCommentElements().map((element) => ({ element, bodyText: commentBodyText(element) }));
  }

  getRenderedCommentElements(): Element[] {
    const published = queryChainAll(this.#doc, selectors.noteContainer)
      .map((note) => queryChain(note, selectors.commentBody).element)
      .filter((el): el is Element => el !== null);
    // Le porteur d'aperçu existe, VIDE, dans tout formulaire (selectors.ts, `previewBody`) : seul
    // un aperçu qui a un contenu est un corps rendu.
    const previews = queryChainAll(this.#doc, selectors.previewBody).filter(
      (el) => (el.textContent ?? '').trim().length > 0
    );
    return [...published, ...previews];
  }

  getBannerMount(): Element | null {
    return queryChain(this.#doc, selectors.bannerMount).element;
  }

  getRenderedThreadElements(): { id: string; element: Element }[] {
    return queryChainAll(this.#doc, selectors.thread).map((element, i) => ({
      id: this.#threadId(element) ?? `dom-thread-${i}`,
      element,
    }));
  }

  currentPr(): PrRef | null {
    const loc = this.#doc.location;
    const m = MR_PATH.exec(loc?.pathname ?? '');
    if (!m) return null;
    // Lecture DOM seulement une fois la merge request reconnue (§9.2.3) : hors merge request,
    // currentPr() ne coûte qu'une expression régulière.
    const createdAt = queryChain(this.#doc, selectors.prCreatedAt).element?.getAttribute('datetime') ?? '';
    if (createdAt) this.log.recovered(selectors.prCreatedAt);
    // Une date inconnue vaut mieux qu'une date fausse : l'extension ne bloque alors jamais.
    else this.log.degraded(selectors.prCreatedAt);
    return {
      platform: 'gitlab',
      createdAt,
      // `host` et non `hostname` : il porte le port d'une instance non standard.
      host: loc!.host,
      scope: [m[1]!, m[2]!],
      number: Number(m[3]),
    };
  }

  #toHandle(el: Element): EditorHandle | null {
    const pr = this.currentPr();
    if (!pr) return null;
    this.#editorSeq++;
    return { id: `gitlab-editor-${this.#editorSeq}`, element: el, context: this.#contextOf(el, pr) };
  }

  /** Zone du champ (§4.1). Le champ ne la dit pas — un même `reply-field` sert la réponse, le
   * nouveau fil de ligne et la modification. La règle MESURÉE (selectors.ts, `replyWrapper`) :
   * réponse d'abord, puis modification, sinon nouveau fil — dans CET ordre. */
  #contextOf(el: Element, pr: PrRef): EditorContext {
    if (closestChain(el, selectors.reviewDrawer).element) {
      return { zone: 'review-body', action: 'compose', pr, canCarryBlockingState: false, inScope: true };
    }
    if (closestChain(el, selectors.conversationForm).element) {
      // Un commentaire général de GitLab peut être publié comme FIL résoluble (« Start thread »,
      // §C.6) : qu'il puisse alors porter un état bloquant est à trancher dans la spec. D'ici là,
      // la réponse de GitHub — la conversation ne porte pas d'état bloquant.
      return { zone: 'conversation', action: 'compose', pr, canCarryBlockingState: false, inScope: true };
    }
    const thread = closestChain(el, selectors.thread).element;
    const threadId = thread ? this.#threadId(thread) : undefined;
    if (closestChain(el, selectors.replyWrapper).element) {
      return { zone: 'reply', action: 'compose', pr, threadId, canCarryBlockingState: false, inScope: true };
    }
    const note = closestChain(el, selectors.noteContainer).element;
    if (note) {
      // Modification. La RACINE d'un fil reste 'thread-root' (§4.1, §4.3) : la classer 'reply'
      // la soustrairait à la validation par défaut.
      const commentId = note.id || undefined;
      const isRoot = thread !== null && queryChain(thread, selectors.noteContainer).element === note;
      return isRoot
        ? { zone: 'thread-root', action: 'edit', pr, threadId: threadId ?? commentId, commentId, canCarryBlockingState: true, inScope: true }
        : { zone: 'reply', action: 'edit', pr, threadId: threadId ?? commentId, commentId, canCarryBlockingState: false, inScope: true };
    }
    // Nouveau fil sur une ligne de diff : porte un état de résolution (§4.1).
    return { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true };
  }
}
