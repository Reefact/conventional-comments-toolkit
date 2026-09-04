// @vitest-environment happy-dom
//
// LA LECTURE DE LA CONFIGURATION DE DÉPÔT (§8.2, niveau 3) — et pourquoi elle part en
// `same-origin`.
//
// Ce niveau n'a JAMAIS été lisible sur GitHub. La route `raw` de github.com redirige vers
// `raw.githubusercontent.com` dès que le fichier existe, cette origine répond
// `Access-Control-Allow-Origin: *`, et le navigateur refuse le joker quand la requête porte
// `credentials: 'include'`. Le `fetch` levait, la lecture rendait `unreachable`, et tout
// dépôt POSSÉDANT une configuration affichait l'état dégradé du §5.4 — l'inverse exact de ce
// que deux documents de ce dépôt affirmaient.
//
// `same-origin` et non `omit` : mesuré, le PREMIER saut part avec la session — GitHub
// autorise — et la redirection, qui franchit une origine, n'emporte plus les cookies, si bien
// que le joker est accepté. Un dépôt privé reste donc lisible, sans permission d'hôte.
//
// Le mécanisme est mesuré dans un vrai navigateur par `npm run check:content-script-cors` ;
// ce test-ci verrouille ce que le code envoie, qui est la seule moitié qu'un test unitaire
// peut tenir.

import { describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import type { PrRef } from '@cct/core';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function adapterWith(reply: (url: string) => Response): {
  adapter: GithubClientAdapter;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply(String(url));
  }) as unknown as typeof fetch;
  return {
    adapter: new GithubClientAdapter({ documentRef: document, fetchImpl }),
    calls,
  };
}

describe('§8.2 — lecture de la configuration de dépôt sur GitHub', () => {
  it('part en `same-origin` : authentifiée au premier saut, anonyme après la redirection', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getRepoConfig(pr);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://github.com/acme/demo/raw/HEAD/.conventional-comments.json');
    // `include` renvoie la lecture dans le mur mesuré : ACAO `*` + cookies = refus.
    expect(calls[0]!.init?.credentials).toBe('same-origin');
  });

  it('un fichier absent (404) reste un cas nominal, jamais une dégradation (§10)', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
  });

  // Un refus explicite est une lecture impossible, jamais un fichier absent. Lequel des deux
  // codes GitHub renvoie sur un dépôt privé lu sans session n'a pas pu être mesuré ici (le
  // proxy de l'environnement répond à sa place) : le 403 est couvert ici, le 404 masqué l'est
  // par le bloc suivant.
  it('un refus explicite (403) est une lecture impossible, pas un fichier absent', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 403 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'unreachable', reason: 'HTTP 403' });
  });

  // Le retrait des cookies vaut pour la route mesurée, pas pour tous les hôtes : sur un GHES
  // accepté par `extraHosts`, aucune redirection hors origine n'a été observée, et la session
  // est ce qui rend lisible la configuration d'un dépôt privé (revue Codex, PR #36, P1).
  it("un GitHub Enterprise Server garde sa session : la redirection mesurée est celle de github.com", async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getRepoConfig({ ...pr, host: 'github.acme.com' });

    expect(calls[0]!.url).toBe(
      'https://github.acme.com/acme/demo/raw/HEAD/.conventional-comments.json',
    );
    expect(calls[0]!.init?.credentials).toBe('include');
  });
});

// La lecture du `configUrl` d'organisation (§8.1.1) tombe dans le même piège dès que l'URL
// est de même origine que la page : `relayableFrom()` décline alors le relais — à raison, le
// worker n'a pas de permission d'hôte — et la lecture directe partait avec ses cookies.
describe('§8.1.1 — lecture du configUrl d\'organisation', () => {
  it('un configUrl `raw` sur github.com part en `same-origin`, comme celui du dépôt', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getOrgConfig('https://github.com/acme/config/raw/HEAD/cc.json');

    expect(calls[0]!.init?.credentials).toBe('same-origin');
  });

  it('un configUrl hors de cette route garde sa session', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getOrgConfig('https://config.acme.com/cc.json');

    expect(calls[0]!.init?.credentials).toBe('include');
  });

  // Le `configUrl` désigne un AUTRE dépôt que celui affiché : la page ne dit pas sa visibilité,
  // et l'astuce du bloc précédent n'est pas transposable. Sans moyen de distinguer un fichier
  // supprimé d'une ressource masquée, on refuse de conclure « pas de configuration ».
  it('un 404 lu sans session ne prouve pas l\'absence : la lecture est déclarée impossible', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getOrgConfig('https://github.com/acme/config/raw/HEAD/cc.json')).toEqual({
      status: 'unreachable',
      reason: "HTTP 404 (absence indiscernable d'un accès refusé)",
    });
  });

  // Le vrai cas nominal est ailleurs, et reste intact : aucune URL déclarée.
  it("aucun configUrl déclaré reste un cas nominal", async () => {
    const { adapter, calls } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getOrgConfig(null)).toEqual({ status: 'absent' });
    expect(calls).toHaveLength(0);
  });

  // Là où la session part avec la requête, un 404 garde son sens ordinaire.
  it("un configUrl lu AVEC session lit un 404 comme un fichier absent", async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getOrgConfig('https://config.acme.com/cc.json')).toEqual({
      status: 'absent',
    });
  });

  it("une page HTML de github.com n'est pas la route `raw` : elle garde sa session", async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getOrgConfig('https://github.com/acme/config/blob/HEAD/cc.json');

    expect(calls[0]!.init?.credentials).toBe('include');
  });
});

// UN 404 NE DIT PAS TOUJOURS « PAS DE FICHIER ». Lue sans session, une ressource privée est
// masquée par GitHub : le serveur répond comme pour un dépôt inexistant. Classer cela
// `absent` mettrait `degraded: false` en cache et ferait AFFIRMER à l'extension qu'elle a lu
// la configuration du dépôt (revue Codex, PR #36, round 2).
//
// Le marqueur de visibilité est MESURÉ sur une page réelle de github.com (2026-09) :
// `<meta name="octolytics-dimension-repository_public" content="true">`, en un exemplaire,
// et un badge `<span class="Label Label--secondary ...">Public</span>` dont les classes sont
// partagées par d'autres badges (« Bot ») — d'où le filtrage par texte.
describe('§8.2 — un 404 sans session, sur un dépôt privé, n\'est pas un fichier absent', () => {
  function withMarkup(html: string) {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  it('dépôt privé (méta) : la lecture est impossible, pas nominale', async () => {
    withMarkup(
      '<meta name="user-login" content="">' +
        '<meta name="octolytics-dimension-repository_public" content="false">',
    );
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({
      status: 'unreachable',
      reason: 'HTTP 404 (dépôt privé : absence indiscernable)',
    });
  });

  it('dépôt public (méta) : un fichier absent reste un cas nominal (§10)', async () => {
    withMarkup('<meta name="octolytics-dimension-repository_public" content="true">');
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
  });

  it('repli par le badge visible, filtré par texte et non par classe', async () => {
    withMarkup(
      '<meta name="user-login" content="">' +
        '<span class="Label Label--secondary">Bot</span>' +
        '<span class="Label Label--secondary v-align-middle mr-1">Private</span>',
    );
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({
      status: 'unreachable',
      reason: 'HTTP 404 (dépôt privé : absence indiscernable)',
    });
  });

  // Le défaut sûr : sans preuve POSITIVE de dépôt privé, le comportement est celui d'avant.
  // Une pourriture de sélecteur ne peut donc pas faire apparaître un bandeau sur les dépôts
  // publics, qui sont le cas courant — elle se contente d'être tracée (§9.4, CA-11).
  it('visibilité inconnue : `absent`, et la dégradation est journalisée', async () => {
    withMarkup('<span class="Label Label--secondary">Bot</span>');
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
    expect(adapter.log.failures.map((f) => f.chain)).toContain('repository-public-meta');
  });

  // La question ne se pose que pour la lecture sans session : sur un GHES, la requête porte
  // les cookies, et un 404 y garde son sens ordinaire.
  it("un hôte qui garde sa session lit un 404 comme un fichier absent", async () => {
    withMarkup('<meta name="octolytics-dimension-repository_public" content="false">');
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig({ ...pr, host: 'github.acme.com' })).toEqual({
      status: 'absent',
    });
  });
});

// ...ET LA SESSION EST LE SECOND SIGNAL, celui qui manquait. Le masque de GitHub n'existe que
// pour une requête ANONYME : session ouverte, le premier saut part authentifié (`same-origin`)
// et le 404 dit ce qu'il dit. Sans cette condition, le reclassement dépendait du seul capteur
// de visibilité — un capteur de PAGE, donc faillible, et il a effectivement menti : sur un
// dépôt PUBLIC, une page de PR connectée a fait répondre `false` à `#repoIsPublic()`, le 404
// nominal est devenu `unreachable`, et le bandeau du §5.4 s'affichait sur un dépôt SANS
// configuration — le cas le plus courant qui soit. Deux capteurs indépendants doivent
// maintenant dire oui pour que le reclassement ait lieu.
//
// `meta[name="user-login"]` est MESURÉ sur une page réelle de github.com (2026-09) : présent
// avec `content=""` pour un visiteur déconnecté, renseigné dès qu'une session existe. C'est le
// même sélecteur que `getCurrentUser()`.
describe('§8.2 — une session ouverte rend au 404 son sens ordinaire', () => {
  function withMarkup(html: string) {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  it('session ouverte + dépôt dit privé : le 404 reste un fichier absent', async () => {
    withMarkup(
      '<meta name="user-login" content="octocat">' +
        '<meta name="octolytics-dimension-repository_public" content="false">',
    );
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
  });

  // Le défaut livré, réduit à sa forme minimale : un badge lu « Private » sur un dépôt public.
  // Sans le capteur de session, ce test rend `unreachable` et l'utilisateur voit le bandeau.
  it('session ouverte + capteur de visibilité qui ment : toujours un fichier absent', async () => {
    withMarkup(
      '<meta name="user-login" content="octocat">' +
        '<span class="Label Label--secondary">Private</span>',
    );
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
  });

  // LE FINDING DE REVUE (Reefact, PR #48), en test. Le capteur de session doit être POSITIF :
  // traité comme « pas de session » lorsqu'il ne sait pas répondre, un sélecteur pourri suffisait
  // à simuler une déconnexion — et, combiné au capteur de visibilité qu'on vient de mesurer
  // faillible, à ressusciter le bandeau sur un dépôt public. Deux signaux dont l'un se contente
  // de son propre silence, cela n'en fait qu'un.
  it('méta de session ABSENT (signal inconnu) : pas de reclassement, même dépôt dit privé', async () => {
    withMarkup('<meta name="octolytics-dimension-repository_public" content="false">');
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
  });

  // La protection reste entière là où elle sert : sans session, un 404 sur un dépôt privé est
  // indiscernable d'un accès refusé.
  it('méta de session vide (visiteur déconnecté) : le reclassement s\'applique', async () => {
    withMarkup(
      '<meta name="user-login" content="">' +
        '<meta name="octolytics-dimension-repository_public" content="false">',
    );
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({
      status: 'unreachable',
      reason: 'HTTP 404 (dépôt privé : absence indiscernable)',
    });
  });
});


// LE RECEVEUR DE `fetch` — le défaut qui rendait TOUTE lecture impossible, sur tout dépôt.
//
// L'adaptateur rangeait le `fetch` global dans un champ privé et l'appelait comme méthode :
// `this.#fetch(url, init)` passe donc l'instance en receveur. Dans le monde isolé d'un script
// de contenu, Chromium refuse — « Failed to execute 'fetch' on 'Window': Illegal invocation ».
// Chaque lecture levait, rendait `unreachable`, et le bandeau du §5.4 s'affichait en
// permanence, avec ou sans fichier de configuration.
//
// CE TEST NE PROUVE PAS L'ENVIRONNEMENT, et c'est important de le dire : le `fetch` posé
// ci-dessous est un faux, donc une AFFIRMATION sur le navigateur. L'affirmation est mesurée
// ailleurs, dans un vrai script de contenu, par `npm run check:content-script-cors` (« `fetch`
// rangé dans un champ et appelé comme méthode LÈVE dans le monde isolé »). Ce test-ci est le
// verrou rapide qui empêche le code de repartir en arrière entre deux passages du spike.
describe('§8.2 — le `fetch` global est appelé avec SON receveur, jamais avec l\'adaptateur', () => {
  /** Le contrôle de receveur que fait un vrai `fetch` de navigateur, et rien d'autre. */
  function withBrandCheckedFetch<T>(run: (seen: unknown[]) => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    const receivers: unknown[] = [];
    globalThis.fetch = function (this: unknown) {
      receivers.push(this);
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response('', { status: 404 }));
    } as unknown as typeof fetch;
    return run(receivers).finally(() => {
      globalThis.fetch = original;
    });
  }

  it('sans `fetchImpl`, la lecture aboutit — et le receveur n\'est pas l\'adaptateur', async () => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    await withBrandCheckedFetch(async (receivers) => {
      // PAS de `fetchImpl` : c'est le chemin de production, le seul où le défaut existait.
      const adapter = new GithubClientAdapter({ documentRef: document });
      expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
      expect(receivers).toHaveLength(1);
      expect(receivers[0] === globalThis || receivers[0] === undefined).toBe(true);
    });
  });

  it('une substitution de test est rendue telle quelle, jamais liée de force', async () => {
    const { adapter, calls } = adapterWith(() => new Response('', { status: 404 }));
    await adapter.getRepoConfig(pr);
    expect(calls).toHaveLength(1); // le faux reçoit bien l'appel : `adapterFetch` ne l'enveloppe pas
  });
});
