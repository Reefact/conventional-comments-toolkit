// @vitest-environment happy-dom
// §2, §A.4, §B.4 : le manifeste ne déclare AUCUN `content_scripts`, donc tout hôte accordé
// via `optional_host_permissions` — github.com compris — doit être enregistré
// dynamiquement, sinon l'adaptateur existe et est testé mais reste mort sur toute
// plateforme réelle. Ces tests reproduisent la mécanique chrome.scripting sans navigateur
// réel.

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
    getRegisteredContentScripts: ReturnType<typeof vi.fn>;
  };
}

/** `alreadyRegistered` : ce que le navigateur a GARDÉ d'une version précédente. Un
 * enregistrement dynamique survit à une mise à jour de l'extension alors que le code, lui,
 * est remplacé — ce faux serait faux sans cette mémoire, et le ménage qu'elle sert à tester
 * n'aurait aucun monde où se produire (CLAUDE.md, règle 2). */
function installFakeChrome(grantedOrigins: string[], alreadyRegistered: string[] = []): FakeChrome {
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
      getRegisteredContentScripts: vi.fn((cb: (s: { id: string }[]) => void) =>
        cb(alreadyRegistered.map((id) => ({ id })))
      ),
    },
  };
  (globalThis as { chrome?: unknown }).chrome = fake;
  return fake;
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
});

describe('résidu — §2/§A.4/§B.4 : le script de contenu s’enregistre dynamiquement, sans exception', () => {
  it('au démarrage, CHAQUE permission déjà accordée est enregistrée', async () => {
    const fake = installFakeChrome(['https://github.com/*', 'https://dev.azure.com/*']);
    const { scriptIdFor } = await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0)); // laisse la synchronisation asynchrone se dérouler

    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
    const registered = fake.scripting.registerContentScripts.mock.calls.map(
      ([scripts]) => (scripts as { id: string; matches: string[] }[])[0]
    );
    // L'identifiant est celui que `scriptIdFor()` produit, jamais une valeur recopiée :
    // figer un haché dans une attente ne testerait que ma capacité à le recopier.
    expect(registered).toEqual([
      {
        id: scriptIdFor('https://github.com/*'),
        matches: ['https://github.com/*'],
        js: ['content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
      },
      {
        id: scriptIdFor('https://dev.azure.com/*'),
        matches: ['https://dev.azure.com/*'],
        js: ['content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
      },
    ]);
  });

  // Ce test disait l'inverse : « github.com n'est jamais enregistré dynamiquement — déjà
  // couvert par content_scripts ». Le manifeste ne déclare plus aucun `content_scripts`, si
  // bien que l'exception d'hier serait aujourd'hui un hôte mort. Et c'est le SEUL chemin
  // par lequel sa révocation devient effective : un script encore enregistré continuerait
  // de s'injecter après le retrait de la permission.
  it('github.com s’enregistre comme les autres, et se désenregistre à la révocation', async () => {
    const fake = installFakeChrome(['https://github.com/*']);
    const { scriptIdFor } = await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(1);

    const onRemoved = fake.permissions.onRemoved.addListener.mock.calls[0]![0] as (p: {
      origins: string[];
    }) => void;
    onRemoved({ origins: ['https://github.com/*'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: [scriptIdFor('https://github.com/*')] },
      expect.any(Function)
    );
  });

  it('deux origines distinctes ne partagent JAMAIS un identifiant de script', async () => {
    // Le slug seul écrase toute suite de caractères non alphanumériques en un `-` :
    // `ghes.example.corp` et `ghes-example.corp` — deux noms d'intranet également
    // plausibles — rendaient le même identifiant. Le second enregistrement échouait comme
    // doublon, et révoquer l'un désenregistrait le script de l'autre (revue Codex, PR #60).
    installFakeChrome([]);
    const { scriptIdFor } = await import('../src/background.js');

    const colliding = [
      ['https://ghes.example.corp/*', 'https://ghes-example.corp/*'],
      ['https://github.com/*', 'https://github-com/*'],
    ];
    for (const [a, b] of colliding) {
      expect(scriptIdFor(a!)).not.toBe(scriptIdFor(b!));
    }
    // Et l'identifiant reste stable pour une même origine : c'est lui qui sert de clé de
    // désenregistrement, un identifiant instable ne retrouverait jamais son script.
    expect(scriptIdFor('https://github.com/*')).toBe(scriptIdFor('https://github.com/*'));
  });

  /** La synchronisation est appelée EXPLICITEMENT, après avoir remis les espions à zéro et
   * posé l'état enregistré voulu. S'en remettre à celle que l'import déclenche rendrait le
   * test dépendant d'une course : le `getRegisteredContentScripts` du faux serait interrogé
   * avant qu'un `mockImplementation` posé après l'import ne prenne effet, et l'assertion
   * passerait avec ET sans le ménage — donc ne prouverait rien (CLAUDE.md, règle 3). */
  async function syncWithRegistered(
    fake: FakeChrome,
    granted: string[],
    registeredIds: (idFor: (o: string) => string) => string[]
  ): Promise<(o: string) => string> {
    const { scriptIdFor, syncContentScriptsWithGrantedPermissions } = await import(
      '../src/background.js'
    );
    await new Promise((r) => setTimeout(r, 0)); // laisse la synchronisation de l'import finir
    fake.permissions.getAll.mockImplementation((cb: (p: { origins: string[] }) => void) =>
      cb({ origins: granted })
    );
    fake.scripting.getRegisteredContentScripts.mockImplementation((cb: (s: { id: string }[]) => void) =>
      cb(registeredIds(scriptIdFor).map((id) => ({ id })))
    );
    fake.scripting.registerContentScripts.mockClear();
    fake.scripting.unregisterContentScripts.mockClear();
    await syncContentScriptsWithGrantedPermissions();
    return scriptIdFor;
  }

  it('au démarrage, un enregistrement laissé par une version précédente est retiré', async () => {
    // Un enregistrement dynamique survit à une mise à jour de l'extension, alors que le
    // code est remplacé : les identifiants de l'ancienne version ne correspondent plus à
    // rien que la nouvelle sache nommer. Sans ce ménage, le même script s'injecterait deux
    // fois sur chaque page couverte.
    const fake = installFakeChrome([]);
    const scriptIdFor = await syncWithRegistered(fake, ['https://github.com/*'], () => [
      'cct-https-github-com', // l'ancien schéma, sans empreinte
      'cct-https-revoque-pendant-le-sommeil-du-worker',
    ]);

    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: ['cct-https-github-com', 'cct-https-revoque-pendant-le-sommeil-du-worker'] },
      expect.any(Function)
    );
    // …et l'origine toujours accordée est bien réenregistrée sous son identifiant courant.
    const [scripts] = fake.scripting.registerContentScripts.mock.calls[0]!;
    expect((scripts as { id: string }[])[0]!.id).toBe(scriptIdFor('https://github.com/*'));
  });

  it('un enregistrement encore valide n’est PAS retiré au démarrage', async () => {
    // Le ménage vise ce qui n'a plus de titre, pas ce qui en a un : désenregistrer puis
    // réenregistrer à chaque réveil du worker ouvrirait une fenêtre sans script.
    const fake = installFakeChrome([]);
    await syncWithRegistered(fake, ['https://github.com/*'], (idFor) => [
      idFor('https://github.com/*'),
    ]);

    expect(fake.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it('un enregistrement étranger à l’extension n’est jamais touché', async () => {
    // Le préfixe `cct-` n'est pas décoratif : `getRegisteredContentScripts()` rend TOUT ce
    // que l'extension a enregistré, et désenregistrer ce qui ne vient pas d'ici casserait
    // un mécanisme dont ce fichier n'a pas la charge.
    const fake = installFakeChrome([]);
    await syncWithRegistered(fake, [], () => ['autre-chose', 'ccx-presque']);

    expect(fake.scripting.unregisterContentScripts).not.toHaveBeenCalled();
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
    const { scriptIdFor } = await import('../src/background.js');
    await new Promise((r) => setTimeout(r, 0));

    const onRemoved = fake.permissions.onRemoved.addListener.mock.calls[0]![0] as (p: {
      origins: string[];
    }) => void;
    onRemoved({ origins: ['https://dev.azure.com/*'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(fake.scripting.unregisterContentScripts).toHaveBeenCalledWith(
      { ids: [scriptIdFor('https://dev.azure.com/*')] },
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
