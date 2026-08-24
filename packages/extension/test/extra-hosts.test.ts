// @vitest-environment happy-dom
// Non-régression : `bootstrap()` (§2) choisissait toujours GithubClientAdapter/
// AzdoClientAdapter avec leurs seuls hôtes par défaut (github.com, dev.azure.com), même
// après qu'un domaine GitHub Enterprise Server ou Azure DevOps Server auto-hébergé ait
// été accordé via `optional_host_permissions` : `extraHosts` n'était jamais transmis au
// constructeur. La permission accordée injectait bien le script de contenu
// (`registerContentScriptForOrigin`, background.test.ts) mais aucun adaptateur ne
// reconnaissait ensuite l'hôte — aucune interface n'apparaissait.
//
// Le correctif introduit `readExtraHostsByPlatform()` : `chrome.permissions.getAll()`
// seul ne suffit pas à répartir les hôtes accordés entre les deux adaptateurs, puisque la
// page d'options laisse saisir n'importe quel domaine sans savoir s'il sert GitHub ou
// Azure DevOps — remonter la même liste aux deux ferait toujours gagner
// GithubClientAdapter (premier de `adapters` dans `bootstrap()`), cassant la
// reconnaissance d'un domaine Azure DevOps Server. D'où l'étiquette `hostPlatforms`
// posée par la page d'options (`chrome.storage.local`).
//
// Trois niveaux, chacun avait un trou de couverture avant ce fichier :
// A. Les adaptateurs eux-mêmes n'avaient JAMAIS de test sur `extraHosts` — ni GitHub ni
//    AzDO, alors que le paramètre existe depuis leur création.
// B. `hostnameOfOrigin`/`readExtraHostsByPlatform` sont neufs.
// C. Le câblage dans `bootstrap()` (l'appel effectivement fait, avec le bon résultat,
//    aux deux constructeurs) n'était vérifié nulle part.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { hostnameOfOrigin, readExtraHostsByPlatform } from '../src/content-internal.js';

function installFakeChrome(origins: string[], hostPlatforms: Record<string, string>): void {
  (globalThis as { chrome?: unknown }).chrome = {
    permissions: {
      getAll: (cb: (perms: { origins: string[] }) => void) => cb({ origins }),
    },
    storage: {
      local: {
        get: (_keys: string[], cb: (items: Record<string, unknown>) => void) =>
          cb({ hostPlatforms }),
      },
    },
  };
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
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
    expect(adapter.matchesHost(new URL('https://dev.azure.com/acme/demo/_git/repo/pullrequest/1'))).toBe(
      true
    );
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

describe('B — hostnameOfOrigin et readExtraHostsByPlatform', () => {
  it('hostnameOfOrigin extrait le nom d’hôte d’une origine chrome.permissions', () => {
    expect(hostnameOfOrigin('https://ghes.example.corp/*')).toBe('ghes.example.corp');
    expect(hostnameOfOrigin('https://dev.azure.com/*')).toBe('dev.azure.com');
  });

  it('hostnameOfOrigin renvoie null sur une entrée non exploitable plutôt que de jeter', () => {
    expect(hostnameOfOrigin('not a url')).toBeNull();
  });

  it('sans chrome.permissions ni chrome.storage.local (tests, ou navigateur qui les omettrait) : listes vides', async () => {
    expect(await readExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('répartit les hôtes accordés selon leur étiquette de plateforme', async () => {
    installFakeChrome(
      ['https://ghes.example.corp/*', 'https://azdo.example.corp/*'],
      { 'ghes.example.corp': 'github', 'azdo.example.corp': 'azdo' }
    );
    expect(await readExtraHostsByPlatform()).toEqual({
      github: ['ghes.example.corp'],
      azdo: ['azdo.example.corp'],
    });
  });

  it('un hôte accordé mais NON étiqueté n’est transmis à aucun adaptateur — jamais deviné', async () => {
    // C’est le point qu’une lecture naïve de chrome.permissions.getAll() manquerait :
    // remonter cet hôte aux deux adaptateurs ferait toujours gagner GithubClientAdapter
    // (premier de la liste dans bootstrap()), même pour un domaine Azure DevOps Server.
    installFakeChrome(['https://untagged.example.corp/*'], {});
    expect(await readExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });

  it('une entrée hostPlatforms qui ne correspond plus à un octroi accordé est ignorée', async () => {
    // Permission retirée depuis chrome://extensions sans que l’étiquette locale ait été
    // nettoyée : readExtraHostsByPlatform part de perms.origins, pas de hostPlatforms.
    installFakeChrome([], { 'revoked.example.corp': 'github' });
    expect(await readExtraHostsByPlatform()).toEqual({ github: [], azdo: [] });
  });
});

describe('C — bootstrap() transmet bien le résultat aux deux constructeurs', () => {
  it('les hôtes étiquetés atteignent le bon adaptateur, ceux de l’autre plateforme n’y apparaissent pas', async () => {
    vi.resetModules();
    installFakeChrome(
      ['https://ghes.example.corp/*', 'https://azdo.example.corp/*'],
      { 'ghes.example.corp': 'github', 'azdo.example.corp': 'azdo' }
    );

    const githubCtorArgs: unknown[] = [];
    const azdoCtorArgs: unknown[] = [];
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        constructor(opts: unknown) {
          githubCtorArgs.push(opts);
        }
        matchesHost(): boolean {
          return false; // ni l'un ni l'autre ne doit correspondre : le test s'arrête avant tout rendu
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
      value: new URL('https://example.com/'), // hôte quelconque : aucun adaptateur ne doit matcher
      configurable: true,
    });
    await bootstrap(document);

    expect(githubCtorArgs).toEqual([{ documentRef: document, extraHosts: ['ghes.example.corp'] }]);
    expect(azdoCtorArgs).toEqual([{ documentRef: document, extraHosts: ['azdo.example.corp'] }]);

    vi.doUnmock('@cct/adapter-github');
    vi.doUnmock('@cct/adapter-azdo');
    vi.resetModules();
  });
});
