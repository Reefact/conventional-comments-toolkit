// @vitest-environment happy-dom
// Non-régression : `bootstrap()` (§2) choisissait toujours GithubClientAdapter/
// AzdoClientAdapter avec leurs seuls hôtes par défaut (github.com, dev.azure.com), même
// après qu'un domaine GitHub Enterprise Server ou Azure DevOps Server auto-hébergé ait
// été accordé via `optional_host_permissions` : `extraHosts` n'était jamais transmis au
// constructeur. La permission accordée injectait bien le script de contenu
// (`registerContentScriptForOrigin`, background.test.ts) mais aucun adaptateur ne
// reconnaissait ensuite l'hôte — aucune interface n'apparaissait.
//
// LA CONTRAINTE QUI FAÇONNE TOUTE L'ARCHITECTURE : `chrome.permissions` n'est pas exposé
// aux scripts de contenu. Une première version croisait origines et étiquettes dans
// `content-internal.ts` — qui est bundlé dans `content.js` : l'objet y étant simplement
// absent, la répartition y aurait TOUJOURS été vide, sans erreur ni test rouge (revue
// Codex, PR #29). Le calcul vit donc dans `background.ts` (service worker), qui publie
// son résultat dans `chrome.storage.local` sous `EXTRA_HOSTS_KEY` ; le script de contenu
// se contente de le lire. Les tests ci-dessous sont séparés par contexte d'exécution,
// pour que cette frontière reste visible.
//
// Trois niveaux, chacun avait un trou de couverture avant ce fichier :
// A. Les adaptateurs eux-mêmes n'avaient JAMAIS de test sur `extraHosts` — ni GitHub ni
//    AzDO, alors que le paramètre existe depuis leur création.
// B. La répartition (service worker) et sa lecture (script de contenu).
// C. Le câblage dans `bootstrap()` (l'appel effectivement fait, avec le bon résultat,
//    aux deux constructeurs) n'était vérifié nulle part.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { hostMatchesAny, hostMatchesPattern } from '@cct/adapter-shared';
import {
  EMPTY_EXTRA_HOSTS,
  EXTRA_HOSTS_KEY,
  HOST_PLATFORMS_KEY,
  hostnameOf,
  inferPlatform,
  selectPlatform,
} from '../src/host-platform.js';
import { readExtraHostsByPlatform } from '../src/content-internal.js';

/** Contexte d'un SCRIPT DE CONTENU : `chrome.storage.local` seul, jamais
 * `chrome.permissions` — c'est exactement ce que Chrome expose là-bas. */
function installContentScriptChrome(local: Record<string, unknown>): void {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: (_keys: string[], cb: (items: Record<string, unknown>) => void) => cb(local),
      },
    },
  };
}

/** Contexte du SERVICE WORKER : `chrome.permissions` et les deux aires de stockage. */
function installServiceWorkerChrome(
  origins: string[],
  local: Record<string, unknown>,
  managed: Record<string, unknown> = {}
): { local: Record<string, unknown> } {
  const store = { ...local };
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { onMessage: { addListener: vi.fn() }, lastError: null, openOptionsPage: vi.fn() },
    action: { onClicked: { addListener: vi.fn() } },
    permissions: {
      getAll: (cb: (perms: { origins: string[] }) => void) => cb({ origins }),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    scripting: {
      registerContentScripts: vi.fn((_s: unknown, cb: () => void) => cb()),
      unregisterContentScripts: vi.fn((_f: unknown, cb: () => void) => cb()),
    },
    storage: {
      local: {
        get: (keys: string[], cb: (items: Record<string, unknown>) => void) => {
          const picked: Record<string, unknown> = {};
          for (const k of keys) if (k in store) picked[k] = store[k];
          cb(picked);
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items);
          cb?.();
        },
      },
      managed: { get: (cb: (items: Record<string, unknown>) => void) => cb(managed) },
      onChanged: { addListener: vi.fn() },
    },
  };
  return { local: store };
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
});

describe('A — extraHosts, jusqu’ici jamais testé au niveau des adaptateurs', () => {
  it('GithubClientAdapter reconnaît un hôte GHES/ghe.com en plus de github.com', () => {
    const adapter = new GithubClientAdapter({ extraHosts: ['ghes.example.corp'] });
    expect(adapter.matchesHost(new URL('https://github.com/acme/demo/pull/1'))).toBe(true);
    expect(adapter.matchesHost(new URL('https://ghes.example.corp/acme/demo/pull/1'))).toBe(true);
    expect(adapter.matchesHost(new URL('https://not-granted.example.com/'))).toBe(false);
  });

  it('AzdoClientAdapter reconnaît un domaine Azure DevOps Server en plus de dev.azure.com', () => {
    const adapter = new AzdoClientAdapter({ extraHosts: ['azdo.example.corp'] });
    expect(
      adapter.matchesHost(new URL('https://dev.azure.com/acme/demo/_git/repo/pullrequest/1'))
    ).toBe(true);
    expect(
      adapter.matchesHost(new URL('https://azdo.example.corp/acme/demo/_git/repo/pullrequest/1'))
    ).toBe(true);
    expect(adapter.matchesHost(new URL('https://not-granted.example.com/'))).toBe(false);
  });

  it('sans extraHosts, seul le domaine par défaut de chaque adaptateur est reconnu (comportement antérieur préservé)', () => {
    expect(new GithubClientAdapter().matchesHost(new URL('https://ghes.example.corp/'))).toBe(false);
    expect(new AzdoClientAdapter().matchesHost(new URL('https://azdo.example.corp/'))).toBe(false);
  });
});

describe('B1 — hostnameOf canonicalise des deux côtés de la comparaison', () => {
  it('extrait le nom d’hôte d’une origine chrome.permissions', () => {
    expect(hostnameOf('https://ghes.example.corp/*')).toBe('ghes.example.corp');
  });

  it('normalise la casse d’une saisie utilisateur — sinon la clé stockée ne matcherait jamais l’origine accordée', () => {
    expect(hostnameOf('GHES.Example.Corp')).toBe('ghes.example.corp');
    expect(hostnameOf('GHES.Example.Corp')).toBe(hostnameOf('https://ghes.example.corp/*'));
  });

  it('accepte une saisie nue comme une saisie préfixée du schéma', () => {
    expect(hostnameOf('dev.azure.com')).toBe('dev.azure.com');
    expect(hostnameOf('https://dev.azure.com/*')).toBe('dev.azure.com');
  });

  it('renvoie null sur une entrée non exploitable plutôt que de jeter', () => {
    expect(hostnameOf('not a host')).toBeNull();
    expect(hostnameOf('')).toBeNull();
    expect(hostnameOf('   ')).toBeNull();
  });
});

describe('B2 — le SERVICE WORKER calcule la répartition (seul contexte à voir chrome.permissions)', () => {
  it('répartit les hôtes accordés selon leur étiquette et publie le résultat', async () => {
    const { local } = installServiceWorkerChrome(
      ['https://ghes.example.corp/*', 'https://azdo.example.corp/*'],
      {
        [HOST_PLATFORMS_KEY]: {
          'ghes.example.corp': 'github',
          'azdo.example.corp': 'azdo',
        },
      }
    );
    const { publishExtraHostsByPlatform } = await import('../src/background.js');

    expect(await publishExtraHostsByPlatform()).toEqual({
      github: ['ghes.example.corp'],
      azdo: ['azdo.example.corp'],
    });
    // Publié pour le script de contenu, qui ne peut pas le recalculer.
    expect(local[EXTRA_HOSTS_KEY]).toEqual({
      github: ['ghes.example.corp'],
      azdo: ['azdo.example.corp'],
    });
  });

  it('un hôte accordé mais NON étiqueté n’est transmis à aucun adaptateur — jamais deviné', async () => {
    // Remonter cet hôte aux deux ferait toujours gagner GithubClientAdapter (premier de la
    // liste dans bootstrap()), même pour un domaine Azure DevOps Server.
    installServiceWorkerChrome(['https://untagged.example.corp/*'], {});
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    expect(await publishExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('un hôte étiqueté `config` est exclu des deux adaptateurs — accordé pour lire un configUrl, pas pour être reconnu', async () => {
    installServiceWorkerChrome(['https://config.example.corp/*'], {
      [HOST_PLATFORMS_KEY]: { 'config.example.corp': 'config' },
    });
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    expect(await publishExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('une étiquette orpheline (permission révoquée depuis) est ignorée', async () => {
    installServiceWorkerChrome([], {
      [HOST_PLATFORMS_KEY]: { 'revoked.example.corp': 'github' },
    });
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    expect(await publishExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('un hôte pré-autorisé par POLITIQUE est classé sans passer par la page d’options', async () => {
    // Sans ce chemin, le déploiement pré-autorisé du §10 exigerait que chaque poste
    // visite les réglages pour classer la main — ce qu'il existe pour éviter.
    installServiceWorkerChrome(
      ['https://ghes.example.corp/*', 'https://azdo.example.corp/*'],
      {},
      {
        allowedHosts: [
          { host: 'ghes.example.corp', platform: 'github' },
          { host: 'azdo.example.corp', platform: 'azdo' },
        ],
      }
    );
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    expect(await publishExtraHostsByPlatform()).toEqual({
      github: ['ghes.example.corp'],
      azdo: ['azdo.example.corp'],
    });
  });

  it('la politique prime sur une étiquette locale divergente', async () => {
    installServiceWorkerChrome(
      ['https://host.example.corp/*'],
      { [HOST_PLATFORMS_KEY]: { 'host.example.corp': 'github' } },
      { allowedHosts: [{ host: 'host.example.corp', platform: 'azdo' }] }
    );
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    expect(await publishExtraHostsByPlatform()).toEqual({
      github: [],
      azdo: ['host.example.corp'],
    });
  });
});

describe('B3 — le SCRIPT DE CONTENU lit la valeur publiée, sans jamais toucher chrome.permissions', () => {
  it('lit la répartition déposée par le service worker', async () => {
    installContentScriptChrome({
      [EXTRA_HOSTS_KEY]: { github: ['ghes.example.corp'], azdo: ['azdo.example.corp'] },
    });
    expect(await readExtraHostsByPlatform()).toEqual({
      github: ['ghes.example.corp'],
      azdo: ['azdo.example.corp'],
    });
  });

  it('rien de publié (premier démarrage) : listes vides, pas d’exception', async () => {
    installContentScriptChrome({});
    expect(await readExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('valeur stockée malformée : listes vides plutôt qu’un plantage du script de contenu', async () => {
    installContentScriptChrome({ [EXTRA_HOSTS_KEY]: { github: 'pas-un-tableau' } });
    expect(await readExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('hors contexte d’extension (aucun chrome) : listes vides', async () => {
    expect(await readExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });
});

describe('C — bootstrap() construit LE bon adaptateur, avec les hôtes de sa plateforme', () => {
  // Ce bloc vérifiait auparavant que les DEUX constructeurs étaient appelés : bootstrap()
  // les instanciait tous les deux pour interroger leur `matchesHost()`. L'activation se
  // décidant désormais sur la répartition publiée (`selectPlatform`, voir G1), un seul
  // adaptateur est construit — celui qui sert. L'intention du test ne change pas : chaque
  // plateforme reçoit ses hôtes, et jamais ceux de l'autre.
  const split = { github: ['ghes.example.corp'], azdo: ['azdo.example.corp'] };

  function mockBothAdapters(githubCtorArgs: unknown[], azdoCtorArgs: unknown[]): void {
    const inert = {
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
    };
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        constructor(opts: unknown) {
          githubCtorArgs.push(opts);
          Object.assign(this, inert);
        }
      },
    }));
    vi.doMock('@cct/adapter-azdo', () => ({
      AzdoClientAdapter: class {
        constructor(opts: unknown) {
          azdoCtorArgs.push(opts);
          Object.assign(this, inert);
        }
      },
    }));
  }

  it('sur un hôte GitHub, seul GithubClientAdapter est construit, avec les hôtes github', async () => {
    installContentScriptChrome({ [EXTRA_HOSTS_KEY]: split });
    const githubCtorArgs: unknown[] = [];
    const azdoCtorArgs: unknown[] = [];
    mockBothAdapters(githubCtorArgs, azdoCtorArgs);

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);

    expect(githubCtorArgs).toEqual([
      // `objectContaining` : le constructeur reçoit aussi un journal de sélecteurs et le
      // relais de configuration, sans rapport avec ce que ce test établit.
      expect.objectContaining({ documentRef: document, extraHosts: ['ghes.example.corp'] }),
    ]);
    expect(azdoCtorArgs).toEqual([]);

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });

  it('sur un hôte Azure DevOps, seul AzdoClientAdapter est construit, avec les hôtes azdo', async () => {
    installContentScriptChrome({ [EXTRA_HOSTS_KEY]: split });
    const githubCtorArgs: unknown[] = [];
    const azdoCtorArgs: unknown[] = [];
    mockBothAdapters(githubCtorArgs, azdoCtorArgs);

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://azdo.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);

    expect(azdoCtorArgs).toEqual([
      // `objectContaining` : le constructeur reçoit aussi un journal de sélecteurs et le
      // relais de configuration, sans rapport avec ce que ce test établit.
      expect.objectContaining({ documentRef: document, extraHosts: ['azdo.example.corp'] }),
    ]);
    expect(githubCtorArgs).toEqual([]);

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });

  it('sur un hôte qu’aucune plateforme ne sert, AUCUN adaptateur n’est construit', async () => {
    installContentScriptChrome({ [EXTRA_HOSTS_KEY]: split });
    const githubCtorArgs: unknown[] = [];
    const azdoCtorArgs: unknown[] = [];
    mockBothAdapters(githubCtorArgs, azdoCtorArgs);

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://example.com/'),
      configurable: true,
    });
    await bootstrap(document);

    expect(githubCtorArgs).toEqual([]);
    expect(azdoCtorArgs).toEqual([]);

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});

describe('D1 — un octroi JOKER couvre les sous-domaines concrets (§A.4, §B.6)', () => {
  // `*.ghe.com` est le cas nommé par le §A.4 : GitHub Enterprise Cloud with data
  // residency donne à chaque client un sous-domaine de ghe.com, inconnu à la compilation.
  // Chrome accorde `https://*.ghe.com/*` et injecte le script sur `acme.ghe.com` ; une
  // égalité stricte ne reconnaissait jamais cet hôte concret.
  it('hostnameOf CONSERVE le joker plutôt que de le réduire au domaine nu', () => {
    expect(hostnameOf('https://*.ghe.com/*')).toBe('*.ghe.com');
    expect(hostnameOf('https://*.GHE.com/*')).toBe('*.ghe.com');
  });

  it('GithubClientAdapter reconnaît un sous-domaine concret couvert par le joker', () => {
    const adapter = new GithubClientAdapter({ extraHosts: ['*.ghe.com'] });
    expect(adapter.matchesHost(new URL('https://acme.ghe.com/acme/demo/pull/1'))).toBe(true);
    expect(adapter.matchesHost(new URL('https://autre.ghe.com/'))).toBe(true);
  });

  it('AzdoClientAdapter en fait autant pour un joker d’entreprise', () => {
    const adapter = new AzdoClientAdapter({ extraHosts: ['*.azdo.example.corp'] });
    expect(adapter.matchesHost(new URL('https://eu.azdo.example.corp/'))).toBe(true);
  });

  // Ce test affirmait l'INVERSE — que le joker ne couvre pas le domaine nu — en invoquant
  // « la sémantique des motifs Chrome ». C'était faux, et le verrouiller par un test était
  // pire que ne pas le tester : la documentation des motifs WebExtension donne
  // explicitement `https://mozilla.org/` comme correspondant à `*://*.mozilla.org/*`.
  // Chrome injectait donc le script sur le domaine nu, que l'adaptateur refusait ensuite.
  it('le joker couvre AUSSI le domaine nu, comme l’octroi que Chrome accorde', () => {
    const adapter = new GithubClientAdapter({ extraHosts: ['*.ghe.com'] });
    expect(adapter.matchesHost(new URL('https://ghe.com/'))).toBe(true);
  });

  it('mais pas un domaine qui se termine par la même chaîne sans en être un sous-domaine', () => {
    const adapter = new GithubClientAdapter({ extraHosts: ['*.ghe.com'] });
    expect(adapter.matchesHost(new URL('https://evilghe.com/'))).toBe(false);
  });
});

describe('D2 — les publications concurrentes sont sérialisées (service worker)', () => {
  // Autoriser un hôte puis l'étiqueter déclenche coup sur coup `permissions.onAdded` et
  // `storage.onChanged`. Lancées librement, la première publication pouvait lire
  // l'ancienne carte d'étiquettes et n'écrire qu'APRÈS la seconde, réinstallant une liste
  // périmée d'où le nouvel hôte était absent.
  //
  // Ce test EXIGE un stockage asynchrone, et à latence DÉCROISSANTE. Une première version
  // employait le faux synchrone des sections B/C : la course n'y était pas représentable,
  // et le test passait aussi bien avec que sans la sérialisation — il ne prouvait donc
  // rien. Le premier `get` est ici le plus lent, de sorte qu'une publication non
  // sérialisée termine dans le désordre et écrase le bon résultat par le périmé.
  it('la publication lente lancée en premier n’écrase pas le résultat de la plus récente', async () => {
    const store: Record<string, unknown> = {};
    // `null` tant que la course n'est pas armée : `background.js` publie DÉJÀ une fois à
    // l'import (rattrapage au démarrage du worker). Une première version indexait le délai
    // sur un simple compteur d'appels — cette publication de démarrage consommait alors le
    // `get` lent, les deux appels du test devenaient rapides, et il passait aussi bien avec
    // que sans la sérialisation. Le délai est donc armé APRÈS que l'import est retombé.
    let delays: number[] | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { onMessage: { addListener: vi.fn() }, lastError: null, openOptionsPage: vi.fn() },
      action: { onClicked: { addListener: vi.fn() } },
      permissions: {
        getAll: (cb: (perms: { origins: string[] }) => void) =>
          void setTimeout(() => cb({ origins: ['https://ghes.example.corp/*'] }), 0),
        onAdded: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      scripting: {
        registerContentScripts: vi.fn((_s: unknown, cb: () => void) => cb()),
        unregisterContentScripts: vi.fn((_f: unknown, cb: () => void) => cb()),
      },
      storage: {
        local: {
          get: (keys: string[], cb: (items: Record<string, unknown>) => void) => {
            // L'instantané est pris MAINTENANT, la livraison est différée : c'est ce qui
            // fait qu'une publication lente rend un état déjà périmé à son écriture.
            const picked: Record<string, unknown> = {};
            for (const k of keys) if (k in store) picked[k] = store[k];
            setTimeout(() => cb(picked), delays?.shift() ?? 0);
          },
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(store, items);
            cb?.();
          },
        },
        managed: { get: (cb: (items: Record<string, unknown>) => void) => cb({}) },
        onChanged: { addListener: vi.fn() },
      },
    };
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 10)); // laisse la publication de démarrage finir
    delays = [30, 0]; // la lecture de la PREMIÈRE des deux publications ci-dessous traîne

    // Première publication lancée alors qu'aucune étiquette n'existe encore...
    const first = publishExtraHostsByPlatform();
    // ...et seconde lancée aussitôt après que l'étiquette a été posée.
    store[HOST_PLATFORMS_KEY] = { 'ghes.example.corp': 'github' };
    const second = publishExtraHostsByPlatform();

    await Promise.all([first, second]);
    expect(store[EXTRA_HOSTS_KEY]).toEqual({ github: ['ghes.example.corp'], azdo: [] });
  });
});

describe('D3 — une étiquette de politique d’entreprise est reconnue sans geste local', () => {
  it('la forme objet {host, platform} classe un Azure DevOps Server', async () => {
    const store = installServiceWorkerChrome(
      ['https://azdo.example.corp/*'],
      {},
      { allowedHosts: [{ host: 'azdo.example.corp', platform: 'azdo' }] }
    ).local;
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    await publishExtraHostsByPlatform();
    expect(store[EXTRA_HOSTS_KEY]).toEqual({ github: [], azdo: ['azdo.example.corp'] });
  });

  it('une entrée SANS plateforme explicite reste non classée — jamais rabattue sur github', async () => {
    // Deux raisons, toutes deux relevées par la revue Codex :
    // 1. Le validateur de schéma de Chrome exige « un $ref ou exactement un type » par
    //    schéma : `items` ne peut pas déclarer deux formes, la forme objet est donc la
    //    seule publiable — une chaîne nue n'arrive plus par ce canal.
    // 2. Surtout, le schéma d'AVANT décrivait ce tableau comme contenant « domaines GHES /
    //    Azure DevOps Server et hôte de configUrl » : rabattre ses chaînes sur `github`
    //    aurait réécrit le sens d'une politique existante, et fait gagner l'adaptateur
    //    GitHub (consulté en premier) sur une page Azure DevOps.
    const store = installServiceWorkerChrome(
      ['https://ghes.example.corp/*'],
      {},
      { allowedHosts: ['ghes.example.corp', { host: 'sans-plateforme.corp' }] }
    ).local;
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    await publishExtraHostsByPlatform();
    expect(store[EXTRA_HOSTS_KEY]).toEqual({ github: [], azdo: [] });
  });

  it('la politique PRIME sur une étiquette locale divergente', async () => {
    const store = installServiceWorkerChrome(
      ['https://host.example.corp/*'],
      { [HOST_PLATFORMS_KEY]: { 'host.example.corp': 'github' } },
      { allowedHosts: [{ host: 'host.example.corp', platform: 'azdo' }] }
    ).local;
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    await publishExtraHostsByPlatform();
    expect(store[EXTRA_HOSTS_KEY]).toEqual({ github: [], azdo: ['host.example.corp'] });
  });
});

// ————— E — trois défauts relevés au troisième passage de la revue Codex —————

describe('E1 — le retrait d’une permission coupe l’adaptateur DÉJÀ actif dans l’onglet', () => {
  // Désenregistrer le script de contenu n'empêche que les injections futures : celui déjà
  // en place continuerait d'observer le DOM et de poser sa barre d'outils sur un hôte qui
  // n'est plus autorisé, jusqu'au rechargement de la page.
  it('bootstrap() se révoque lui-même quand son hôte disparaît de la répartition publiée', async () => {
    let listener:
      | ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void)
      | null = null;
    const disposeEditors = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (_k: string[], cb: (items: Record<string, unknown>) => void) =>
            cb({ [EXTRA_HOSTS_KEY]: { github: ['ghes.example.corp'], azdo: [] } }),
        },
        onChanged: {
          addListener: (cb: typeof listener) => {
            listener = cb;
          },
          removeListener: vi.fn(),
        },
      },
    };
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        #hosts: string[];
        constructor(opts: { extraHosts?: string[] } = {}) {
          this.#hosts = ['github.com', ...(opts.extraHosts ?? [])];
        }
        matchesHost(url: URL): boolean {
          return this.#hosts.includes(url.hostname);
        }
        async getCurrentUser() {
          return { login: 'someone' };
        }
        observeEditors() {
          return { dispose: disposeEditors };
        }
        currentPr() {
          return null;
        }
        readPublishedResult() {
          return null;
        }
      },
    }));
    vi.doMock('@cct/adapter-azdo', () => ({
      AzdoClientAdapter: class {
        matchesHost(): boolean {
          return false;
        }
      },
    }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);
    expect(disposeEditors).not.toHaveBeenCalled();
    expect(listener).toBeTypeOf('function');

    // La permission est retirée : background.ts republie une répartition sans cet hôte.
    listener!({ [EXTRA_HOSTS_KEY]: { newValue: { github: [], azdo: [] } } }, 'local');
    expect(disposeEditors).toHaveBeenCalledTimes(1);

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });

  it('une republication qui CONSERVE l’hôte ne révoque rien', async () => {
    let listener:
      | ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void)
      | null = null;
    const disposeEditors = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (_k: string[], cb: (items: Record<string, unknown>) => void) =>
            cb({ [EXTRA_HOSTS_KEY]: { github: ['ghes.example.corp'], azdo: [] } }),
        },
        onChanged: {
          addListener: (cb: typeof listener) => {
            listener = cb;
          },
          removeListener: vi.fn(),
        },
      },
    };
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        #hosts: string[];
        constructor(opts: { extraHosts?: string[] } = {}) {
          this.#hosts = ['github.com', ...(opts.extraHosts ?? [])];
        }
        matchesHost(url: URL): boolean {
          return this.#hosts.includes(url.hostname);
        }
        async getCurrentUser() {
          return { login: 'someone' };
        }
        observeEditors() {
          return { dispose: disposeEditors };
        }
        currentPr() {
          return null;
        }
        readPublishedResult() {
          return null;
        }
      },
    }));
    vi.doMock('@cct/adapter-azdo', () => ({
      AzdoClientAdapter: class {
        matchesHost(): boolean {
          return false;
        }
      },
    }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);

    // Un autre hôte est ajouté ; celui-ci reste autorisé.
    listener!(
      { [EXTRA_HOSTS_KEY]: { newValue: { github: ['ghes.example.corp', 'autre.corp'], azdo: [] } } },
      'local'
    );
    expect(disposeEditors).not.toHaveBeenCalled();

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});

describe('E2 — un port non standard survit jusqu’aux URL de configuration (§A.4, §B.4)', () => {
  // La reconnaissance d'hôte ignore le port (les motifs de Chrome aussi), mais `pr.host`
  // sert à BÂTIR les URL de lecture de configuration : le perdre faisait interroger le
  // port 443 d'une instance servie ailleurs — configuration jamais lue, état dégradé.
  it('GithubClientAdapter.currentPr() retient l’autorité complète, port compris', () => {
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'location', {
      value: new URL('https://ghes.example.corp:8443/acme/demo/pull/42'),
      configurable: true,
    });
    const pr = new GithubClientAdapter({ documentRef: doc, extraHosts: ['ghes.example.corp'] }).currentPr();
    expect(pr?.host).toBe('ghes.example.corp:8443');
  });

  it('la reconnaissance d’hôte, elle, reste indifférente au port', () => {
    const adapter = new GithubClientAdapter({ extraHosts: ['ghes.example.corp'] });
    expect(adapter.matchesHost(new URL('https://ghes.example.corp:8443/acme/demo/pull/1'))).toBe(true);
  });

  it('un hôte sans port explicite n’en gagne pas — github.com reste github.com', () => {
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'location', {
      value: new URL('https://github.com/acme/demo/pull/7'),
      configurable: true,
    });
    expect(new GithubClientAdapter({ documentRef: doc }).currentPr()?.host).toBe('github.com');
  });
});

// ————— F — trois défauts relevés au troisième passage de la revue Codex —————

describe('F1 — le joker suit la sémantique réelle des motifs WebExtension', () => {
  // Voir D1 : le test qui suivait affirmait l'inverse, en invoquant à tort « la sémantique
  // des motifs Chrome ». Ce bloc-ci exerce la fonction partagée directement, pour que la
  // règle soit lisible sans passer par un adaptateur.
  it('couvre le domaine nu ET ses sous-domaines', () => {
    expect(hostMatchesPattern('ghe.com', '*.ghe.com')).toBe(true);
    expect(hostMatchesPattern('acme.ghe.com', '*.ghe.com')).toBe(true);
    expect(hostMatchesPattern('eu.acme.ghe.com', '*.ghe.com')).toBe(true);
  });

  it('ne couvre pas un voisin qui se termine par la même chaîne', () => {
    expect(hostMatchesPattern('evilghe.com', '*.ghe.com')).toBe(false);
    expect(hostMatchesPattern('ghe.com.evil.test', '*.ghe.com')).toBe(false);
  });

  it('une entrée sans joker reste une égalité stricte', () => {
    expect(hostMatchesPattern('ghes.example.corp', 'ghes.example.corp')).toBe(true);
    expect(hostMatchesPattern('sub.ghes.example.corp', 'ghes.example.corp')).toBe(false);
  });

  it('hostMatchesAny mêle entrées exactes et jokers', () => {
    const patterns = ['ghes.example.corp', '*.ghe.com'];
    expect(hostMatchesAny('ghe.com', patterns)).toBe(true);
    expect(hostMatchesAny('ghes.example.corp', patterns)).toBe(true);
    expect(hostMatchesAny('autre.example.corp', patterns)).toBe(false);
  });
});

/** Adaptateur factice livrant UN éditeur à l'observation, pour que `bootstrap()` construise
 * réellement un contrôleur — ce que les tests E1 ne faisaient pas. */
function mockGithubAdapterDeliveringOneEditor(disposeEditors: () => void): void {
  vi.doMock('@cct/adapter-github', () => ({
    GithubClientAdapter: class {
      #hosts: string[];
      constructor(opts: { extraHosts?: string[] } = {}) {
        this.#hosts = ['github.com', ...(opts.extraHosts ?? [])];
      }
      matchesHost(url: URL): boolean {
        return this.#hosts.includes(url.hostname);
      }
      async getCurrentUser() {
        return { login: 'someone' };
      }
      async getRepoConfig() {
        return { status: 'absent' };
      }
      async getOrgConfig() {
        return { status: 'absent' };
      }
      observeEditors(cb: (editor: unknown) => void) {
        cb({
          element: document.createElement('textarea'),
          context: { pr: { host: 'ghes.example.corp', scope: ['acme', 'demo'], number: 1 } },
        });
        return { dispose: disposeEditors };
      }
      currentPr() {
        return null;
      }
      readPublishedResult() {
        return null;
      }
    },
  }));
  vi.doMock('@cct/adapter-azdo', () => ({
    AzdoClientAdapter: class {
      matchesHost(): boolean {
        return false;
      }
    },
  }));
}

describe('F2 — la révocation DÉFAIT les contrôleurs déjà attachés, pas seulement l’observation', () => {
  // `EditorController.dispose()` est le seul à retirer la barre d'outils, la saisie rapide
  // et les écouteurs clavier/clic. Une première version du correctif de révocation ne
  // coupait que les deux observations : toute cette surface restait vivante sur un hôte
  // devenu non autorisé, jusqu'au rechargement de la page.
  it('chaque contrôleur attaché reçoit dispose() quand l’hôte quitte la répartition', async () => {
    let listener:
      | ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void)
      | null = null;
    const controllerDispose = vi.fn();
    const controllerAttach = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (_k: string[], cb: (items: Record<string, unknown>) => void) =>
            cb({ [EXTRA_HOSTS_KEY]: { github: ['ghes.example.corp'], azdo: [] } }),
          set: vi.fn(),
        },
        sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}) },
        onChanged: {
          addListener: (cb: typeof listener) => {
            listener = cb;
          },
          removeListener: vi.fn(),
        },
      },
    };
    mockGithubAdapterDeliveringOneEditor(vi.fn());
    vi.doMock('../src/editor-controller.js', () => ({
      DEFAULT_DIRECT_SHORTCUTS: {},
      EditorController: class {
        attach = controllerAttach;
        dispose = controllerDispose;
      },
    }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);
    await new Promise((r) => setTimeout(r, 0)); // `attach()` traverse plusieurs await
    expect(controllerAttach).toHaveBeenCalledTimes(1);
    expect(controllerDispose).not.toHaveBeenCalled();

    listener!({ [EXTRA_HOSTS_KEY]: { newValue: { github: [], azdo: [] } } }, 'local');
    expect(controllerDispose).toHaveBeenCalledTimes(1);

    vi.doUnmock('../src/editor-controller.js');
    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});

describe('F3 — un hôte classé APRÈS l’ouverture de l’onglet finit par s’activer', () => {
  // Le sens « sortie » de la permission était câblé (révocation), pas le sens « entrée ».
  // Deux chemins réels y menaient : le script de contenu s'exécute avant que le service
  // worker n'ait publié sa première répartition, ou l'hôte est classé depuis la page
  // d'options alors que l'onglet est déjà ouvert.
  it('bootstrap() sort sans adaptateur, puis démarre à la publication qui reconnaît l’hôte', async () => {
    let listener:
      | ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void)
      | null = null;
    const disposeEditors = vi.fn();
    const controllerAttach = vi.fn();
    // Le stockage est un VRAI état mutable ici : `chrome.storage.onChanged` ne se déclenche
    // qu'APRÈS l'écriture, donc une relecture voit forcément la nouvelle valeur. Un faux
    // qui notifierait sans que `get` change mentirait sur l'ordre réel des événements.
    const store: Record<string, unknown> = {}; // répartition PAS ENCORE publiée
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (keys: string[], cb: (items: Record<string, unknown>) => void) => {
            const picked: Record<string, unknown> = {};
            for (const k of keys) if (k in store) picked[k] = store[k];
            cb(picked);
          },
          set: vi.fn(),
        },
        sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}) },
        onChanged: {
          addListener: (cb: typeof listener) => {
            listener = cb;
          },
          removeListener: vi.fn(),
        },
      },
    };
    mockGithubAdapterDeliveringOneEditor(disposeEditors);
    vi.doMock('../src/editor-controller.js', () => ({
      DEFAULT_DIRECT_SHORTCUTS: {},
      EditorController: class {
        attach = controllerAttach;
        dispose = vi.fn();
      },
    }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    const dispose = await bootstrap(document);
    await new Promise((r) => setTimeout(r, 0));
    expect(controllerAttach).not.toHaveBeenCalled(); // rien pour l'instant, c'est normal
    expect(listener).toBeTypeOf('function'); // ...mais le guet est bien armé

    // Le service worker publie enfin, et l'hôte y est classé : l'écriture d'abord, la
    // notification ensuite — l'ordre que Chrome garantit.
    const published = { github: ['ghes.example.corp'], azdo: [] };
    store[EXTRA_HOSTS_KEY] = published;
    listener!({ [EXTRA_HOSTS_KEY]: { newValue: published } }, 'local');
    await new Promise((r) => setTimeout(r, 0));
    expect(controllerAttach).toHaveBeenCalledTimes(1);

    // Et le disposer rendu à l'appelant défait bien l'amorçage tardif.
    dispose();
    expect(disposeEditors).toHaveBeenCalledTimes(1);

    vi.doUnmock('../src/editor-controller.js');
    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});

// ————— G — trois défauts relevés au quatrième passage de la revue Codex —————

describe('G1 — l’activation se décide sur la répartition publiée, pas sur matchesHost()', () => {
  // `dev.azure.com` et `*.visualstudio.com` sont des défauts EN DUR des adaptateurs, mais
  // `content_scripts` du manifeste ne couvre statiquement que github.com : ces hôtes
  // dépendent donc bel et bien d'une permission optionnelle. Un commentaire de ce dépôt
  // affirmait l'inverse, et la révocation était de fait muette sur toute la famille Azure.
  it('seul github.com est actif sans figurer dans la répartition', () => {
    expect(selectPlatform('github.com', EMPTY_EXTRA_HOSTS)).toBe('github');
  });

  it('dev.azure.com et *.visualstudio.com ne s’activent PAS sur leur seul défaut d’adaptateur', () => {
    expect(selectPlatform('dev.azure.com', EMPTY_EXTRA_HOSTS)).toBeNull();
    expect(selectPlatform('acme.visualstudio.com', EMPTY_EXTRA_HOSTS)).toBeNull();
  });

  it('...mais s’activent dès que la répartition les porte', () => {
    const extra = { github: [], azdo: ['dev.azure.com', '*.visualstudio.com'] };
    expect(selectPlatform('dev.azure.com', extra)).toBe('azdo');
    expect(selectPlatform('acme.visualstudio.com', extra)).toBe('azdo');
  });

  it('rend la plateforme, pas un booléen : c’est ce qui rend un reclassement visible', () => {
    const host = 'host.example.corp';
    expect(selectPlatform(host, { github: [host], azdo: [] })).toBe('github');
    expect(selectPlatform(host, { github: [], azdo: [host] })).toBe('azdo');
  });
});

describe('G2 — la page d’options n’étiquette rien sans choix explicite', () => {
  it('ne devine pas un domaine auto-hébergé — le cas courant', () => {
    expect(inferPlatform('ghes.example.corp')).toBeNull();
    expect(inferPlatform('azdo.example.corp')).toBeNull();
  });

  it('pré-remplit les domaines de produit connus, Azure comme GitHub', () => {
    expect(inferPlatform('dev.azure.com')).toBe('azdo');
    expect(inferPlatform('acme.visualstudio.com')).toBe('azdo');
    expect(inferPlatform('acme.ghe.com')).toBe('github');
    expect(inferPlatform('github.com')).toBe('github');
  });
});

describe('G3 — un hôte reclassé redémarre l’onglet sur le bon adaptateur', () => {
  // Le guet ne rendait qu'un booléen « un adaptateur matche » : reclasser un hôte
  // github → azdo le laissait à `true`, donc rien ne bougeait et l'onglet continuait avec
  // l'ancien adaptateur — ses observateurs, ses sélecteurs DOM et ses URL de config.
  it('révoque l’ancien adaptateur et réamorce quand la plateforme de l’hôte change', async () => {
    let listener:
      | ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void)
      | null = null;
    const githubDispose = vi.fn();
    const azdoDispose = vi.fn();
    const store: Record<string, unknown> = {
      [EXTRA_HOSTS_KEY]: { github: ['host.example.corp'], azdo: [] },
    };
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (keys: string[], cb: (items: Record<string, unknown>) => void) => {
            const picked: Record<string, unknown> = {};
            for (const k of keys) if (k in store) picked[k] = store[k];
            cb(picked);
          },
          set: vi.fn(),
        },
        sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}) },
        onChanged: {
          addListener: (cb: typeof listener) => {
            listener = cb;
          },
          removeListener: vi.fn(),
        },
      },
    };
    const mkAdapter = (dispose: () => void) =>
      class {
        matchesHost(): boolean {
          return true;
        }
        async getCurrentUser() {
          return { login: 'someone' };
        }
        async getRepoConfig() {
          return { status: 'absent' };
        }
        async getOrgConfig() {
          return { status: 'absent' };
        }
        observeEditors() {
          return { dispose };
        }
        currentPr() {
          return null;
        }
        readPublishedResult() {
          return null;
        }
      };
    vi.doMock('@cct/adapter-github', () => ({ GithubClientAdapter: mkAdapter(githubDispose) }));
    vi.doMock('@cct/adapter-azdo', () => ({ AzdoClientAdapter: mkAdapter(azdoDispose) }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://host.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);
    expect(githubDispose).not.toHaveBeenCalled();
    expect(azdoDispose).not.toHaveBeenCalled();

    // L'hôte est reclassé en Azure DevOps : écriture d'abord, notification ensuite.
    const reclassified = { github: [], azdo: ['host.example.corp'] };
    store[EXTRA_HOSTS_KEY] = reclassified;
    listener!({ [EXTRA_HOSTS_KEY]: { newValue: reclassified } }, 'local');
    await new Promise((r) => setTimeout(r, 0));

    // L'adaptateur GitHub est défait, et le réamorçage a armé celui d'Azure DevOps.
    expect(githubDispose).toHaveBeenCalledTimes(1);
    expect(azdoDispose).not.toHaveBeenCalled(); // vivant : c'est lui qui sert désormais

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});

describe('G2bis — la page d’options REFUSE d’étiqueter sans choix explicite', () => {
  // Le test G2 ci-dessus ne couvre que la règle d'inférence. Le défaut réellement buggé
  // était ailleurs : `<option value="github">` en tête était sélectionné d'office, et
  // `platformSelect?.value || 'config'` fournissait en plus un repli implicite. Ce bloc-ci
  // exerce donc la page elle-même, en montant le DOM qu'elle attend.
  function mountOptionsDom(): void {
    document.body.innerHTML = `
      <input type="text" id="host-input" />
      <select id="host-platform">
        <option value="" selected>— choisir la plateforme —</option>
        <option value="github">GitHub</option>
        <option value="azdo">Azure DevOps Server</option>
        <option value="config">Autre</option>
      </select>
      <button id="host-add" type="button"></button>
      <span id="host-add-state"></span>
      <ul id="host-list"></ul>
      <select id="language"></select>
      <textarea id="direct-shortcuts"></textarea>
      <button id="direct-shortcuts-save"></button>
      <span id="direct-shortcuts-state"></span>
      <p id="degraded-state"></p>
      <p id="selector-log"></p>`;
  }

  function installOptionsChrome(request: (o: { origins: string[] }, cb: (g: boolean) => void) => void) {
    const stored: Record<string, unknown> = {};
    (globalThis as { chrome?: unknown }).chrome = {
      permissions: {
        request,
        getAll: (cb: (p: { origins?: string[] }) => void) => cb({ origins: [] }),
      },
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb(stored),
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(stored, items);
            cb?.();
          },
        },
        sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}), set: vi.fn() },
        managed: { get: (cb: (i: Record<string, unknown>) => void) => cb({}) },
      },
    };
    return stored;
  }

  it('sans plateforme choisie, aucune permission n’est demandée et rien n’est étiqueté', async () => {
    mountOptionsDom();
    const request = vi.fn();
    const stored = installOptionsChrome(request);
    await import('../src/options/options.js');

    (document.getElementById('host-input') as HTMLInputElement).value = 'azdo.example.corp';
    (document.getElementById('host-add') as HTMLButtonElement).click();

    expect(request).not.toHaveBeenCalled();
    expect(stored[HOST_PLATFORMS_KEY]).toBeUndefined();
    expect(document.getElementById('host-add-state')?.textContent).toMatch(/plateforme/i);
  });

  it('un domaine Azure connu pré-remplit le menu, au lieu de le laisser sur GitHub', async () => {
    mountOptionsDom();
    installOptionsChrome(vi.fn());
    await import('../src/options/options.js');

    const input = document.getElementById('host-input') as HTMLInputElement;
    input.value = 'dev.azure.com';
    input.dispatchEvent(new Event('input'));

    expect((document.getElementById('host-platform') as HTMLSelectElement).value).toBe('azdo');
  });

  it('une fois la plateforme choisie, l’étiquette écrite est bien celle-là', async () => {
    mountOptionsDom();
    const stored = installOptionsChrome((_o, cb) => cb(true));
    await import('../src/options/options.js');

    (document.getElementById('host-input') as HTMLInputElement).value = 'azdo.example.corp';
    (document.getElementById('host-platform') as HTMLSelectElement).value = 'azdo';
    (document.getElementById('host-add') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(stored[HOST_PLATFORMS_KEY]).toEqual({ 'azdo.example.corp': 'azdo' });
  });
});

// ————— H — quatre défauts relevés au cinquième passage de la revue Codex —————

describe('H1 — le schéma est retiré sans égard à la casse', () => {
  // Un schéma en majuscules est valide, et une saisie collée depuis une barre d'adresse
  // peut l'être. Sans le drapeau `i`, le schéma survivait au retrait et `new URL()`
  // parsait `https` comme nom d'hôte : la page d'options demandait alors la permission
  // pour `https://https/*` et l'étiquetait. Un échec qui rend un résultat plausible.
  it('HTTPS:// en majuscules donne le vrai hôte, pas "https"', () => {
    expect(hostnameOf('HTTPS://GHES.Example.Corp')).toBe('ghes.example.corp');
    expect(hostnameOf('HTTP://ghes.example.corp')).toBe('ghes.example.corp');
    expect(hostnameOf('HtTpS://ghes.example.corp/*')).toBe('ghes.example.corp');
  });

  it('donne le même hôte quelle que soit la casse du schéma', () => {
    expect(hostnameOf('HTTPS://ghes.example.corp')).toBe(hostnameOf('https://ghes.example.corp'));
  });
});

describe('H2 — la classification la plus PRÉCISE l’emporte, pas la première listée', () => {
  // Règle de ce produit, pas une sémantique du navigateur : Chrome répond oui ou non motif
  // par motif. Le départage naît de ce que deux plateformes peuvent revendiquer un hôte.
  it('une entrée exacte bat un joker de l’autre plateforme', () => {
    expect(
      selectPlatform('azdo.corp.example', {
        github: ['*.corp.example'],
        azdo: ['azdo.corp.example'],
      })
    ).toBe('azdo');
  });

  it('...dans les deux sens, l’ordre des listes ne décide de rien', () => {
    expect(
      selectPlatform('ghes.corp.example', {
        github: ['ghes.corp.example'],
        azdo: ['*.corp.example'],
      })
    ).toBe('github');
  });

  it('entre deux jokers, le suffixe le plus long gagne', () => {
    expect(
      selectPlatform('eu.azdo.corp.example', {
        github: ['*.corp.example'],
        azdo: ['*.azdo.corp.example'],
      })
    ).toBe('azdo');
  });

  it('à précision égale, ne tranche pas — un hôte non classé n’active rien', () => {
    // Configuration contradictoire : la deviner produirait une interface subtilement
    // fausse, là où ne rien activer se voit et se corrige.
    expect(
      selectPlatform('host.corp.example', {
        github: ['host.corp.example'],
        azdo: ['host.corp.example'],
      })
    ).toBeNull();
  });
});

describe('H3 — l’inférence se recalcule tant que personne n’a choisi', () => {
  function mountAndLoad() {
    document.body.innerHTML = `
      <input type="text" id="host-input" />
      <select id="host-platform">
        <option value="" selected>—</option>
        <option value="github">GitHub</option>
        <option value="azdo">Azure DevOps Server</option>
        <option value="config">Autre</option>
      </select>
      <button id="host-add" type="button"></button>
      <span id="host-add-state"></span>
      <ul id="host-list"></ul>
      <select id="language"></select>
      <textarea id="direct-shortcuts"></textarea>
      <button id="direct-shortcuts-save"></button>
      <span id="direct-shortcuts-state"></span>
      <p id="degraded-state"></p><p id="selector-log"></p>`;
    (globalThis as { chrome?: unknown }).chrome = {
      permissions: {
        request: vi.fn(),
        getAll: (cb: (p: { origins?: string[] }) => void) => cb({ origins: [] }),
      },
      storage: {
        local: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}), set: vi.fn() },
        sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}), set: vi.fn() },
        managed: { get: (cb: (i: Record<string, unknown>) => void) => cb({}) },
      },
    };
  }
  const type = (value: string) => {
    const input = document.getElementById('host-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const platform = () => (document.getElementById('host-platform') as HTMLSelectElement).value;

  it('remplacer un hôte Azure par un hôte GitHub recalcule la plateforme', async () => {
    mountAndLoad();
    await import('../src/options/options.js');
    type('dev.azure.com');
    expect(platform()).toBe('azdo');
    type('acme.ghe.com');
    expect(platform()).toBe('github'); // restait 'azdo' avant ce correctif
  });

  it('effacer vers un hôte non inférable revient au placeholder, qui force un choix', async () => {
    mountAndLoad();
    await import('../src/options/options.js');
    type('dev.azure.com');
    type('ghes.example.corp');
    expect(platform()).toBe('');
  });

  it('un choix EXPLICITE n’est plus jamais écrasé par l’inférence', async () => {
    mountAndLoad();
    await import('../src/options/options.js');
    const select = document.getElementById('host-platform') as HTMLSelectElement;
    select.value = 'config';
    select.dispatchEvent(new Event('change'));
    type('dev.azure.com');
    expect(platform()).toBe('config');
  });
});

describe('H4 — un contrôleur dont l’éditeur a quitté le document est libéré', () => {
  // Le `Set` introduit pour que la révocation défasse les contrôleurs retenait aussi les
  // contrôleurs MORTS — avec leur DOM détaché, leur configuration et l'adaptateur —
  // jusqu'à la fermeture de l'onglet. Sur une page de revue en SPA on ouvre et referme des
  // éditeurs en continu : le correctif de la révocation avait créé une fuite.
  //
  // Le test retire RÉELLEMENT le nœud du document, plutôt que d'employer un faux qui se
  // déclarerait détaché : c'est `isConnected` du vrai DOM qui doit trancher.
  it('l’éditeur retiré du DOM voit son contrôleur détruit à l’attachement suivant', async () => {
    const disposes: number[] = [];
    let emit: ((editor: unknown) => void) | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) =>
            cb({ [EXTRA_HOSTS_KEY]: { github: ['ghes.example.corp'], azdo: [] } }),
          set: vi.fn(),
        },
        sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    };
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        async getCurrentUser() {
          return { login: 'someone' };
        }
        async getRepoConfig() {
          return { status: 'absent' };
        }
        async getOrgConfig() {
          return { status: 'absent' };
        }
        observeEditors(cb: (editor: unknown) => void) {
          emit = cb;
          return { dispose: vi.fn() };
        }
        currentPr() {
          return null;
        }
        readPublishedResult() {
          return null;
        }
      },
    }));
    vi.doMock('@cct/adapter-azdo', () => ({ AzdoClientAdapter: class {} }));
    let seq = 0;
    vi.doMock('../src/editor-controller.js', () => ({
      DEFAULT_DIRECT_SHORTCUTS: {},
      EditorController: class {
        #id = seq++;
        attach = vi.fn();
        dispose = () => disposes.push(this.#id);
      },
    }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://ghes.example.corp/acme/demo'),
      configurable: true,
    });
    await bootstrap(document);

    const openEditor = async () => {
      const el = document.createElement('textarea');
      document.body.appendChild(el);
      emit!({ element: el, context: { pr: { host: 'ghes.example.corp', scope: ['a', 'b'], number: 1 } } });
      await new Promise((r) => setTimeout(r, 0));
      return el;
    };

    const first = await openEditor();
    expect(disposes).toEqual([]);

    first.remove(); // l'éditeur quitte le document, comme en navigation SPA
    await openEditor(); // le suivant apparaît : c'est là qu'on récolte

    expect(disposes).toEqual([0]); // le contrôleur mort a bien été défait

    vi.doUnmock('../src/editor-controller.js');
    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});
