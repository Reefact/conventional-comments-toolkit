// Adaptateur client Azure DevOps (composant A, §9.2.3, annexe B).
// Deux points restent à établir par le spike P1' et sont traités par leurs replis
// normatifs en attendant :
// - le type réel de l'éditeur (§B.2) — la stratégie d'écriture commune du §9.3 est
//   employée, et la dégradation de sélecteur couvre l'échec de détection ;
// - la lecture du fichier de configuration sur la seule session (§B.4) — tentée via le
//   point d'API `items` avec les cookies de session ; en échec, `unreachable` et
//   l'extension est en état dégradé au sens du §5.4 : elle assiste sans bloquer.

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

export interface AzdoClientOptions {
  extraHosts?: string[];
  fetchImpl?: typeof fetch;
  documentRef?: Document;
  log?: SelectorLog;
}

export class AzdoClientAdapter implements PlatformAdapter {
  #hosts: string[];
  #fetch: typeof fetch;
  #doc: Document;
  readonly log: SelectorLog;
  #editorSeq = 0;
  /** Préfixe de chemin devant l'organisation/collection pour les routes d'API, établi par
   * currentPr() : '' sur dev.azure.com, '/DefaultCollection' éventuel sur
   * *.visualstudio.com, '/tfs' sur un Azure DevOps Server d'installation par défaut. */
  #apiPrefix = '';

  constructor(opts: AzdoClientOptions = {}) {
    this.#hosts = ['dev.azure.com', ...(opts.extraHosts ?? [])];
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#doc = opts.documentRef ?? document;
    this.log = opts.log ?? new SelectorLog();
  }

  /** Sélection de plateforme par hôte seul (§2) — même raison qu'en annexe A : Azure
   * DevOps étant entièrement SPA, la navigation vers une PR depuis les vues « Pull
   * requests » ou « Mes demandes » arrive après l'injection du script, jamais avant. */
  matchesHost(url: URL): boolean {
    const host = url.hostname;
    return this.#hosts.some((h) => host === h) || host.endsWith('.visualstudio.com');
  }

  matches(url: URL): boolean {
    return this.matchesHost(url) && /\/pullrequest\/\d+/i.test(url.pathname);
  }

  platformProfile(): PlatformProfile {
    // Pas d'étage 0 tant que l'info string du bloc de suggestion n'est pas établie
    // (§B.6) ; pas de commande slash native (§B.6).
    return { id: 'azdo', suggestionInfoString: null, slashPrefixes: [] };
  }

  /** §B.4 — pas de route de fichier brut : tentative sur le point d'API `items`, sur la
   * session de l'utilisateur. En échec, `unreachable` → état dégradé (§5.4).
   * Sur *.visualstudio.com, l'organisation vit dans le SOUS-DOMAINE : la répéter comme
   * segment de chemin produit une URL 404 — et un 404 sur une URL fausse se lirait
   * `absent`, jamais `unreachable` (§8.1.5). Sur Azure DevOps Server, le répertoire
   * virtuel (`/tfs`) précède la collection ; `#apiPrefix` vient de currentPr(). */
  async getRepoConfig(pr: PrRef): Promise<ConfigRead> {
    const [org, project, repo] = pr.scope;
    const base = pr.host.endsWith('.visualstudio.com')
      ? `https://${pr.host}${this.#apiPrefix}/${project}`
      : `https://${pr.host}${this.#apiPrefix}/${org}/${project}`;
    const url = `${base}/_apis/git/repositories/${repo}/items?path=${encodeURIComponent('/.conventional-comments.json')}&api-version=7.1`;
    try {
      const res = await this.#fetch(url, { credentials: 'include' });
      if (res.status === 404) return { status: 'absent' };
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      const text = await res.text();
      // Une page de connexion HTML signifierait que la session n'autorise pas cette
      // route : l'affirmer atteignable serait transformer une hypothèse en certitude.
      if (text.trimStart().startsWith('<')) return { status: 'unreachable', reason: 'session route not usable' };
      return { status: 'found', text };
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

  /** Pas d'équivalent de Turbo : MutationObserver sur le conteneur racine (§B.3). */
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
    return { dispose: () => observer.disconnect() };
  }

  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    // Chaîne centralisée, parcourue dans l'ordre (§9.4) : la génération héritée « vc- »
    // doit trouver son conteneur au même titre que « repos- » — sans quoi aucun bouton
    // n'est intercepté et le blocage du §5.4 est désarmé sur cette génération.
    const container =
      closestChain(editor.element, selectors.submitContainer).element ?? editor.element.parentElement;
    if (!container) return [];
    return queryChainAll(container, selectors.submitButtons).map((element) => {
      const label = (element.textContent ?? '').toLowerCase();
      return {
        element,
        // « Comment & resolve » combine publication et résolution : couvert aussi (§4.3).
        kind: label.includes('resolve') ? ('submit-and-resolve' as const) : ('submit' as const),
      };
    });
  }

  readValue(editor: EditorHandle): string {
    return (editor.element as HTMLTextAreaElement).value ?? '';
  }

  writeValue(editor: EditorHandle, text: string, caret?: number): void {
    writeToTextField(editor.element as HTMLTextAreaElement, text, caret); // §9.3
  }

  async getThreads(): Promise<ThreadInfo[]> {
    const pr = this.currentPr();
    if (!pr) return [];
    return queryChainAll(this.#doc, selectors.renderedThreads).map((el, i) => {
      const id = el.id || `dom-thread-${i}`;
      const statusText = queryChain(el, selectors.threadStatus).element?.textContent?.toLowerCase() ?? '';
      const resolution = /resolved|fixed|closed|won't fix|by design/.test(statusText)
        ? ('resolved' as const)
        : /active|pending/.test(statusText)
          ? ('unresolved' as const)
          : ('unknown' as const); // non rendu → unknown, compté non résolu (§5.5, §B.5)
      const body = queryChain(el, selectors.commentBody).element?.textContent ?? '';
      return {
        id,
        pr,
        root: {
          id: `${id}-root`,
          author: { id: 'dom-unknown', login: '', isServiceAccount: false },
          body,
          createdAt: '',
          permalink: `#${id}`,
          isSystemGenerated: false,
          canCarryBlockingState: true,
        },
        replies: [],
        resolution,
        canCarryBlockingState: true,
      };
    });
  }

  getCompletionControl(): SubmitControl | null {
    const { element } = queryChain(this.#doc, selectors.completeButton);
    if (!element) {
      this.log.degraded(selectors.completeButton);
      return null;
    }
    return { element, kind: 'complete-pr' };
  }

  async getCurrentUser(): Promise<UserInfo> {
    const { element } = queryChain(this.#doc, selectors.currentUser);
    const name = element?.getAttribute('alt') ?? '';
    return { id: `display:${name.toLowerCase()}`, login: name, isServiceAccount: false };
  }

  /** Ligne cc/1 dans la description d'un PR Status rendu sur la page (§B.7). */
  readPublishedResult(): PublishedSummary | null {
    for (const el of queryChainAll(this.#doc, selectors.statusDescriptions)) {
      const text = el.textContent ?? '';
      const idx = text.indexOf(SUMMARY_PREFIX + ' ');
      if (idx === -1) continue;
      const summary = decodeSummary(text.slice(idx).split('\n')[0]!.trim());
      if (summary) return summary;
    }
    return null;
  }

  /** Commentaires rendus sur la page, pour les badges du §5.5. */
  getRenderedComments(): { element: Element; bodyText: string }[] {
    return queryChainAll(this.#doc, selectors.commentBody).map((element) => ({
      element,
      bodyText: element.textContent ?? '',
    }));
  }

  /** Conteneurs de fils rendus, pour le filtre local du §5.5 — même dérivation
   * d'identifiant que getThreads(). */
  getRenderedThreadElements(): { id: string; element: Element }[] {
    return queryChainAll(this.#doc, selectors.renderedThreads).map((el, i) => ({
      id: el.id || `dom-thread-${i}`,
      element: el,
    }));
  }

  currentPr(): PrRef | null {
    const loc = this.#doc.location;
    if (!loc) return null;
    const path = loc.pathname;
    const { element } = queryChain(this.#doc, selectors.prCreatedAt);
    const createdAt = element?.getAttribute('datetime') ?? '';
    const mk = (scope: [string, string, string], number: string): PrRef => ({
      platform: 'azdo',
      createdAt,
      host: loc.hostname,
      scope,
      number: Number(number),
    });
    // Forme historique : {org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}
    // /pullrequest/{id} — l'organisation vit dans le SOUS-DOMAINE (§B.1) ; un segment de
    // collection peut précéder le projet, et la forme moderne ne doit JAMAIS s'y essayer :
    // elle prendrait la collection pour l'organisation.
    if (loc.hostname.endsWith('.visualstudio.com')) {
      const m = /^\/(DefaultCollection\/)?([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i.exec(path);
      if (m) {
        this.#apiPrefix = m[1] ? '/DefaultCollection' : '';
        return mk([loc.hostname.split('.')[0]!, m[2]!, m[3]!], m[4]!);
      }
      return null;
    }
    // Azure DevOps Server, installation par défaut (§B.1, hôte déclaré dans les options,
    // §B.4) : /tfs/{collection}/{project}/_git/{repo}/pullrequest/{id}.
    let m = /^\/tfs\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i.exec(path);
    if (m) {
      this.#apiPrefix = '/tfs';
      return mk([m[1]!, m[2]!, m[3]!], m[4]!);
    }
    // Forme moderne : dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
    m = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i.exec(path);
    if (m) {
      this.#apiPrefix = '';
      return mk([m[1]!, m[2]!, m[3]!], m[4]!);
    }
    return null;
  }

  #toHandle(el: Element): EditorHandle | null {
    const pr = this.currentPr();
    if (!pr) return null;
    this.#editorSeq++;
    // L'édition est un point de sortie au même titre que la création (§4.3) ; l'édition
    // d'une RACINE de fil reste zone 'thread-root' — la classer 'reply' la soustrairait
    // à la validation par défaut (§4.1). Chaînes parcourues dans l'ordre (§9.4), et la
    // chaîne editForm ne matche jamais un conteneur de composition (selectors.ts).
    const action: 'compose' | 'edit' = closestChain(el, selectors.editForm).element ? 'edit' : 'compose';
    const editedId =
      action === 'edit' ? closestChain(el, selectors.renderedComment).element?.id || undefined : undefined;
    const inThread = closestChain(el, selectors.threadContainer).element;
    let context: EditorContext;
    if (inThread) {
      let isRootEdit = false;
      if (action === 'edit') {
        // MÊME candidat pour la liste des commentaires du fil et pour l'ancêtre du champ
        // édité — deux stratégies divergentes reclasseraient une racine en réponse.
        let comments: Element[] = [];
        let editedComment: Element | null = null;
        for (const candidate of selectors.renderedComment.candidates) {
          const found = [...inThread.querySelectorAll(candidate)];
          if (found.length > 0) {
            comments = found;
            editedComment = el.closest(candidate);
            break;
          }
        }
        if (comments.length > 0 && editedComment === null) this.log.degraded(selectors.renderedComment); // §9.4
        isRootEdit = comments.length > 0 && editedComment === comments[0];
      }
      const threadId = inThread.id || editedId;
      context = isRootEdit
        ? { zone: 'thread-root', action, pr, threadId, commentId: editedId, canCarryBlockingState: true, inScope: true }
        : {
            zone: 'reply',
            action,
            pr,
            threadId,
            ...(action === 'edit' ? { commentId: editedId } : {}),
            canCarryBlockingState: false,
            inScope: true,
          };
    } else {
      // Hors fil : sur une édition, le commentaire édité est son propre fil (§9.2.3).
      const editIds = action === 'edit' ? { threadId: editedId, commentId: editedId } : {};
      context = { zone: 'thread-root', action, pr, ...editIds, canCarryBlockingState: true, inScope: true };
    }
    return { id: `azdo-editor-${this.#editorSeq}`, element: el, context };
  }
}
