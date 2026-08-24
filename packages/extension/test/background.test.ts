// @vitest-environment happy-dom
// §2, §A.4, §B.4 : sur un hôte accordé via `optional_host_permissions` autre que
// github.com (statiquement couvert par `content_scripts`), le script de contenu doit
// être enregistré dynamiquement — sinon l'adaptateur AzDO/GHES existe et est testé, mais
// reste mort sur toute plateforme réelle. Ces tests reproduisent la mécanique
// chrome.scripting sans navigateur réel.

import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeChrome {
  runtime: {
    onMessage: { addListener: ReturnType<typeof vi.fn> };
    lastError: null;
    openOptionsPage: ReturnType<typeof vi.fn>;
  };
  action: { onClicked: { addListener: ReturnType<typeof vi.fn> } };
  permissions: {
    getAll: ReturnType<typeof vi.fn>;
    onAdded: { addListener: ReturnType<typeof vi.fn> };
    onRemoved: { addListener: ReturnType<typeof vi.fn> };
  };
  scripting: {
    registerContentScripts: ReturnType<typeof vi.fn>;
    unregisterContentScripts: ReturnType<typeof vi.fn>;
  };
}

function installFakeChrome(grantedOrigins: string[]): FakeChrome {
  const fake: FakeChrome = {
    runtime: { onMessage: { addListener: vi.fn() }, lastError: null, openOptionsPage: vi.fn() },
    action: { onClicked: { addListener: vi.fn() } },
    permissions: {
      getAll: vi.fn((cb: (p: { origins: string[] }) => void) => cb({ origins: grantedOrigins })),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    scripting: {
      registerContentScripts: vi.fn((_scripts: unknown, cb: () => void) => cb()),
      unregisterContentScripts: vi.fn((_filter: unknown, cb: () => void) => cb()),
    },
  };
  (globalThis as { chrome?: unknown }).chrome = fake;
  return fake;
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
});

describe('résidu — §2/§A.4/§B.4 : le script de contenu s’enregistre dynamiquement hors github.com', () => {
  it('au démarrage, chaque permission déjà accordée (hors github.com) est enregistrée', async () => {
    const fake = installFakeChrome(['https://github.com/*', 'https://dev.azure.com/*']);
    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0)); // laisse la synchronisation asynchrone se dérouler

    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const [scripts] = fake.scripting.registerContentScripts.mock.calls[0]!;
    expect(scripts).toEqual([
      {
        id: 'cct-https-dev-azure-com',
        matches: ['https://dev.azure.com/*'],
        js: ['content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
      },
    ]);
  });

  it('github.com n’est jamais enregistré dynamiquement — déjà couvert par content_scripts', async () => {
    const fake = installFakeChrome(['https://github.com/*']);
    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('un octroi ultérieur (page d’options) déclenche l’enregistrement immédiat', async () => {
    const fake = installFakeChrome([]);
    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));

    const onAdded = fake.permissions.onAdded.addListener.mock.calls[0]![0] as (p: {
      origins: string[];
    }) => void;
    onAdded({ origins: ['https://ghes.example.corp/*'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const [scripts] = fake.scripting.registerContentScripts.mock.calls[0]!;
    expect((scripts as { matches: string[] }[])[0]!.matches).toEqual(['https://ghes.example.corp/*']);
  });

  it('un retrait de permission désenregistre le script correspondant', async () => {
    const fake = installFakeChrome([]);
    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));

    const onRemoved = fake.permissions.onRemoved.addListener.mock.calls[0]![0] as (p: {
      origins: string[];
    }) => void;
    onRemoved({ origins: ['https://dev.azure.com/*'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: ['cct-https-dev-azure-com'] },
      expect.any(Function)
    );
  });
});

describe('bouton de la barre d’outils : le clic amène aux réglages', () => {
  it('un clic sur l’icône ouvre la page d’options', async () => {
    // Sans ce gestionnaire, l'icône déclarée par `action` serait un bouton inerte : le
    // manifeste n'ouvre `options_ui` que depuis la page de gestion des extensions.
    const fake = installFakeChrome([]);
    await import('../src/background.js');

    const onClicked = fake.action.onClicked.addListener.mock.calls[0]![0] as () => void;
    onClicked();

    expect(fake.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('un navigateur sans API `action` ne fait pas échouer le démarrage', async () => {
    // `chrome.action` manque sur toute variante qui ignorerait la clé du manifeste ; le
    // service worker doit continuer à assurer ses deux autres rôles.
    const fake = installFakeChrome(['https://dev.azure.com/*']);
    delete (fake as Partial<FakeChrome>).action;

    await expect(import('../src/background.js')).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  });
});
