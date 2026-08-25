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
import { EXTRA_HOSTS_KEY, HOST_PLATFORMS_KEY, hostnameOf } from '../src/host-platform.js';
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
      { allowedHosts: ['ghes.example.corp', { host: 'azdo.example.corp', platform: 'azdo' }] }
    );
    const { publishExtraHostsByPlatform } = await import('../src/background.js');
    expect(await publishExtraHostsByPlatform()).toEqual({
      github: ['ghes.example.corp'], // forme chaîne : GitHub, la plateforme pré-déclarable (§A.4)
      azdo: ['azdo.example.corp'], // forme objet : plateforme explicite
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

describe('C — bootstrap() transmet bien la répartition lue aux deux constructeurs', () => {
  it('les hôtes atteignent le bon adaptateur, ceux de l’autre plateforme n’y apparaissent pas', async () => {
    installContentScriptChrome({
      [EXTRA_HOSTS_KEY]: { github: ['ghes.example.corp'], azdo: ['azdo.example.corp'] },
    });

    const githubCtorArgs: unknown[] = [];
    const azdoCtorArgs: unknown[] = [];
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        constructor(opts: unknown) {
          githubCtorArgs.push(opts);
        }
        matchesHost(): boolean {
          return false; // aucun ne matche : le test s'arrête avant tout rendu
        }
      },
    }));
    vi.doMock('@cct/adapter-azdo', () => ({
      AzdoClientAdapter: class {
        constructor(opts: unknown) {
          azdoCtorArgs.push(opts);
        }
        matchesHost(): boolean {
          return false;
        }
      },
    }));

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://example.com/'),
      configurable: true,
    });
    await bootstrap(document);

    expect(githubCtorArgs).toEqual([{ documentRef: document, extraHosts: ['ghes.example.corp'] }]);
    expect(azdoCtorArgs).toEqual([{ documentRef: document, extraHosts: ['azdo.example.corp'] }]);

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
  });
});
