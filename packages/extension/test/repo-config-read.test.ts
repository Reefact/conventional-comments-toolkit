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

  // Sans session, un dépôt privé rend 403 : l'extension DIT qu'elle n'a pas pu lire, au lieu
  // de prétendre qu'il n'y a pas de fichier. La lecture authentifiée demandera une permission
  // d'hôte et le service worker — elle n'est pas dans ce correctif.
  it('un dépôt privé (403) est une lecture impossible, pas un fichier absent', async () => {
    const { adapter } = adapterWith(() => new Response('', { status: 403 }));
    expect(await adapter.getRepoConfig(pr)).toEqual({ status: 'unreachable', reason: 'HTTP 403' });
  });
});
