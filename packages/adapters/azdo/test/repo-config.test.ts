// @vitest-environment happy-dom
// §B.4, §8.1.5 — la lecture de `.conventional-comments.json` sur Azure DevOps.
//
// Les faux `fetch` ci-dessous sont des AFFIRMATIONS sur la plateforme (CLAUDE.md, « Écrire sur
// une plateforme qu'on ne contrôle pas », règle 2) : chacun rend ce que dev.azure.com a rendu le
// 2026-11-10, mesuré depuis une page de PR connectée (CAPTURES.md, « Repository config read ») —
// code, redirection, corps. Ce qu'un SCRIPT DE CONTENU a le droit de lire d'une requête de même
// origine sans redirection est mesuré à part, dans Chromium (`check:content-script-cors`).

import { describe, expect, it } from 'vitest';
import type { PrRef } from '@cct/core';
import { AzdoClientAdapter } from '../src/index.js';

const PR: PrRef = {
  platform: 'azdo',
  host: 'dev.azure.com',
  scope: ['sylva-cct-test', 'cct-test', 'cct-test'],
  number: 1,
  createdAt: '2026-11-09T20:49:08.770Z',
};

/** Une réponse telle que la plateforme l'a servie : `redirected` n'est pas un paramètre de
 * `Response`, il se pose sur l'objet. */
function served(body: string, status: number, redirected = false): Response {
  const res = new Response(body, { status });
  Object.defineProperty(res, 'redirected', { value: redirected });
  return res;
}

function adapterAnswering(res: () => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const adapter = new AzdoClientAdapter({
    documentRef: document,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return res();
    }) as typeof fetch,
  });
  return { adapter, calls };
}

describe('§B.4 — lecture de la configuration du dépôt sur Azure DevOps (mesurée le 2026-11-10)', () => {
  it('demande le fichier au point d’API `items`, de même origine, avec `same-origin` et sans Accept JSON', async () => {
    const { adapter, calls } = adapterAnswering(() => served('{"version":1}', 200));
    await adapter.getRepoConfig(PR);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://dev.azure.com/sylva-cct-test/cct-test/_apis/git/repositories/cct-test/items' +
        '?path=%2F.conventional-comments.json&api-version=7.1'
    );
    // `Accept: application/json` rend des MÉTADONNÉES au lieu du fichier (mesuré).
    expect(calls[0]!.init).toEqual({ credentials: 'same-origin' });
  });

  it('fichier présent, session ouverte : 200 et le contenu brut — `found`', async () => {
    const body = '{\n  "version": 1,\n  "mode": "enforce"\n}\n';
    const { adapter } = adapterAnswering(() => served(body, 200));
    expect(await adapter.getRepoConfig(PR)).toEqual({ status: 'found', text: body });
  });

  it('fichier absent : 404 sans redirection — `absent`', async () => {
    const { adapter } = adapterAnswering(() =>
      served('{"$id":"1","innerException":null,"message":"TF401174: The item \'/.conventional-comments.json\' could not be found"}', 404)
    );
    expect(await adapter.getRepoConfig(PR)).toEqual({ status: 'absent' });
  });

  it('sans session : redirigé vers la connexion, 203 et du HTML — `unreachable`, jamais `found` ni `absent`', async () => {
    const { adapter } = adapterAnswering(() => served('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">', 203, true));
    expect((await adapter.getRepoConfig(PR)).status).toBe('unreachable');
  });

  it('une erreur rendue en JSON (refus, panne) n’est jamais lue comme une configuration — `unreachable`', async () => {
    // Pas une mesure de la plateforme : une exigence. Un corps d'erreur JSON lu comme `found`
    // deviendrait une configuration invalide, et le repli du §8.1.5 s'appliquerait à tort.
    for (const status of [401, 403, 500]) {
      const { adapter } = adapterAnswering(() => served('{"$id":"1","message":"error"}', status));
      expect((await adapter.getRepoConfig(PR)).status, `HTTP ${status}`).toBe('unreachable');
    }
  });

  it('une page HTML servie en 200 n’est pas un fichier de configuration — `unreachable`', async () => {
    const { adapter } = adapterAnswering(() => served('<!DOCTYPE html><html></html>', 200));
    expect((await adapter.getRepoConfig(PR)).status).toBe('unreachable');
  });

  it('une requête qui lève (CORS, réseau) — `unreachable`', async () => {
    const { adapter } = adapterAnswering(() => {
      throw new TypeError('Failed to fetch');
    });
    expect((await adapter.getRepoConfig(PR)).status).toBe('unreachable');
  });

  it('les segments de l’URL sont encodés : un projet avec une espace reste un seul segment', async () => {
    const { adapter, calls } = adapterAnswering(() => served('{}', 404));
    await adapter.getRepoConfig({ ...PR, scope: ['org', 'My Project', 'repo'] });
    expect(calls[0]!.url).toContain('/org/My%20Project/_apis/git/repositories/repo/items');
  });
});
