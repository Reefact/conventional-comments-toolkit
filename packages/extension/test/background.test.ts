// @vitest-environment happy-dom
// §2, §A.4, §B.4 : le manifeste ne déclare AUCUN `content_scripts`, donc tout hôte accordé
// via `optional_host_permissions` — github.com compris — doit être enregistré
// dynamiquement, sinon l'adaptateur existe et est testé mais reste mort sur toute
// plateforme réelle. Ces tests reproduisent la mécanique chrome.scripting sans navigateur
// réel.


import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOST_PLATFORMS_KEY } from '../src/host-platform.js';

/** L'identifiant du script UNIQUE. Écrit ici en clair, à dessein : c'est un contrat avec
 * les versions installées, et le voir changer dans un diff est le seul moyen de se
 * rappeler que le ménage du démarrage doit alors retirer l'ancien. */
const SCRIPT_ID = 'cct-hosts';

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
    updateContentScripts: ReturnType<typeof vi.fn>;
    getRegisteredContentScripts: ReturnType<typeof vi.fn>;
  };
  storage: {
    local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
    managed: { get: ReturnType<typeof vi.fn> };
    onChanged: { addListener: ReturnType<typeof vi.fn> };
  };
  /** L'état que le faux fait mine de conserver, lisible par les assertions. */
  store: Record<string, unknown>;
}

/** `alreadyRegistered` : ce que le navigateur a GARDÉ d'une version précédente. Un
 * enregistrement dynamique survit à une mise à jour de l'extension alors que le code, lui,
 * est remplacé — ce faux serait faux sans cette mémoire, et le ménage qu'elle sert à tester
 * n'aurait aucun monde où se produire (CLAUDE.md, règle 2).
 *
 * Le stockage est ici pour la même raison : depuis que l'enregistrement suit la
 * CLASSIFICATION et non la seule permission, un faux sans `storage.local` décrirait un
 * monde où rien n'est jamais servi. */
function installFakeChrome(
  grantedOrigins: string[],
  tags: Record<string, string> = {},
  alreadyRegistered: string[] = []
): FakeChrome {
  const store: Record<string, unknown> = { [HOST_PLATFORMS_KEY]: { ...tags } };
  /** Ce que le navigateur a réellement enregistré à cet instant. */
  const live = new Map<string, { id: string }>(alreadyRegistered.map((id) => [id, { id }]));
  const fake: FakeChrome = {
    runtime: { onMessage: { addListener: vi.fn() }, lastError: null, openOptionsPage: vi.fn() },
    action: { onClicked: { addListener: vi.fn() } },
    permissions: {
      getAll: vi.fn((cb: (p: { origins: string[] }) => void) => cb({ origins: grantedOrigins })),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    scripting: {
      // STATEFUL, parce que le vrai l'est : `getRegisteredContentScripts()` rend ce qui a
      // été enregistré, pas une liste figée. Une première version de ce faux rendait
      // toujours `alreadyRegistered`, si bien que le code ne se voyait jamais lui-même
      // enregistré — et le retrait de l'enregistrement, quand plus rien n'est servi, n'avait
      // aucun monde où se produire (CLAUDE.md, règle 2).
      registerContentScripts: vi.fn((scripts: { id: string }[], cb: () => void) => {
        for (const script of scripts) live.set(script.id, script);
        cb();
      }),
      unregisterContentScripts: vi.fn((filter: { ids: string[] }, cb: () => void) => {
        for (const id of filter.ids) live.delete(id);
        cb();
      }),
      updateContentScripts: vi.fn((scripts: { id: string }[], cb: () => void) => {
        for (const script of scripts) live.set(script.id, script);
        cb();
      }),
      getRegisteredContentScripts: vi.fn((cb: (s: { id: string }[]) => void) =>
        cb([...live.values()])
      ),
    },
    storage: {
      local: {
        get: vi.fn((keys: string[], cb: (i: Record<string, unknown>) => void) => {
          const picked: Record<string, unknown> = {};
          for (const key of keys) if (key in store) picked[key] = store[key];
          cb(picked);
        }),
        set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items);
          cb?.();
        }),
      },
      managed: { get: vi.fn((cb: (i: Record<string, unknown>) => void) => cb({})) },
      onChanged: { addListener: vi.fn() },
    },
    store,
  };
  (globalThis as { chrome?: unknown }).chrome = fake;
  return fake;
}

/** Les `matches` du dernier enregistrement posé, quelle que soit la voie (register/update). */
function lastMatches(fake: FakeChrome): string[] | null {
  const calls = [
    ...fake.scripting.registerContentScripts.mock.calls,
    ...fake.scripting.updateContentScripts.mock.calls,
  ];
  const last = calls.at(-1);
  return last ? ((last[0] as { matches: string[] }[])[0]?.matches ?? null) : null;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
});

describe('§2, §A.4, §B.4 — UN SEUL script enregistré, sur les hôtes réellement servis', () => {
  it('au démarrage, les hôtes classés forment les `matches` d’un enregistrement unique', async () => {
    const fake = installFakeChrome(
      ['https://github.com/*', 'https://dev.azure.com/*'],
      { 'github.com': 'github', 'dev.azure.com': 'azdo' }
    );
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const [scripts] = fake.scripting.registerContentScripts.mock.calls[0]!;
    expect(scripts).toEqual([
      {
        id: SCRIPT_ID,
        matches: ['https://github.com/*', 'https://dev.azure.com/*'],
        js: ['content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
      },
    ]);
  });

  it('DEUX motifs qui se recouvrent ne font qu’un enregistrement — sinon double injection', async () => {
    // Le défaut que ce contrat supprime : un enregistrement par origine, deux motifs
    // couvrant la même page, donc `content.js` injecté deux fois. `bootstrap()` n'étant pas
    // idempotent, l'interface s'y dédoublait (revue Reefact, PR #60). Un script unique
    // s'injecte une fois par document, quel que soit le nombre de ses motifs qui matchent.
    const fake = installFakeChrome(
      ['https://*.corp.example/*', 'https://ghes.corp.example/*'],
      { '*.corp.example': 'github', 'ghes.corp.example': 'github' }
    );
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    expect(lastMatches(fake)).toEqual(['https://*.corp.example/*', 'https://ghes.corp.example/*']);
  });

  it('un octroi LARGE n’est jamais enregistré — il n’est classé pour aucune plateforme', async () => {
    // Le motif que le manifeste déclare en `optional_host_permissions` couvre toutes les
    // origines https. Enregistré, il injectait le script sur TOUTE page https, où il ne
    // pouvait ensuite rien faire faute d'étiquette (revue Reefact, PR #60).
    const fake = installFakeChrome(['https://*/*', 'https://github.com/*'], {
      'github.com': 'github',
    });
    await import('../src/background.js');
    await settle();

    expect(lastMatches(fake)).toEqual(['https://github.com/*']);
  });

  it('un hôte accordé mais NON classé n’est pas injecté', async () => {
    const fake = installFakeChrome(['https://mystere.example.corp/*'], {});
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('un hôte classé `config` non plus : il sert un configUrl, lu par le worker', async () => {
    const fake = installFakeChrome(['https://conf.example.corp/*'], {
      'conf.example.corp': 'config',
    });
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('quand plus rien n’est servi, l’enregistrement est retiré', async () => {
    const fake = installFakeChrome([], {}, [SCRIPT_ID]);
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: [SCRIPT_ID] },
      expect.any(Function)
    );
  });

  it('un enregistrement déjà en place est mis à JOUR, pas défait puis refait', async () => {
    // Désenregistrer avant de réenregistrer ouvrirait, à chaque changement d'étiquette, une
    // fenêtre où plus aucun hôte n'est servi.
    const fake = installFakeChrome(['https://github.com/*'], { 'github.com': 'github' }, [SCRIPT_ID]);
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.updateContentScripts).toHaveBeenCalledTimes(1);
    expect(fake.scripting.unregisterContentScripts).not.toHaveBeenCalled();
    expect(lastMatches(fake)).toEqual(['https://github.com/*']);
  });

  it('les enregistrements d’une version précédente sont retirés au démarrage', async () => {
    // Un enregistrement dynamique survit à une mise à jour de l'extension alors que le code
    // est remplacé : les identifiants par origine des versions antérieures ne correspondent
    // plus à rien que celle-ci sache nommer, et continueraient d'injecter à côté du nôtre.
    const fake = installFakeChrome(['https://github.com/*'], { 'github.com': 'github' }, [
      'cct-https-github-com',
      'cct-https-github-com-31qzlh',
    ]);
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: ['cct-https-github-com', 'cct-https-github-com-31qzlh'] },
      expect.any(Function)
    );
    expect(lastMatches(fake)).toEqual(['https://github.com/*']); // et le nôtre est bien posé
  });

  it('un enregistrement étranger à l’extension n’est jamais touché', async () => {
    // `getRegisteredContentScripts()` rend TOUT ce que l'extension a enregistré : le préfixe
    // `cct-` n'est pas décoratif, il borne ce que ce ménage s'autorise à défaire.
    const fake = installFakeChrome([], {}, ['autre-chose', 'ccx-presque']);
    await import('../src/background.js');
    await settle();

    expect(fake.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it('un octroi ultérieur (page d’options) enregistre dès que l’hôte est classé', async () => {
    const fake = installFakeChrome([], {});
    await import('../src/background.js');
    await settle();
    fake.scripting.registerContentScripts.mockClear();

    // La page d'options accorde PUIS étiquette : les deux événements arrivent, et c'est le
    // second qui rend l'hôte servi.
    fake.permissions.getAll.mockImplementation((cb: (p: { origins: string[] }) => void) =>
      cb({ origins: ['https://ghes.example.corp/*'] })
    );
    const onAdded = fake.permissions.onAdded.addListener.mock.calls[0]![0] as (p: {
      origins: string[];
    }) => void;
    onAdded({ origins: ['https://ghes.example.corp/*'] });
    await settle();
    expect(fake.scripting.registerContentScripts).not.toHaveBeenCalled(); // pas encore classé

    fake.store[HOST_PLATFORMS_KEY] = { 'ghes.example.corp': 'github' };
    const onChanged = fake.storage.onChanged.addListener.mock.calls[0]![0] as (
      c: Record<string, unknown>,
      area: string
    ) => void;
    onChanged({ [HOST_PLATFORMS_KEY]: {} }, 'local');
    await settle();

    expect(lastMatches(fake)).toEqual(['https://ghes.example.corp/*']);
  });

  it('une révocation EXTERNE oublie aussi l’étiquette de l’hôte', async () => {
    // La purge ne vivait que dans le bouton « Retirer » de la page d'options. Révoqué depuis
    // `chrome://extensions`, l'hôte gardait son étiquette : le réautoriser par ce même biais
    // retrouvait silencieusement l'ancienne classification et rallumait l'adaptateur, au
    // lieu de reparaître dans « Domaines non configurés » (revue Reefact, PR #60).
    const fake = installFakeChrome(['https://ghes.example.corp/*'], {
      'ghes.example.corp': 'github',
      'autre.example.corp': 'azdo',
    });
    await import('../src/background.js');
    await settle();

    fake.permissions.getAll.mockImplementation((cb: (p: { origins: string[] }) => void) =>
      cb({ origins: [] })
    );
    const onRemoved = fake.permissions.onRemoved.addListener.mock.calls[0]![0] as (p: {
      origins: string[];
    }) => void;
    onRemoved({ origins: ['https://ghes.example.corp/*'] });
    await settle();

    // L'hôte révoqué perd son étiquette ; les autres gardent la leur.
    expect(fake.store[HOST_PLATFORMS_KEY]).toEqual({ 'autre.example.corp': 'azdo' });
    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: [SCRIPT_ID] },
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
    const fake = installFakeChrome(['https://dev.azure.com/*'], { 'dev.azure.com': 'azdo' });
    delete (fake as Partial<FakeChrome>).action;

    await expect(import('../src/background.js')).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  });
});
