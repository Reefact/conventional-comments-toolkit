// Adaptateur client GitHub (composant A, §9.2.3, annexe A). Aucun appel d'API à jeton
// (§10) : configuration lue par la route web `raw` sur la session de l'utilisateur
// (§A.4), fils et résultat publié lus dans le DOM de la page.

import {
  decodeSummary,
  SUMMARY_PREFIX,
  type ConfigRead,
  type Disposable,
  type PlatformProfile,
  type PrRef,
  type PublishedSummary,
  type ThreadInfo,
  type UserInfo,
} from '@cct/core';
import {
  queryChain,
  queryChainAll,
  writeToTextField,
  SelectorLog,
  type EditorContext,
  type EditorHandle,
  type PlatformAdapter,
  type SubmitControl,
} from '@cct/adapter-shared';
import { selectors } from './selectors.js';

export interface GithubClientOptions {
  /** Hôtes autorisés par l'utilisateur ou la politique (§2, §A.4) — github.com n'est que
   * le domaine pré-déclarable ; GHES et ghe.com passent par optional_host_permissions. */
  extraHosts?: string[];
  /** Fetch à employer pour la configuration — celui du contexte qui détient la
   * permission d'hôte (service worker de l'extension). */
  fetchImpl?: typeof fetch;
  documentRef?: Document;
  log?: SelectorLog;
}

export class GithubClientAdapter implements PlatformAdapter {
  #hosts: string[];
  #fetch: typeof fetch;
  #doc: Document;
  readonly log: SelectorLog;
  #editorSeq = 0;

  constructor(opts: GithubClientOptions = {}) {
    this.#hosts = ['github.com', ...(opts.extraHosts ?? [])];
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#doc = opts.documentRef ?? document;
    this.log = opts.log ?? new SelectorLog();
  }

  matches(url: URL): boolean {
    return this.#hosts.some((h) => url.hostname === h) && /\/pull\/\d+/.test(url.pathname);
  }

  platformProfile(): PlatformProfile {
    // Même profil que l'adaptateur serveur, même source (§9.2.4).
    return { id: 'github', suggestionInfoString: 'suggestion', slashPrefixes: ['/azp', '/rebase'] };
  }

  /** Route web `raw`, servie sur la session de l'utilisateur, sans jeton (§A.4) —
   * fonctionne sur les dépôts privés accessibles, ce que raw.githubusercontent.com ne
   * permettrait pas. */
  async getRepoConfig(pr: PrRef): Promise<ConfigRead> {
    const url = `https://${pr.host}/${pr.scope.join('/')}/raw/HEAD/.conventional-comments.json`;
    try {
      const res = await this.#fetch(url, { credentials: 'include' });
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  async getOrgConfig(url: string | null): Promise<ConfigRead> {
    if (url === null) return { status: 'absent' };
    try {
      const res = await this.#fetch(url, { credentials: 'include' });
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  /** Écoute Turbo ET MutationObserver : les vues React changent le DOM sans émettre
   * d'événement Turbo (§A.3). */
  observeEditors(cb: (editor: EditorHandle) => void): Disposable {
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of queryChainAll(this.#doc, selectors.editors)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const handle = this.#toHandle(el);
        if (handle) cb(handle);
      }
    };
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(this.#doc.documentElement, { childList: true, subtree: true });
    const turboHandler = () => scan();
    this.#doc.addEventListener('turbo:load', turboHandler);
    this.#doc.addEventListener('turbo:frame-load', turboHandler);
    return {
      dispose: () => {
        observer.disconnect();
        this.#doc.removeEventListener('turbo:load', turboHandler);
        this.#doc.removeEventListener('turbo:frame-load', turboHandler);
      },
    };
  }

  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    const form = editor.element.closest('form') ?? editor.element.parentElement;
    if (!form) return [];
    // Jamais de contrôle `complete-pr` ici : seul getCompletionControl() l'expose, et il
    // n'est jamais intercepté (§9.2.3).
    return queryChainAll(form, selectors.submitButtons).map((element) => ({
      element,
      kind: 'submit' as const,
    }));
  }

  readValue(editor: EditorHandle): string {
    return (editor.element as HTMLTextAreaElement).value ?? '';
  }

  writeValue(editor: EditorHandle, text: string, caret?: number): void {
    // Stratégie commune du §9.3 : setter natif + événement input — jamais `value = …`,
    // que les vues React absorbent (§A.2).
    writeToTextField(editor.element as HTMLTextAreaElement, text, caret);
  }

  /** Fils lus dans le DOM de la page uniquement — jamais d'appel d'API (§10, §9.2.3).
   * `resolution: 'unknown'` quand l'état n'y est pas rendu. */
  async getThreads(): Promise<ThreadInfo[]> {
    const pr = this.currentPr();
    if (!pr) return [];
    const containers = queryChainAll(this.#doc, selectors.renderedThreads);
    return containers.map((el, i) => {
      const id = el.id || el.getAttribute('data-thread-id') || `dom-thread-${i}`;
      const resolvedOutcome = queryChain(el, selectors.resolvedMarker);
      const bodyEl = queryChain(el, selectors.commentBody).element;
      const author = queryChain(el, selectors.commentAuthor).element?.textContent?.trim() ?? '';
      const anchor = el.querySelector('a[href*="#"]')?.getAttribute('href') ?? `#${id}`;
      return {
        id,
        pr,
        root: {
          id: `${id}-root`,
          author: { id: `login:${author.toLowerCase()}`, login: author, isServiceAccount: false },
          body: bodyEl?.textContent ?? '',
          createdAt: '',
          permalink: anchor,
          isSystemGenerated: false,
          canCarryBlockingState: true,
        },
        replies: [],
        resolution: resolvedOutcome.element ? ('resolved' as const) : ('unknown' as const),
        canCarryBlockingState: true,
      };
    });
  }

  getCompletionControl(): SubmitControl | null {
    const { element } = queryChain(this.#doc, selectors.mergeButton);
    if (!element) {
      this.log.degraded(selectors.mergeButton);
      return null;
    }
    return { element, kind: 'complete-pr' };
  }

  async getCurrentUser(): Promise<UserInfo> {
    const { element } = queryChain(this.#doc, selectors.currentUser);
    const login = element?.getAttribute('content') ?? '';
    return { id: `login:${login.toLowerCase()}`, login, isServiceAccount: false };
  }

  /** Ligne cc/1 lue dans le DOM — le titre du check run, rendu sur la page de la PR
   * (§6.3.1, §A.8). Jamais d'appel d'API (§8.1.3, §10). */
  readPublishedResult(): PublishedSummary | null {
    for (const el of queryChainAll(this.#doc, selectors.checkRunTitles)) {
      const text = el.textContent ?? '';
      const idx = text.indexOf(SUMMARY_PREFIX + ' ');
      if (idx === -1) continue;
      const line = text.slice(idx).split('\n')[0]!.trim();
      const summary = decodeSummary(line);
      if (summary) return summary;
    }
    return null;
  }

  /** Commentaires rendus sur la page, pour les badges du §5.5 — surface d'affichage,
   * hors du contrat normatif §9.2.3. */
  getRenderedComments(): { element: Element; bodyText: string }[] {
    return queryChainAll(this.#doc, selectors.commentBody).map((element) => ({
      element,
      bodyText: element.textContent ?? '',
    }));
  }

  /** PrRef depuis l'URL et la page — la date de création est lisible dans le DOM (§6.2.3). */
  currentPr(): PrRef | null {
    const loc = this.#doc.location;
    const m = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(loc?.pathname ?? '');
    if (!m) return null;
    const { element } = queryChain(this.#doc, selectors.prCreatedAt);
    const createdAt = element?.getAttribute('datetime') ?? '';
    return {
      platform: 'github',
      createdAt,
      host: loc!.hostname,
      scope: [m[1]!, m[2]!],
      number: Number(m[3]),
    };
  }

  #toHandle(el: Element): EditorHandle | null {
    const pr = this.currentPr();
    if (!pr) return null;
    const context = this.#contextOf(el, pr);
    this.#editorSeq++;
    return { id: `gh-editor-${this.#editorSeq}`, element: el, context };
  }

  /** Zone de l'éditeur (§4.1) : réponse dans un fil, corps de revue, conversation
   * générale, ou racine de fil (diff). */
  #contextOf(el: Element, pr: PrRef): EditorContext {
    const action: 'compose' | 'edit' = el.closest(selectors.editForm.candidates.join(', '))
      ? 'edit'
      : 'compose';
    const thread = el.closest(selectors.threadContainer.candidates.join(', '));
    if (thread) {
      // L'ÉDITION du commentaire RACINE d'un fil reste zone 'thread-root' (§4.1, §4.3) :
      // la classer 'reply' la soustrairait à la validation par défaut et à la monotonie.
      if (action === 'edit') {
        const comments = queryChainAll(thread, selectors.renderedComment);
        const editedComment = el.closest(selectors.renderedComment.candidates.join(', '));
        const isRootEdit = comments.length > 0 && editedComment === comments[0];
        if (isRootEdit) {
          return {
            zone: 'thread-root',
            action,
            pr,
            threadId: thread.id || undefined,
            canCarryBlockingState: true,
            inScope: true,
          };
        }
      }
      return {
        zone: 'reply',
        action,
        pr,
        threadId: thread.id || undefined,
        canCarryBlockingState: false,
        inScope: true, // recalculé par l'extension avec activatedAt (§6.2.3)
      };
    }
    if (el.closest(selectors.reviewSummaryForm.candidates.join(', '))) {
      return { zone: 'review-body', action, pr, canCarryBlockingState: false, inScope: true };
    }
    if (el.closest(selectors.conversationForm.candidates.join(', '))) {
      return { zone: 'conversation', action, pr, canCarryBlockingState: false, inScope: true };
    }
    // Commentaire inline sur une ligne de diff, ou racine de fil : porte un état de
    // résolution (§4.1).
    return { zone: 'thread-root', action, pr, canCarryBlockingState: true, inScope: true };
  }
}
