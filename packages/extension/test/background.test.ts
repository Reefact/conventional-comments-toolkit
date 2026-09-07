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
    onInstalled: { addListener: ReturnType<typeof vi.fn> };
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
    executeScript: ReturnType<typeof vi.fn>;
    insertCSS: ReturnType<typeof vi.fn>;
  };
  tabs: { query: ReturnType<typeof vi.fn> };
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
  alreadyRegistered: string[] = [],
  openTabs: string[] = []
): FakeChrome {
  const store: Record<string, unknown> = { [HOST_PLATFORMS_KEY]: { ...tags } };
  /** Ce que le navigateur a réellement enregistré à cet instant. */
  const live = new Map<string, { id: string }>(alreadyRegistered.map((id) => [id, { id }]));
  const tabsById = openTabs.map((url, index) => ({ id: index + 1, url }));
  /** Les onglets qui portent le marqueur du script de contenu, à cet instant. */
  const marked = new Set<number>();
  const fake: FakeChrome = {
    runtime: {
      onMessage: { addListener: vi.fn() },
      lastError: null,
      openOptionsPage: vi.fn(),
      onInstalled: { addListener: vi.fn() },
    },
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
      // STATEFUL, et pour la même raison que le reste de ce faux : le worker DEMANDE
      // désormais à l'onglet s'il a déjà le script, et un faux qui répondrait toujours la
      // même chose décrirait un monde où la question ne sert à rien. Le marqueur suit donc
      // les injections que le faux a réellement subies — c'est ce qui donne au second appel
      // un monde où ne rien faire.
      executeScript: vi.fn(
        (
          injection: { target: { tabId: number }; files?: string[]; func?: () => unknown },
          cb?: (results?: { result?: unknown }[]) => void
        ) => {
          if (injection.func) return cb?.([{ result: marked.has(injection.target.tabId) }]);
          marked.add(injection.target.tabId);
          cb?.();
        }
      ),
      insertCSS: vi.fn((_injection: unknown, cb?: () => void) => cb?.()),
    },
    // Le filtre `url` de `tabs.query` est ici parce que le vrai le fait : rendre TOUS les
    // onglets quels que soient les motifs décrirait un monde où l'on injecte partout, et
    // où le test ne pourrait pas voir la différence entre « les onglets servis » et « les
    // onglets ». Le filtrage reste volontairement littéral — un motif de correspondance
    // Chrome, pas une URL — et sa fidélité au navigateur n'est PAS ce que ce faux prétend
    // établir : c'est `spikes/open-tab-injection.mjs` qui mesure que ce filtre existe et
    // fonctionne sans la permission `tabs`.
    tabs: {
      query: vi.fn((filter: { url: string[] }, cb: (t: { id: number }[]) => void) => {
        const patterns = filter.url.map(
          (pattern) =>
            new RegExp(
              `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
            )
        );
        cb(
          tabsById
            .filter(({ url }) => patterns.some((re) => re.test(url)))
            .map(({ id }) => ({ id }))
        );
      }),
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


describe('rattrapage des onglets déjà ouverts', () => {
  // Un enregistrement dynamique ne s'applique qu'aux chargements SUIVANTS : l'onglet déjà
  // chargé ne reçoit rien. Mesuré dans un vrai Chromium par
  // `spikes/open-tab-injection.mjs` — ce que ces tests-ci ne prétendent pas établir. Ils
  // vérifient la CONSÉQUENCE dans ce code : que le worker injecte explicitement, et sur les
  // bons onglets seulement.
  //
  // C'est le parcours principal du produit : on ouvre les réglages depuis un onglet de
  // plateforme, et c'est cet onglet-là qui vient d'être autorisé. Sans rattrapage il reste
  // inerte jusqu'à un rechargement, et le `watchExtraHosts()` du script de contenu ne peut
  // rien y faire — aucun script n'y est présent pour observer le changement.

  /** Les injections de FICHIER, la sonde « cet onglet l'a-t-il déjà ? » exclue : les deux
   * passent par `executeScript`, et les confondre ferait compter une question pour une
   * réponse. */
  function fileInjections(fake: FakeChrome): { target: { tabId: number }; files?: string[] }[] {
    return fake.scripting.executeScript.mock.calls
      .map(([injection]) => injection as { target: { tabId: number }; files?: string[]; func?: unknown })
      .filter((injection) => injection.files !== undefined);
  }

  it('injecte JS et CSS dans un onglet déjà ouvert que l’enregistrement vient de couvrir', async () => {
    const fake = installFakeChrome(
      ['https://github.com/*'],
      { 'github.com': 'github' },
      [],
      ['https://github.com/acme/repo/pull/7']
    );

    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));

    expect(fileInjections(fake)).toEqual([{ target: { tabId: 1 }, files: ['content.js'] }]);
    expect(fake.scripting.insertCSS).toHaveBeenCalledWith(
      { target: { tabId: 1 }, files: ['styles.css'] },
      expect.any(Function)
    );
  });

  it('laisse tranquilles les onglets que l’enregistrement ne couvre pas', async () => {
    // Le pendant indispensable du test précédent : injecter dans TOUS les onglets ouverts
    // le ferait passer tout aussi bien, en rétablissant exactement ce que l'enregistrement
    // unique avait supprimé — un script sur des pages qu'aucun adaptateur ne sert.
    const fake = installFakeChrome(
      ['https://github.com/*'],
      { 'github.com': 'github' },
      [],
      ['https://exemple.invalid/page', 'https://github.com/acme/repo']
    );

    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));

    expect(fileInjections(fake)).toEqual([{ target: { tabId: 2 }, files: ['content.js'] }]);
  });

  it('n’injecte nulle part quand plus aucun hôte n’est servi', async () => {
    // Le retrait de l'enregistrement passe par le même chemin ; y interroger les onglets
    // avec une liste de motifs VIDE rendrait, côté navigateur, tous les onglets.
    const fake = installFakeChrome([], {}, [], ['https://github.com/acme/repo']);

    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.tabs.query).not.toHaveBeenCalled();
    expect(fake.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('ne réinjecte RIEN dans un onglet qu’il a déjà rattrapé', async () => {
    // Le défaut que ce test verrouille : `applyRegistration()` repasse à chaque réveil du
    // worker et à chaque republication des hôtes, et le rattrapage reparcourait alors tous
    // les onglets servis. Le marqueur de `content.ts` protège `bootstrap()`, mais PAS la
    // feuille de style — `insertCSS` s'empile, et trois insertions identiques demandent
    // trois `removeCSS` pour disparaître (mesuré dans `spikes/open-tab-injection.mjs`). Un
    // onglet GitHub laissé ouvert accumulait donc une copie de `styles.css` par réveil.
    const fake = installFakeChrome(
      ['https://github.com/*'],
      { 'github.com': 'github' },
      [],
      ['https://github.com/acme/repo']
    );

    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));
    expect(fileInjections(fake)).toHaveLength(1);
    expect(fake.scripting.insertCSS).toHaveBeenCalledTimes(1);

    // Une republication, telle qu'en produit un changement d'étiquette ou un réveil.
    const onChanged = fake.storage.onChanged.addListener.mock.calls[0]![0] as (
      c: Record<string, unknown>,
      area: string
    ) => void;
    onChanged({ [HOST_PLATFORMS_KEY]: {} }, 'local');
    await new Promise((r) => setTimeout(r, 0));

    expect(fileInjections(fake)).toHaveLength(1);
    expect(fake.scripting.insertCSS).toHaveBeenCalledTimes(1);
  });

  it('rattrape un onglet ouvert APRÈS le premier passage', async () => {
    // Le pendant du test précédent, et ce qui l'empêche d'être satisfait par un rattrapage
    // qui ne s'exécuterait qu'une fois : la sonde porte sur l'ONGLET, pas sur le passage.
    const fake = installFakeChrome(
      ['https://github.com/*'],
      { 'github.com': 'github' },
      [],
      ['https://github.com/acme/repo']
    );

    await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));
    expect(fileInjections(fake)).toHaveLength(1);

    fake.tabs.query.mockImplementation(
      (_filter: { url: string[] }, cb: (t: { id: number }[]) => void) => cb([{ id: 1 }, { id: 2 }])
    );
    const onChanged = fake.storage.onChanged.addListener.mock.calls[0]![0] as (
      c: Record<string, unknown>,
      area: string
    ) => void;
    onChanged({ [HOST_PLATFORMS_KEY]: {} }, 'local');
    await new Promise((r) => setTimeout(r, 0));

    expect(fileInjections(fake)).toEqual([
      { target: { tabId: 1 }, files: ['content.js'] },
      { target: { tabId: 2 }, files: ['content.js'] },
    ]);
  });

  it('un navigateur sans `tabs` ni `executeScript` enregistre quand même', async () => {
    // Le rattrapage est un SUPPLÉMENT. Une variante qui n'offrirait pas ces API doit garder
    // le comportement d'avant — enregistrement pour les chargements suivants — plutôt que
    // d'échouer et de ne rien enregistrer du tout.
    const fake = installFakeChrome(
      ['https://github.com/*'],
      { 'github.com': 'github' },
      [],
      ['https://github.com/acme/repo']
    );
    delete (fake as Partial<FakeChrome>).tabs;
    delete (fake.scripting as Partial<FakeChrome['scripting']>).executeScript;

    await expect(import('../src/background.js')).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  });
});


describe('premier lancement : amener aux réglages', () => {
  // Depuis qu'aucun hôte n'est pré-déclaré dans le manifeste, une extension fraîchement
  // installée ne fait rien nulle part tant que personne n'a autorisé un domaine — sans
  // erreur, sans icône barrée, donc sans rien qui l'explique. C'est aussi la seule migration
  // possible pour qui met à jour : `permissions.request()` exige un geste humain, qu'un
  // service worker ne peut pas produire.

  function fireInstall(fake: FakeChrome, reason: string): void {
    const listener = fake.runtime.onInstalled.addListener.mock.calls[0]![0] as (d: {
      reason: string;
    }) => void;
    listener({ reason });
  }

  it('une INSTALLATION ouvre la page d’options', async () => {
    const fake = installFakeChrome([]);
    await import('../src/background.js');

    fireInstall(fake, 'install');

    expect(fake.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('une MISE À JOUR sans aucun domaine accordé l’ouvre aussi', async () => {
    // Le cas de la migration : l'utilisateur avait github.com par le manifeste, la mise à
    // jour le lui retire, et il n'a plus rien.
    const fake = installFakeChrome([]);
    await import('../src/background.js');

    fireInstall(fake, 'update');
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('une MISE À JOUR avec un domaine déjà accordé n’ouvre RIEN', async () => {
    // Sans cette condition, chaque mise à jour automatique du store ouvrirait un onglet à
    // quelqu'un qui n'a rien demandé et n'a rien à y faire.
    const fake = installFakeChrome(['https://github.com/*'], { 'github.com': 'github' });
    await import('../src/background.js');

    fireInstall(fake, 'update');
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it('une raison étrangère à l’extension n’ouvre rien', async () => {
    const fake = installFakeChrome([]);
    await import('../src/background.js');

    fireInstall(fake, 'chrome_update');
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});
