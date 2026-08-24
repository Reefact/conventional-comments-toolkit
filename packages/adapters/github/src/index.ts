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
  closestChain,
  commentBodyText,
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

// Handles de robot dont l'interpellation exempte (§4.2, §A.7) — liste fermée, portée par
// l'adaptateur, jamais par la configuration d'un dépôt. Même liste que côté serveur (§9.2.4).
export const GITHUB_COMMAND_PREFIXES = [
  '@dependabot',
  '@copilot',
  '@coderabbitai',
  '@codex',
  '@claude',
  '@mergifyio',
  '@renovate',
  '@rustbot',
  '@bors',
];

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

  /** Sélection de plateforme par hôte seul (§2) — `bootstrap()` choisit l'adaptateur à
   * l'injection du script, avant même de savoir si la page courante est une PR : la
   * navigation vers une PR arrive presque toujours ENSUITE, via un lien interne (liste des
   * PR, notifications, tableau de bord), en SPA (§A.3). Exiger une PR ici laisserait
   * l'extension intégralement inactive tant qu'un rechargement complet ne la relance pas
   * directement sur l'URL de la PR. */
  matchesHost(url: URL): boolean {
    return this.#hosts.some((h) => url.hostname === h);
  }

  matches(url: URL): boolean {
    return this.matchesHost(url) && /\/pull\/\d+/.test(url.pathname);
  }

  platformProfile(): PlatformProfile {
    // Même profil que l'adaptateur serveur, même source (§9.2.4).
    return {
      id: 'github',
      suggestionInfoString: 'suggestion',
      slashCommands: true,
      commandPrefixes: GITHUB_COMMAND_PREFIXES,
    };
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
        // Marquer « vu » APRÈS #toHandle() : un élément balayé avant que currentPr() ne
        // trouve de PR (page pas encore navigée) doit rester réexaminable au prochain
        // balayage, pas définitivement ignoré (§9.2.3).
        const handle = this.#toHandle(el);
        if (!handle) continue;
        seen.add(el);
        cb(handle);
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
    const form = closestChain(editor.element, selectors.submitContainer).element ?? editor.element.parentElement;
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
      const anchorOutcome = queryChain(el, selectors.threadAnchor);
      if (!anchorOutcome.element) this.log.degraded(selectors.threadAnchor); // §9.4
      const anchor = anchorOutcome.element?.getAttribute('href') ?? `#${id}`;
      return {
        id,
        pr,
        root: {
          id: `${id}-root`,
          author: { id: `login:${author.toLowerCase()}`, login: author, isServiceAccount: false },
          body: bodyEl ? commentBodyText(bodyEl) : '',
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
      bodyText: commentBodyText(element),
    }));
  }

  /** Sonde bon marché du nombre de commentaires rendus, pour la signature de reprise du
   * bandeau (content-internal.ts, chromeSignatureOf) — jamais `getRenderedComments()` pour
   * ça : cette dernière calcule `commentBodyText` (clone du sous-arbre dès qu'un badge est
   * posé) pour CHAQUE commentaire, alors que seul le compte importe à un observateur qui
   * tourne à chaque mutation, pour toute la durée de vie de l'onglet. */
  getRenderedCommentCount(): number {
    return queryChainAll(this.#doc, selectors.commentBody).length;
  }

  /** Conteneurs de fils rendus, pour le filtre local du §5.5 — même dérivation
   * d'identifiant que getThreads(), même surface d'affichage hors contrat. */
  getRenderedThreadElements(): { id: string; element: Element }[] {
    return queryChainAll(this.#doc, selectors.renderedThreads).map((el, i) => ({
      id: el.id || el.getAttribute('data-thread-id') || `dom-thread-${i}`,
      element: el,
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
   * générale, ou racine de fil (diff). Sur une édition, `commentId` et `threadId` sont
   * renseignés (§9.2.3 : commentId « renseigné pour 'edit' », threadId « pour toute
   * action: 'edit' »). */
  #contextOf(el: Element, pr: PrRef): EditorContext {
    const action: 'compose' | 'edit' = closestChain(el, selectors.editForm).element ? 'edit' : 'compose';
    // Identifiant du commentaire édité, lu dans le DOM (#issuecomment-…, #discussion_r…).
    const editedId =
      action === 'edit' ? closestChain(el, selectors.renderedComment).element?.id || undefined : undefined;
    const thread = closestChain(el, selectors.threadContainer).element;
    if (thread) {
      // L'ÉDITION du commentaire RACINE d'un fil reste zone 'thread-root' (§4.1, §4.3) :
      // la classer 'reply' la soustrairait à la validation par défaut et à la monotonie.
      if (action === 'edit') {
        // MÊME candidat pour la liste des commentaires et pour l'ancêtre du champ édité :
        // deux stratégies divergentes (premier candidat qui matche contre union des
        // candidats) peuvent désigner des générations différentes et reclasseraient
        // silencieusement une racine en réponse.
        let comments: Element[] = [];
        let editedComment: Element | null = null;
        for (const candidate of selectors.renderedComment.candidates) {
          const found = [...thread.querySelectorAll(candidate)];
          if (found.length > 0) {
            comments = found;
            editedComment = el.closest(candidate);
            break;
          }
        }
        if (comments.length > 0 && editedComment === null) {
          // Le fil rend des commentaires mais l'éditeur n'est dans aucun : dégradation de
          // sélecteur, journalisée (§9.4) — le repli 'reply' désactive la validation
          // localement, jamais silencieusement.
          this.log.degraded(selectors.renderedComment);
        }
        const isRootEdit = comments.length > 0 && editedComment === comments[0];
        if (isRootEdit) {
          return {
            zone: 'thread-root',
            action,
            pr,
            threadId: thread.id || editedId,
            commentId: editedId,
            canCarryBlockingState: true,
            inScope: true,
          };
        }
        return {
          zone: 'reply',
          action,
          pr,
          threadId: thread.id || editedId,
          commentId: editedId,
          canCarryBlockingState: false,
          inScope: true,
        };
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
    // Hors conteneur de fil : sur une édition, le commentaire édité est son propre fil —
    // threadId et commentId portent son identifiant (§9.2.3).
    const editIds = action === 'edit' ? { threadId: editedId, commentId: editedId } : {};
    if (closestChain(el, selectors.reviewSummaryForm).element) {
      return { zone: 'review-body', action, pr, ...editIds, canCarryBlockingState: false, inScope: true };
    }
    if (closestChain(el, selectors.conversationForm).element) {
      return { zone: 'conversation', action, pr, ...editIds, canCarryBlockingState: false, inScope: true };
    }
    // Commentaire inline sur une ligne de diff, ou racine de fil : porte un état de
    // résolution (§4.1).
    return { zone: 'thread-root', action, pr, ...editIds, canCarryBlockingState: true, inScope: true };
  }
}
