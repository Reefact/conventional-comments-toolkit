// @vitest-environment happy-dom
// Une TROISIÈME plateforme, qui n'existe pas — « acme » —, et c'est tout l'objet : le contrat du
// §9.2.3 doit suffire à ce que le noyau rende barre, pastille, bandeau, filtre et badges sur un
// DOM qu'aucun code partagé n'a jamais vu, sans qu'un seul `if (plateforme)` ni un seul cast
// n'intervienne. Ce faux est TYPÉ (`npm run typecheck:tests`, tsconfig.test.json), contrairement
// au reste de la suite que vitest transpile sans vérifier : si un membre manquait à
// `AcmeClientAdapter`, il ne compilerait pas — c'est la preuve que le contrat est complet, et
// `contract-completeness.types.ts` l'établit membre par membre.
//
// Deux entrées du noyau, SANS `bootstrap()` : `EditorController.attach()` pour la zone de
// saisie, `observePrChromeNavigation()` pour le chrome de PR — celles que les tests GitHub
// emploient déjà. `bootstrap()` n'activerait pas « acme » : il ne sert que les plateformes du
// registre, et ce test n'en a pas besoin pour établir ce qu'il établit.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultConfig,
  type ConfigRead,
  type Disposable,
  type PlatformProfile,
  type PrRef,
  type PublishedSummary,
  type ThreadInfo,
  type UserInfo,
} from '@cct/core';
import {
  commentBodyText,
  NEUTRAL_EDITOR_CHROME,
  writeToTextField,
  type ClientAdapterOptions,
  type EditorChrome,
  type EditorHandle,
  type PlatformAdapter,
  type RenderedBodyShape,
  type SubmitControl,
} from '@cct/adapter-shared';
import { ClientConfigResolver } from '../src/config-resolver.js';
import { EditorController } from '../src/editor-controller.js';
import { observePrChromeNavigation } from '../src/content-internal.js';

/** La page d'une PR « acme » : un en-tête, deux fils (l'un bloquant et ouvert, l'autre résolu),
 * un composeur et un bouton de complétion. Aucun nom n'y vient de GitHub ni d'Azure DevOps. */
const PAGE = `
  <header id="acme-header">PR #7</header>
  <main>
    <article class="acme-thread" id="th-1" data-status="open">
      <div class="acme-body"><p>issue (blocking): le nom est ambigu</p><p>Détail.</p></div>
    </article>
    <article class="acme-thread" id="th-2" data-status="resolved">
      <div class="acme-body"><p>praise: joli découpage</p></div>
    </article>
    <section class="acme-composer">
      <textarea class="acme-field" id="acme-field"></textarea>
      <button type="button" class="acme-send">Envoyer</button>
    </section>
    <button type="button" id="acme-complete">Fusionner</button>
  </main>`;

function acmePr(): PrRef {
  return { platform: 'acme', createdAt: '2026-01-01T00:00:00Z', host: 'acme.example', scope: ['proj', 'repo'], number: 7 };
}

/** Résumé publié par un vérificateur « acme » : un fil bloquant non résolu, PR en échec. */
const PUBLISHED: PublishedSummary = {
  state: 'failure',
  isDraft: false,
  exempted: false,
  mode: 'enforce',
  coreVersion: '1.0.0',
  configFingerprint: 'deadbeef',
  activatedAt: null,
  unresolvedBlockingCount: 1,
  nonCompliantCommentCount: 0,
  warningCount: 0,
};

/** Un adaptateur COMPLET au sens du contrat, et rien de plus. `implements` est vérifié par le
 * compilateur (tsconfig.test.json) : retirer un membre ici fait échouer `typecheck:tests`. */
class AcmeClientAdapter implements PlatformAdapter {
  readonly #doc: Document;
  #seq = 0;

  constructor(opts: ClientAdapterOptions = {}) {
    this.#doc = opts.documentRef ?? document;
  }

  currentPr(): PrRef | null {
    return this.#doc.getElementById('acme-header') ? acmePr() : null;
  }

  platformProfile(): PlatformProfile {
    return { id: 'acme', suggestionInfoString: null };
  }

  async getRepoConfig(): Promise<ConfigRead> {
    return { status: 'absent' };
  }

  async getOrgConfig(): Promise<ConfigRead> {
    return { status: 'absent' };
  }

  observeEditors(cb: (editor: EditorHandle) => void): Disposable {
    for (const el of this.#doc.querySelectorAll('textarea.acme-field')) cb(this.#handle(el));
    return { dispose: () => {} };
  }

  getEditorChrome(): EditorChrome {
    return NEUTRAL_EDITOR_CHROME;
  }

  /** Jamais mesurée : pas de masquage de préfixe, les badges restent (§5.5). */
  renderedBodyShape(): RenderedBodyShape | null {
    return null;
  }

  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    const button = editor.element.parentElement?.querySelector('button.acme-send');
    return button ? [{ element: button, kind: 'submit' }] : [];
  }

  readValue(editor: EditorHandle): string {
    return (editor.element as HTMLTextAreaElement).value;
  }

  writeValue(editor: EditorHandle, text: string, caret?: number): void {
    writeToTextField(editor.element as HTMLTextAreaElement, text, caret);
  }

  async getThreads(): Promise<ThreadInfo[]> {
    const pr = this.currentPr();
    if (!pr) return [];
    return [...this.#doc.querySelectorAll('article.acme-thread')].map((el) => ({
      id: el.id,
      pr,
      root: {
        id: `${el.id}-root`,
        author: { id: 'login:bob', login: 'bob', isServiceAccount: false },
        body: commentBodyText(el.querySelector('.acme-body')!),
        createdAt: '2026-01-02T00:00:00Z',
        permalink: `#${el.id}`,
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: el.getAttribute('data-status') === 'resolved' ? 'resolved' : 'unresolved',
      canCarryBlockingState: true,
    }));
  }

  getCompletionControl(): SubmitControl | null {
    const element = this.#doc.getElementById('acme-complete');
    return element ? { element, kind: 'complete-pr' } : null;
  }

  async getCurrentUser(): Promise<UserInfo> {
    return { id: 'login:alice', login: 'alice', isServiceAccount: false };
  }

  readPublishedResult(): PublishedSummary | null {
    return PUBLISHED;
  }

  getBannerMount(): Element | null {
    return this.#doc.getElementById('acme-header');
  }

  getRenderedThreadElements(): { id: string; element: Element }[] {
    return [...this.#doc.querySelectorAll('article.acme-thread')].map((element) => ({ id: element.id, element }));
  }

  getRenderedComments(): { element: Element; bodyText: string }[] {
    return this.getRenderedCommentElements().map((element) => ({ element, bodyText: commentBodyText(element) }));
  }

  getRenderedCommentElements(): Element[] {
    return [...this.#doc.querySelectorAll('.acme-body')];
  }

  #handle(element: Element): EditorHandle {
    this.#seq++;
    return {
      id: `acme-editor-${this.#seq}`,
      element,
      context: { zone: 'thread-root', action: 'compose', pr: acmePr(), canCarryBlockingState: true, inScope: true },
    };
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushAll(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await flush();
}

const openObservations: (() => void)[] = [];

beforeEach(() => {
  document.body.innerHTML = PAGE;
  // Le stockage local n'est consulté que pour des conforts (pliage du bandeau, journal) : un
  // `chrome` minimal suffit, comme dans pr-chrome-navigation.test.ts.
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { local: { get: (_keys: string[], cb: (items: Record<string, unknown>) => void) => cb({}) } },
  };
});

afterEach(() => {
  for (const dispose of openObservations.splice(0)) dispose();
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.innerHTML = '';
});

describe('une troisième plateforme, « acme », par le seul contrat du §9.2.3', () => {
  it('la zone de saisie reçoit la barre et la pastille, et un clic pose le préfixe (§5.1, §5.3)', () => {
    const adapter = new AcmeClientAdapter({ documentRef: document });
    const editors: EditorHandle[] = [];
    adapter.observeEditors((editor) => editors.push(editor)).dispose();
    expect(editors).toHaveLength(1);

    const config = defaultConfig();
    new EditorController({
      adapter,
      editor: editors[0]!,
      resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false, degradedReason: null },
      published: null,
      lang: 'fr',
      currentUserLogin: 'alice',
    }).attach();

    const field = document.getElementById('acme-field') as HTMLTextAreaElement;
    const toolbar = document.querySelector('.cct-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.parentElement).toBe(field.parentElement); // parent direct : la règle qui ne nomme personne
    expect(document.querySelector('.cct-feedback')).not.toBeNull();

    (toolbar!.querySelector('button.cct-label-button[data-label="issue"]') as HTMLButtonElement).click();
    expect(field.value.startsWith('issue')).toBe(true);
  });

  it('le chrome de PR se rend entier : bandeau en tête, filtre avant le premier fil, badges, grisage (§5.5, §6.5)', async () => {
    const adapter = new AcmeClientAdapter({ documentRef: document });
    openObservations.push(observePrChromeNavigation(adapter, new ClientConfigResolver(async () => null), document));
    await flushAll();

    const banner = document.querySelector('.cct-banner');
    expect(banner).not.toBeNull();
    expect(banner!.previousElementSibling).toBe(document.getElementById('acme-header'));

    const filter = document.querySelector('.cct-thread-filter');
    expect(filter).not.toBeNull();
    expect(document.getElementById('th-1')!.previousElementSibling).toBe(filter);

    const bodies = document.querySelectorAll('.acme-body');
    expect(bodies[0]!.querySelector('.cct-badge')).not.toBeNull();
    expect(bodies[1]!.querySelector('.cct-badge')).not.toBeNull();
    // Forme non mesurée (`null`) : les badges sont posés, le préfixe n'est PAS masqué.
    expect(document.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(commentBodyText(bodies[0]!)).toContain('issue (blocking): le nom est ambigu');

    expect(document.getElementById('acme-complete')!.getAttribute('aria-disabled')).toBe('true');
  });
});
