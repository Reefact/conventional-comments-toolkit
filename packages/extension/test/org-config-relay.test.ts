// @vitest-environment happy-dom
// Non-régression : la configuration d'ORGANISATION (`configUrl`, §8.1.1) était lue par un
// `fetch` émis depuis le script de contenu. Ce contexte n'a pas les privilèges qu'on lui
// prêtait : « Content scripts initiate requests on behalf of the web origin that the
// content script has been injected into and therefore content scripts are also subject to
// the same origin policy » (doc Chrome, « Cross-origin network requests »). La permission
// d'hôte accordée pour l'hôte du `configUrl` — que la page d'options sait demander, et que
// `docs/store-permissions-justification-fr.md` justifie — n'y changeait RIEN : un document
// d'organisation hébergé hors de la plateforme affichée restait illisible, l'extension
// résolvait deux niveaux là où le serveur en résout trois, et son état dégradé (§5.4)
// était permanent — avec, en prime, une empreinte de configuration durablement divergente
// qui désarme le blocage d'envoi (§8.1.3, règle 2).
//
// Le relais du service worker existait déjà (`cct-fetch-config`) mais AUCUN appelant ne
// l'employait. Les tests sont rangés par contexte d'exécution, comme extra-hosts.test.ts,
// parce que c'est la frontière que le défaut traversait :
// A. adaptateurs — la lecture d'organisation est déléguée, celle du dépôt ne l'est pas ;
// B. script de contenu — le client du relais et ses réponses hostiles ;
// C. câblage de bootstrap() — le relais atteint effectivement le constructeur ;
// D. service worker — le gestionnaire, et le contrôle de l'URL qu'on lui soumet.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { EXTRA_HOSTS_KEY } from '../src/host-platform.js';

const ORG_URL = 'https://interne.example/cc/organisation.json';

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('A — les adaptateurs délèguent la lecture d’ORGANISATION, jamais celle du dépôt', () => {
  function neverCalledFetch(): typeof fetch {
    return (async () => {
      throw new Error('fetch direct : c’est précisément ce que le relais doit remplacer');
    }) as unknown as typeof fetch;
  }

  it('GithubClientAdapter.getOrgConfig() passe par readOrgConfig et n’émet aucun fetch', async () => {
    const seen: string[] = [];
    const adapter = new GithubClientAdapter({
      fetchImpl: neverCalledFetch(),
      readOrgConfig: async (url) => {
        seen.push(url);
        return { status: 'found', text: '{"mode":"advisory"}' };
      },
    });
    expect(await adapter.getOrgConfig(ORG_URL)).toEqual({
      status: 'found',
      text: '{"mode":"advisory"}',
    });
    expect(seen).toEqual([ORG_URL]);
  });

  it('AzdoClientAdapter.getOrgConfig() de même', async () => {
    const seen: string[] = [];
    const adapter = new AzdoClientAdapter({
      fetchImpl: neverCalledFetch(),
      readOrgConfig: async (url) => {
        seen.push(url);
        return { status: 'absent' };
      },
    });
    expect(await adapter.getOrgConfig(ORG_URL)).toEqual({ status: 'absent' });
    expect(seen).toEqual([ORG_URL]);
  });

  // Le pendant, tout aussi important : le fichier de DÉPÔT vit sur l'origine de la page
  // affichée. Le lire directement est correct et ne coûte aucune permission ; le relayer
  // exigerait au contraire une permission d'hôte sur github.com que le manifeste ne
  // déclare plus (PR #28). Un relais trop zélé casserait donc le cas nominal.
  it('getRepoConfig() n’emprunte JAMAIS le relais, même quand il est fourni', async () => {
    const relayed: string[] = [];
    const fetched: string[] = [];
    const adapter = new GithubClientAdapter({
      fetchImpl: (async (url: string) => {
        fetched.push(String(url));
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
      readOrgConfig: async (url) => {
        relayed.push(url);
        return { status: 'absent' };
      },
    });
    await adapter.getRepoConfig({ host: 'github.com', scope: ['acme', 'demo'], id: '1' });
    expect(relayed).toEqual([]);
    expect(fetched).toEqual([
      'https://github.com/acme/demo/raw/HEAD/.conventional-comments.json',
    ]);
  });

  // Hors extension (composant serveur, tests) il n'y a pas de relais : le `fetch` direct
  // reste le comportement correct là où l'origine appelante a le droit de lire.
  it('sans readOrgConfig, la lecture directe subsiste', async () => {
    const fetched: string[] = [];
    const adapter = new GithubClientAdapter({
      fetchImpl: (async (url: string) => {
        fetched.push(String(url));
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(await adapter.getOrgConfig(ORG_URL)).toEqual({ status: 'found', text: '{}' });
    expect(fetched).toEqual([ORG_URL]);
  });
});

describe('B — le client du relais, dans le contexte d’un SCRIPT DE CONTENU', () => {
  /** Ce que Chrome expose à un script de contenu : `runtime` et `storage`, jamais
   * `permissions`. `sendMessage` est ici sous sa forme À RAPPEL. */
  function installCallbackRelay(reply: unknown, lastError: { message?: string } | null = null) {
    const sent: unknown[] = [];
    const lastErrorReads: number[] = [];
    let reads = 0;
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: (msg: unknown, cb?: (response: unknown) => void) => {
          sent.push(msg);
          cb?.(reply);
          return undefined;
        },
        get lastError() {
          lastErrorReads.push(++reads);
          return lastError;
        },
      },
      storage: { local: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}) } },
    };
    return { sent, lastErrorReads };
  }

  it('émet `cct-fetch-config` avec l’URL et rend la réponse du worker (forme à rappel)', async () => {
    const { sent } = installCallbackRelay({ status: 'found', text: '{"mode":"blocking"}' });
    const { relayOrgConfigRead } = await import('../src/content-internal.js');
    expect(await relayOrgConfigRead(ORG_URL)).toEqual({
      status: 'found',
      text: '{"mode":"blocking"}',
    });
    expect(sent).toEqual([{ kind: 'cct-fetch-config', url: ORG_URL }]);
  });

  it('accepte aussi la forme PROMESSE — les deux coexistent selon le navigateur', async () => {
    const sent: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        // Ne rappelle JAMAIS le callback : c'est le contrat de la forme promesse, et un
        // faux qui rappellerait quand même laisserait passer un code qui n’attend que
        // celle-ci.
        sendMessage: (msg: unknown) => {
          sent.push(msg);
          return Promise.resolve({ status: 'absent' });
        },
      },
    };
    const { relayOrgConfigRead } = await import('../src/content-internal.js');
    expect(await relayOrgConfigRead(ORG_URL)).toEqual({ status: 'absent' });
    expect(sent).toHaveLength(1);
  });

  // `unreachable` et jamais `absent` : `absent` affirmerait qu'aucun document
  // d'organisation n'existe — le §8.1.5 ferait alors résoudre la configuration SANS ce
  // niveau, sans état dégradé, donc sans que rien ne se voie (§5.4).
  it('une réponse absente (worker endormi, message perdu) vaut unreachable, pas absent', async () => {
    const { lastErrorReads } = installCallbackRelay(undefined, { message: 'no receiver' });
    const { relayOrgConfigRead } = await import('../src/content-internal.js');
    const read = await relayOrgConfigRead(ORG_URL);
    expect(read.status).toBe('unreachable');
    // `lastError` doit être LU : c'est sa lecture qui l'acquitte, sans quoi Chrome
    // journalise un « Unchecked runtime.lastError » à chaque résolution de configuration.
    expect(lastErrorReads.length).toBeGreaterThan(0);
  });

  it('une réponse malformée vaut unreachable', async () => {
    installCallbackRelay({ status: 'trouvé', text: 42 });
    const { relayOrgConfigRead } = await import('../src/content-internal.js');
    expect((await relayOrgConfigRead(ORG_URL)).status).toBe('unreachable');
  });

  it('un sendMessage qui lève vaut unreachable, jamais une exception qui remonte', async () => {
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: () => {
          throw new Error('Extension context invalidated.');
        },
      },
    };
    const { relayOrgConfigRead } = await import('../src/content-internal.js');
    expect((await relayOrgConfigRead(ORG_URL)).status).toBe('unreachable');
  });
});

describe('C — bootstrap() met le relais entre les mains de l’adaptateur', () => {
  const split = { github: ['ghes.example.corp'], azdo: [] };

  function mockGithubAdapter(ctorArgs: unknown[]): void {
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        constructor(opts: unknown) {
          ctorArgs.push(opts);
          Object.assign(this, {
            async getCurrentUser() {
              return { login: 'someone' };
            },
            async getRepoConfig() {
              return { status: 'absent' };
            },
            async getOrgConfig() {
              return { status: 'absent' };
            },
            observeEditors() {
              return { dispose: () => {} };
            },
            currentPr() {
              return null;
            },
            readPublishedResult() {
              return null;
            },
          });
        }
      },
    }));
  }

  it('le constructeur reçoit un readOrgConfig qui parle bien au service worker', async () => {
    const sent: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: (msg: unknown, cb?: (r: unknown) => void) => {
          sent.push(msg);
          cb?.({ status: 'found', text: '{}' });
          return undefined;
        },
        lastError: null,
      },
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) =>
            cb({ [EXTRA_HOSTS_KEY]: split }),
        },
      },
    };
    const ctorArgs: unknown[] = [];
    mockGithubAdapter(ctorArgs);
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);

    const opts = ctorArgs[0] as { readOrgConfig?: (url: string) => Promise<unknown> };
    expect(typeof opts.readOrgConfig).toBe('function');
    // Le passer ne suffit pas : c'est de bout en bout qu'il doit atteindre le worker.
    expect(await opts.readOrgConfig!(ORG_URL)).toEqual({ status: 'found', text: '{}' });
    expect(sent).toEqual([{ kind: 'cct-fetch-config', url: ORG_URL }]);

    vi.doUnmock('@cct/adapter-github');
  });

  it('hors contexte d’extension, AUCUN relais n’est imposé — la lecture directe reste possible', async () => {
    const ctorArgs: unknown[] = [];
    mockGithubAdapter(ctorArgs);
    // Pas de `chrome` du tout : `bootstrap()` doit malgré tout aboutir. `chrome` étant un
    // `declare const`, la simple mention de l'identifiant lève une ReferenceError hors
    // extension — une garde `?.` ne suffit pas, il faut un `try`.
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);
    const opts = ctorArgs[0] as { readOrgConfig?: unknown };
    expect(opts.readOrgConfig).toBeUndefined();

    vi.doUnmock('@cct/adapter-github');
  });
});

describe('D — le gestionnaire du SERVICE WORKER, seul contexte qui a le droit de lire', () => {
  type Listener = (
    message: unknown,
    sender: unknown,
    sendResponse: (response: unknown) => void
  ) => boolean | void;

  function installServiceWorkerChrome(managed: Record<string, unknown>): { listener(): Listener } {
    let captured: Listener | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        onMessage: { addListener: (cb: Listener) => (captured = cb) },
        lastError: null,
        openOptionsPage: vi.fn(),
      },
      action: { onClicked: { addListener: vi.fn() } },
      permissions: {
        getAll: (cb: (p: { origins: string[] }) => void) => cb({ origins: [] }),
        onAdded: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      scripting: {
        registerContentScripts: vi.fn((_s: unknown, cb: () => void) => cb()),
        unregisterContentScripts: vi.fn((_f: unknown, cb: () => void) => cb()),
      },
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}),
          set: (_i: Record<string, unknown>, cb?: () => void) => cb?.(),
        },
        managed: { get: (cb: (i: Record<string, unknown>) => void) => cb(managed) },
        onChanged: { addListener: vi.fn() },
      },
    };
    return {
      listener: () => {
        if (!captured) throw new Error('aucun gestionnaire onMessage enregistré');
        return captured;
      },
    };
  }

  async function ask(listener: Listener, url: string): Promise<unknown> {
    return new Promise((resolve) => {
      const kept = listener({ kind: 'cct-fetch-config', url }, {}, resolve);
      // Sans ce `true`, Chrome referme le canal avant la réponse asynchrone et l'appelant
      // ne reçoit jamais rien : c'est une affirmation sur le protocole, pas un détail.
      expect(kept).toBe(true);
    });
  }

  it('lit le configUrl du plancher et rend son contenu', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return new Response('{"mode":"advisory"}', { status: 200 });
    });
    const sw = installServiceWorkerChrome({ floor: { configUrl: ORG_URL } });
    await import('../src/background.js');
    expect(await ask(sw.listener(), ORG_URL)).toEqual({
      status: 'found',
      text: '{"mode":"advisory"}',
    });
    expect(calls).toEqual([ORG_URL]);
  });

  it('404 vaut absent, une autre erreur HTTP vaut unreachable (§8.1.5)', async () => {
    let status = 404;
    vi.stubGlobal('fetch', async () => new Response('', { status }));
    const sw = installServiceWorkerChrome({ floor: { configUrl: ORG_URL } });
    await import('../src/background.js');
    expect(await ask(sw.listener(), ORG_URL)).toEqual({ status: 'absent' });
    status = 503;
    expect(await ask(sw.listener(), ORG_URL)).toEqual({
      status: 'unreachable',
      reason: 'HTTP 503',
    });
  });

  // La doc Chrome conseille de ne pas laisser un script de contenu désigner la cible d'une
  // requête privilégiée. `configUrl` ne vient QUE du canal de plancher (§8.1.1) : le worker
  // dérive donc la cible lui-même. Sans ce contrôle, un script de contenu injecté sur un
  // hôte accordé emprunterait le worker comme relais authentifié vers tout autre hôte
  // accordé.
  it('une URL que le plancher ne désigne pas n’est PAS lue', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return new Response('{}', { status: 200 });
    });
    const sw = installServiceWorkerChrome({ floor: { configUrl: ORG_URL } });
    await import('../src/background.js');
    const read = (await ask(sw.listener(), 'https://ailleurs.example/vole.json')) as {
      status: string;
    };
    expect(read.status).toBe('unreachable');
    expect(calls).toEqual([]);
  });

  it('sans politique d’entreprise, il n’y a aucun configUrl à lire', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return new Response('{}', { status: 200 });
    });
    const sw = installServiceWorkerChrome({});
    await import('../src/background.js');
    expect(((await ask(sw.listener(), ORG_URL)) as { status: string }).status).toBe('unreachable');
    expect(calls).toEqual([]);
  });

  // §8.1.5 : un plancher de version non supportée ne désigne aucun document d'organisation.
  // Le worker doit donc VÉRIFIER le plancher, pas y lire `configUrl` à cru — sinon les deux
  // composants ne suivraient pas la même règle sur le même document.
  it('un plancher de version non supportée ne désigne aucun configUrl', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return new Response('{}', { status: 200 });
    });
    const sw = installServiceWorkerChrome({ floor: { floorVersion: 99, configUrl: ORG_URL } });
    await import('../src/background.js');
    expect(((await ask(sw.listener(), ORG_URL)) as { status: string }).status).toBe('unreachable');
    expect(calls).toEqual([]);
  });
});
