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

  constructor(opts: AzdoClientOptions = {}) {
    this.#hosts = ['dev.azure.com', ...(opts.extraHosts ?? [])];
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#doc = opts.documentRef ?? document;
    this.log = opts.log ?? new SelectorLog();
  }

  matches(url: URL): boolean {
    const host = url.hostname;
    const known = this.#hosts.some((h) => host === h) || host.endsWith('.visualstudio.com');
    return known && /\/pullrequest\/\d+/i.test(url.pathname);
  }

  platformProfile(): PlatformProfile {
    // Pas d'étage 0 tant que l'info string du bloc de suggestion n'est pas établie
    // (§B.6) ; pas de commande slash native (§B.6).
    return { id: 'azdo', suggestionInfoString: null, slashPrefixes: [] };
  }

  /** §B.4 — pas de route de fichier brut : tentative sur le point d'API `items`, sur la
   * session de l'utilisateur. En échec, `unreachable` → état dégradé (§5.4). */
  async getRepoConfig(pr: PrRef): Promise<ConfigRead> {
    const [org, project, repo] = pr.scope;
    const url = `https://${pr.host}/${org}/${project}/_apis/git/repositories/${repo}/items?path=${encodeURIComponent('/.conventional-comments.json')}&api-version=7.1`;
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
        seen.add(el);
        const handle = this.#toHandle(el);
        if (handle) cb(handle);
      }
    };
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(this.#doc.documentElement, { childList: true, subtree: true });
    return { dispose: () => observer.disconnect() };
  }

  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    const container = editor.element.closest('.repos-discussion-comment-editor, form') ?? editor.element.parentElement;
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
      const body = el.querySelector('.markdown-content, .comment-content')?.textContent ?? '';
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

  currentPr(): PrRef | null {
    const loc = this.#doc.location;
    // dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
    const m = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i.exec(loc?.pathname ?? '');
    if (!m) return null;
    const { element } = queryChain(this.#doc, selectors.prCreatedAt);
    const createdAt = element?.getAttribute('datetime') ?? '';
    return {
      platform: 'azdo',
      createdAt,
      host: loc!.hostname,
      scope: [m[1]!, m[2]!, m[3]!],
      number: Number(m[4]),
    };
  }

  #toHandle(el: Element): EditorHandle | null {
    const pr = this.currentPr();
    if (!pr) return null;
    this.#editorSeq++;
    const inThread = el.closest(selectors.threadContainer.candidates.join(', '));
    const context: EditorContext = inThread
      ? {
          zone: 'reply',
          action: 'compose',
          pr,
          threadId: inThread.id || undefined,
          canCarryBlockingState: false,
          inScope: true,
        }
      : { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true };
    return { id: `azdo-editor-${this.#editorSeq}`, element: el, context };
  }
}
