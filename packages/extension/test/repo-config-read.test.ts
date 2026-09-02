// @vitest-environment happy-dom
//
// LA LECTURE DE LA CONFIGURATION DE DÉPÔT (§8.2, niveau 3) — et pourquoi elle part sans
// cookies.
//
// Ce niveau n'a JAMAIS été lisible sur GitHub. La route `raw` de github.com redirige vers
// `raw.githubusercontent.com` dès que le fichier existe, cette origine répond
// `Access-Control-Allow-Origin: *`, et le navigateur refuse le joker quand la requête porte
// `credentials: 'include'`. Le `fetch` levait, la lecture rendait `unreachable`, et tout
// dépôt POSSÉDANT une configuration affichait l'état dégradé du §5.4 — l'inverse exact de ce
// que deux documents de ce dépôt affirmaient.
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
  it('part SANS cookies : le joker CORS de la redirection les refuse', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getRepoConfig(pr);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://github.com/acme/demo/raw/HEAD/.conventional-comments.json');
    // `include` renvoie la lecture dans le mur mesuré : ACAO `*` + cookies = refus.
    expect(calls[0]!.init?.credentials).toBe('omit');
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
  it('un configUrl `raw` sur github.com part sans cookies, comme celui du dépôt', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getOrgConfig('https://github.com/acme/config/raw/HEAD/cc.json');

    expect(calls[0]!.init?.credentials).toBe('omit');
  });

  it('un configUrl hors de cette route garde sa session', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getOrgConfig('https://config.acme.com/cc.json');

    expect(calls[0]!.init?.credentials).toBe('include');
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
    withMarkup('<meta name="octolytics-dimension-repository_public" content="false">');
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({
      status: 'unreachable',
      reason: 'HTTP 404 (dépôt privé, lu sans session)',
    });
  });

  it('dépôt public (méta) : un fichier absent reste un cas nominal (§10)', async () => {
    withMarkup('<meta name="octolytics-dimension-repository_public" content="true">');
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'absent' });
  });

  it('repli par le badge visible, filtré par texte et non par classe', async () => {
    withMarkup(
      '<span class="Label Label--secondary">Bot</span>' +
        '<span class="Label Label--secondary v-align-middle mr-1">Private</span>',
    );
    const { adapter } = adapterWith(() => new Response('', { status: 404 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({
      status: 'unreachable',
      reason: 'HTTP 404 (dépôt privé, lu sans session)',
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
