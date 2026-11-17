// @vitest-environment happy-dom
// §C.4, §8.2 — la lecture de la configuration de dépôt sur GitLab.
//
// Ce que ce fichier fige, c'est ce que le code ENVOIE et ce qu'il fait de chaque réponse. Il ne
// prouve pas ce que la route répond : cela se mesure sur GitLab, et vit dans le commentaire de
// `getRepoConfig()` (gitlab.com, projet public ; une instance Self-Managed, page connectée).
//
// Les réponses fabriquées ici sont celles MESURÉES, pas des suppositions :
//   - fichier présent : 200, `text/plain`, sans redirection ;
//   - fichier absent : 404 ;
//   - requête sans session : 302 vers `/users/sign_in`. Un `fetch` qui suit cette redirection
//     rend la page de connexion en 200 HTML avec `redirected: true` — un `Response` construit à la
//     main ne peut pas porter `redirected`, d'où le `Object.defineProperty` de `redirectedTo()`,
//     qui reproduit ce que le navigateur écrit sur la réponse.

import { describe, expect, it } from 'vitest';
import type { PrRef } from '@cct/core';
import { GitlabClientAdapter } from '../src/index.js';

const pr = (host: string, scope: string[]): PrRef => ({
  platform: 'gitlab',
  createdAt: '2026-11-17T00:00:00Z',
  host,
  scope,
  number: 7,
});

function adapterWith(reply: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply(String(url));
  }) as unknown as typeof fetch;
  return { adapter: new GitlabClientAdapter({ documentRef: document, fetchImpl }), calls };
}

/** Une réponse que le navigateur a obtenue APRÈS une redirection. */
function redirectedTo(res: Response): Response {
  Object.defineProperty(res, 'redirected', { value: true });
  return res;
}

const PROJECT = pr('gitlab.com', ['acme', 'demo']);
const ROUTE = 'https://gitlab.com/acme/demo/-/raw/HEAD/.conventional-comments.json';

describe('§C.4 — lecture de la configuration de dépôt sur GitLab', () => {
  it('lit la route de fichier brut, en `same-origin`', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{"version":1}', { status: 200 }));
    await adapter.getRepoConfig(PROJECT);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ROUTE);
    expect(calls[0]!.init?.credentials).toBe('same-origin');
  });

  it('un groupe imbriqué et un hôte à port restent dans le chemin', async () => {
    const { adapter, calls } = adapterWith(() => new Response('', { status: 404 }));
    await adapter.getRepoConfig(pr('git.corp.example:8443', ['red/core-team', 'foundation']));
    expect(calls[0]!.url).toBe('https://git.corp.example:8443/red/core-team/foundation/-/raw/HEAD/.conventional-comments.json');
  });

  it('un fichier présent est rendu tel quel', async () => {
    const body = '{"version":1,"mode":"enforce"}';
    const { adapter } = adapterWith(() => new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    expect(await adapter.getRepoConfig(PROJECT)).toEqual({ status: 'found', text: body });
  });

  it('un fichier absent (404) est un cas nominal, jamais une dégradation (§10)', async () => {
    const { adapter } = adapterWith(() => new Response('<html>404</html>', { status: 404 }));
    expect(await adapter.getRepoConfig(PROJECT)).toEqual({ status: 'absent' });
  });

  it('une erreur du serveur est injoignable, jamais un fichier absent', async () => {
    for (const status of [401, 403, 500, 503]) {
      const { adapter } = adapterWith(() => new Response('', { status }));
      expect(await adapter.getRepoConfig(PROJECT), `HTTP ${status}`).toEqual({ status: 'unreachable', reason: `HTTP ${status}` });
    }
  });

  // La page de connexion que GitLab sert à une requête sans session — mesuré sur gitlab.com : 302
  // vers `/users/sign_in`, suivi par `fetch`, 200 HTML.
  it('une session expirée (redirection vers la page de connexion) est injoignable, pas une configuration', async () => {
    const { adapter } = adapterWith(() =>
      redirectedTo(new Response('<!DOCTYPE html><html><body>Sign in</body></html>', { status: 200 }))
    );
    const read = await adapter.getRepoConfig(PROJECT);
    expect(read.status).toBe('unreachable');
  });

  it('une redirection est refusée même quand le corps ne ressemble pas à du HTML', async () => {
    const { adapter } = adapterWith(() => redirectedTo(new Response('{"version":1}', { status: 200 })));
    expect((await adapter.getRepoConfig(PROJECT)).status).toBe('unreachable');
  });

  it('du HTML servi sans redirection n’est pas non plus un fichier de configuration', async () => {
    const { adapter } = adapterWith(() => new Response('  \n<html>proxy</html>', { status: 200 }));
    expect(await adapter.getRepoConfig(PROJECT)).toEqual({ status: 'unreachable', reason: 'HTML instead of the file' });
  });

  it('une erreur réseau est injoignable, et ne lève pas', async () => {
    const { adapter } = adapterWith(() => Promise.reject(new TypeError('Failed to fetch')));
    const read = await adapter.getRepoConfig(PROJECT);
    expect(read.status).toBe('unreachable');
  });

  it('`bypassCache` est transmis à la requête (§8.1.3)', async () => {
    const { adapter, calls } = adapterWith(() => new Response('{}', { status: 200 }));
    await adapter.getRepoConfig(PROJECT, { bypassCache: true });
    expect(calls[0]!.init?.cache).toBe('reload');
  });
});
