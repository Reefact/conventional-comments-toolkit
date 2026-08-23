// @vitest-environment happy-dom
// Non-régression des RÉSIDUS confirmés par le rejeu des refutes (workflow
// wf_341acd57-803) : ce que les corrections de la première revue n'avaient pas couvert.

import { describe, expect, it } from 'vitest';
import { SelectorLog, type EditorHandle } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { applyLabelFilter } from '../src/ui/banner.js';
import { mergeDirectShortcuts, writeDegradedState } from '../src/content-internal.js';

function setLocation(url: string): void {
  Object.defineProperty(document, 'location', { value: new URL(url), configurable: true });
}

function collectEditors(adapter: GithubClientAdapter | AzdoClientAdapter): EditorHandle[] {
  const handles: EditorHandle[] = [];
  const d = adapter.observeEditors((h) => handles.push(h));
  d.dispose();
  return handles;
}

describe('résidu C — §5.2 : les raccourcis directs sont réellement configurables (§8.1.2)', () => {
  it('mergeDirectShortcuts : surcharge, extension, désactivation, jamais le prototype', () => {
    const merged = mergeDirectShortcuts({
      'alt+i': 'praise', // surcharge, casse normalisée
      'Alt+X': 'todo', // extension
      'Alt+S': '', // désactivation du défaut
      constructor: 'evil', // clé hors format → ignorée
      'Ctrl+I': 'issue', // pas un raccourci Alt → ignoré
    });
    expect(merged['Alt+I']).toBe('praise');
    expect(merged['Alt+X']).toBe('todo');
    expect('Alt+S' in merged).toBe(false);
    expect(merged['Alt+T']).toBe('todo'); // défaut conservé
    expect(Object.hasOwn(merged, 'constructor')).toBe(false);
  });

  it('sans préférence stockée : la table par défaut, copiée sans prototype', () => {
    const merged = mergeDirectShortcuts(null);
    expect(merged['Alt+I']).toBe('issue');
    expect(Object.getPrototypeOf(merged)).toBeNull();
  });
});

describe('résidu B — §9.2.3 : l’état dégradé se signale dans les OPTIONS aussi', () => {
  it('writeDegradedState écrit la clé que la page d’options lit (degradedState)', () => {
    const writes: Record<string, unknown>[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: { set: (items: Record<string, unknown>) => writes.push(items) } },
    };
    writeDegradedState(true);
    writeDegradedState(false);
    delete (globalThis as { chrome?: unknown }).chrome;
    expect(writes).toEqual([{ degradedState: 'unreachable' }, { degradedState: false }]);
  });
});

describe('résidu D — §5.5 : le filtre par label agit sur les fils RENDUS, pas les seules ancres', () => {
  it('applyLabelFilter masque ancres ET fils, et null rétablit tout', () => {
    const banner = document.createElement('div');
    banner.innerHTML =
      '<ul><li data-thread-id="t1"></li><li data-thread-id="t2"></li></ul>';
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    const rendered = [
      { id: 't1', element: el1 },
      { id: 't2', element: el2 },
    ];
    const labels = new Map<string, string | null>([
      ['t1', 'issue'],
      ['t2', 'nitpick'],
    ]);

    applyLabelFilter(banner, rendered, labels, 'nitpick');
    const anchors = [...banner.querySelectorAll('li')] as HTMLElement[];
    expect(anchors[0]!.style.display).toBe('none');
    expect(anchors[1]!.style.display).toBe('');
    expect(el1.style.display).toBe('none'); // le fil rendu non apparié est masqué
    expect(el2.style.display).toBe('');

    applyLabelFilter(banner, rendered, labels, null);
    expect(anchors[0]!.style.display).toBe('');
    expect(el1.style.display).toBe('');
  });

  it('getRenderedThreadElements (GitHub) : mêmes identifiants que getThreads', async () => {
    setLocation('https://github.com/acme/demo/pull/42');
    document.body.innerHTML = `
      <div class="js-resolvable-timeline-thread-container" id="th-1"><div class="comment-body">issue: a</div></div>
      <div class="js-resolvable-timeline-thread-container"><div class="comment-body">nitpick: b</div></div>`;
    const adapter = new GithubClientAdapter({ documentRef: document });
    const threads = await adapter.getThreads();
    const rendered = adapter.getRenderedThreadElements();
    expect(rendered.map((r) => r.id)).toEqual(threads.map((t) => t.id));
  });
});

describe('résidu E — GitHub : ancre de fil centralisée (§9.4) et commentId/threadId (§9.2.3)', () => {
  it('l’ancre vient de la chaîne threadAnchor — un lien d’avatar ne la vole pas', async () => {
    setLocation('https://github.com/acme/demo/pull/42');
    document.body.innerHTML = `
      <div class="js-resolvable-timeline-thread-container" id="th-1">
        <a href="/acme/demo/pull/42#issuecomment-avatar-noise">avatar</a>
        <a data-testid="permalink" href="#discussion_r200">permalien</a>
        <div class="comment-body">issue: a</div>
      </div>`;
    const adapter = new GithubClientAdapter({ documentRef: document });
    const threads = await adapter.getThreads();
    expect(threads[0]!.root.permalink).toBe('#discussion_r200');
  });

  it('aucune ancre : repli #id ET dégradation journalisée (§9.4)', async () => {
    setLocation('https://github.com/acme/demo/pull/42');
    document.body.innerHTML = `
      <div class="js-resolvable-timeline-thread-container" id="th-2">
        <div class="comment-body">issue: a</div>
      </div>`;
    const log = new SelectorLog();
    const adapter = new GithubClientAdapter({ documentRef: document, log });
    const threads = await adapter.getThreads();
    expect(threads[0]!.root.permalink).toBe('#th-2');
    expect(log.failures.some((f) => f.chain === 'thread-anchor')).toBe(true);
  });

  it('édition de la RACINE d’un fil : thread-root, commentId et threadId renseignés', () => {
    setLocation('https://github.com/acme/demo/pull/42');
    document.body.innerHTML = `
      <div class="js-resolvable-timeline-thread-container" id="thread-1">
        <div class="review-comment" id="discussion_r100">
          <div class="js-comment-edit-form"><textarea name="comment[body]"></textarea></div>
        </div>
        <div class="review-comment" id="discussion_r101"></div>
      </div>`;
    const adapter = new GithubClientAdapter({ documentRef: document });
    const [handle] = collectEditors(adapter);
    expect(handle!.context).toMatchObject({
      zone: 'thread-root',
      action: 'edit',
      threadId: 'thread-1',
      commentId: 'discussion_r100',
      canCarryBlockingState: true,
    });
  });

  it('édition d’un commentaire de conversation : threadId et commentId portent son identifiant', () => {
    setLocation('https://github.com/acme/demo/pull/42');
    document.body.innerHTML = `
      <form id="new_comment_form">
        <div class="js-comment" id="issuecomment-55">
          <div class="js-comment-edit-form"><textarea name="comment[body]"></textarea></div>
        </div>
      </form>`;
    const adapter = new GithubClientAdapter({ documentRef: document });
    const [handle] = collectEditors(adapter);
    expect(handle!.context).toMatchObject({
      zone: 'conversation',
      action: 'edit',
      threadId: 'issuecomment-55',
      commentId: 'issuecomment-55',
    });
  });

  it('éditeur d’édition hors de tout commentaire reconnu : dégradation journalisée, repli reply', () => {
    setLocation('https://github.com/acme/demo/pull/42');
    document.body.innerHTML = `
      <div class="js-resolvable-timeline-thread-container" id="thread-3">
        <div class="review-comment" id="discussion_r300"></div>
        <div class="stray"><div class="js-comment-edit-form"><textarea name="comment[body]"></textarea></div></div>
      </div>`;
    const log = new SelectorLog();
    const adapter = new GithubClientAdapter({ documentRef: document, log });
    const [handle] = collectEditors(adapter);
    expect(handle!.context.zone).toBe('reply'); // désactivation locale, jamais silencieuse
    expect(log.failures.some((f) => f.chain === 'rendered-comment')).toBe(true);
  });
});

describe('résidu F — AzDO : détection d’édition sans collision, URLs historiques et on-premise', () => {
  it('composer dans .repos-discussion-comment-editor est une COMPOSITION (« comment-edit » ne matche plus « comment-editor »)', () => {
    setLocation('https://dev.azure.com/org/proj/_git/repo/pullrequest/7');
    document.body.innerHTML = `
      <div class="repos-discussion-comment-editor"><textarea class="comment-textarea"></textarea></div>`;
    const adapter = new AzdoClientAdapter({ documentRef: document });
    const [handle] = collectEditors(adapter);
    expect(handle!.context.action).toBe('compose');
  });

  it('une RÉPONSE composée dans le conteneur du premier commentaire reste zone reply (§4.1)', () => {
    setLocation('https://dev.azure.com/org/proj/_git/repo/pullrequest/7');
    document.body.innerHTML = `
      <div class="repos-discussion-thread" id="t2">
        <div class="repos-discussion-comment" id="c3">
          <div class="repos-discussion-comment-editor"><textarea class="comment-textarea"></textarea></div>
        </div>
      </div>`;
    const adapter = new AzdoClientAdapter({ documentRef: document });
    const [handle] = collectEditors(adapter);
    expect(handle!.context).toMatchObject({ zone: 'reply', action: 'compose', canCarryBlockingState: false });
  });

  it('édition de la racine : thread-root, commentId/threadId renseignés (§9.2.3)', () => {
    setLocation('https://dev.azure.com/org/proj/_git/repo/pullrequest/7');
    document.body.innerHTML = `
      <div class="repos-discussion-thread" id="t1">
        <div class="repos-discussion-comment" id="c1">
          <div class="repos-discussion-comment--editing"><textarea class="comment-textarea"></textarea></div>
        </div>
        <div class="repos-discussion-comment" id="c2"></div>
      </div>`;
    const adapter = new AzdoClientAdapter({ documentRef: document });
    const [handle] = collectEditors(adapter);
    expect(handle!.context).toMatchObject({
      zone: 'thread-root',
      action: 'edit',
      threadId: 't1',
      commentId: 'c1',
      canCarryBlockingState: true,
    });
  });

  it('génération héritée vc- : le conteneur d’envoi est trouvé, le blocage §5.4 reste armé', () => {
    setLocation('https://dev.azure.com/org/proj/_git/repo/pullrequest/7');
    document.body.innerHTML = `
      <div class="vc-discussion-comment-editor">
        <div class="inner"><textarea aria-label="Comment"></textarea></div>
        <div class="btns"><button class="bolt-button primary">Comment</button></div>
      </div>`;
    const adapter = new AzdoClientAdapter({ documentRef: document });
    const [handle] = collectEditors(adapter);
    expect(adapter.getSubmitControls(handle!)).toHaveLength(1);
  });

  it('*.visualstudio.com : l’organisation vit dans le sous-domaine, jamais répétée dans l’URL d’API (§B.1, §B.4)', async () => {
    setLocation('https://myorg.visualstudio.com/MyProject/_git/MyRepo/pullrequest/123');
    document.body.innerHTML = '';
    const urls: string[] = [];
    const adapter = new AzdoClientAdapter({
      documentRef: document,
      fetchImpl: (async (url: string | URL | Request) => {
        urls.push(String(url));
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    const pr = adapter.currentPr()!;
    expect(pr.scope).toEqual(['myorg', 'MyProject', 'MyRepo']);
    await adapter.getRepoConfig(pr);
    expect(urls[0]).toBe(
      'https://myorg.visualstudio.com/MyProject/_apis/git/repositories/MyRepo/items?path=%2F.conventional-comments.json&api-version=7.1'
    );
  });

  it('*.visualstudio.com avec DefaultCollection : la collection n’est pas prise pour l’organisation', async () => {
    setLocation('https://myorg.visualstudio.com/DefaultCollection/MyProject/_git/MyRepo/pullrequest/9');
    document.body.innerHTML = '';
    const urls: string[] = [];
    const adapter = new AzdoClientAdapter({
      documentRef: document,
      fetchImpl: (async (url: string | URL | Request) => {
        urls.push(String(url));
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    const pr = adapter.currentPr()!;
    expect(pr.scope).toEqual(['myorg', 'MyProject', 'MyRepo']);
    await adapter.getRepoConfig(pr);
    expect(urls[0]).toContain('https://myorg.visualstudio.com/DefaultCollection/MyProject/_apis/');
  });

  it('Azure DevOps Server (/tfs/…) : l’adaptateur n’est plus inerte sur la forme on-premise (§B.1, §B.4)', async () => {
    setLocation('https://tfs.example.corp/tfs/DefaultCollection/Proj/_git/Repo/pullrequest/5');
    document.body.innerHTML = '';
    const urls: string[] = [];
    const adapter = new AzdoClientAdapter({
      documentRef: document,
      extraHosts: ['tfs.example.corp'],
      fetchImpl: (async (url: string | URL | Request) => {
        urls.push(String(url));
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    expect(adapter.matches(new URL('https://tfs.example.corp/tfs/DefaultCollection/Proj/_git/Repo/pullrequest/5'))).toBe(true);
    const pr = adapter.currentPr()!;
    expect(pr.scope).toEqual(['DefaultCollection', 'Proj', 'Repo']);
    await adapter.getRepoConfig(pr);
    expect(urls[0]).toContain('https://tfs.example.corp/tfs/DefaultCollection/Proj/_apis/git/repositories/Repo/items');
  });
});
