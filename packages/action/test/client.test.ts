// Ce que le client écrit sur GitHub, et ce qu'il sait y relire (§A.8.1, §A.8.3).

import { describe, expect, it } from 'vitest';
import { decodeSummary } from '@cct/core';
import { GithubClient } from '../src/client.js';
import { emptyRepo, fakeGithub, FAKE_PR } from './fake-github.js';

function client(state = emptyRepo()) {
  const { impl, calls } = fakeGithub(state);
  return { state, calls, client: new GithubClient({ token: async () => 't', fetchImpl: impl }) };
}

describe('publication du check run (§A.8.3)', () => {
  it('la ligne cc/1 va dans le TITRE, la sortie humaine dans le résumé, l’état dans le texte', async () => {
    const { client: c, state } = client();
    await c.publishCheckRun(FAKE_PR, {
      headSha: 'sha-head',
      conclusion: 'failure',
      title: 'cc/1 state=failure draft=0 exempt=0 mode=enforce activated=- core=1.0.0 cfg=abc t=1 c=0 w=0',
      summary: '## Fils bloquants non résolus',
      text: '<!-- cct-state:1 {} -->',
    });
    const run = state.checkRuns[0]!;
    expect(decodeSummary(run.title)?.state).toBe('failure');
    expect(run.summary).toContain('Fils bloquants');
    expect(run.text).toContain('cct-state');
  });

  it.each(['success', 'failure', 'neutral'] as const)(
    'l’état `%s` se publie tel quel — `neutral` satisfait une vérification obligatoire (§A.8.3)',
    async (conclusion) => {
      const { client: c, calls } = client();
      await c.publishCheckRun(FAKE_PR, {
        headSha: 'sha-head',
        conclusion,
        title: 't',
        summary: 's',
        text: '',
      });
      expect(calls.some((k) => k.startsWith('POST') && k.includes('/check-runs'))).toBe(true);
    }
  );
});

describe('retrouver le check run précédent — la mémoire du besoin 4 (§6.4.1)', () => {
  it('remonte les commits du plus RÉCENT au plus ancien et s’arrête au premier trouvé', async () => {
    const state = emptyRepo({
      commits: ['sha-1', 'sha-2', 'sha-3'], // l'API les rend du plus ancien au plus récent
      checkRuns: [
        { headSha: 'sha-1', startedAt: '2026-01-01T00:00:00Z', title: 'vieux', summary: '', text: 'A' },
        { headSha: 'sha-2', startedAt: '2026-01-02T00:00:00Z', title: 'récent', summary: '', text: 'B' },
      ],
    });
    const { client: c, calls } = client(state);
    const found = await c.findPublishedCheckRun(FAKE_PR);
    expect(found?.headSha).toBe('sha-2');
    expect(found?.text).toBe('B');
    // sha-3 puis sha-2 : on s'arrête là, sha-1 n'est jamais demandé.
    expect(calls.some((k) => k.includes('/commits/sha-1/check-runs'))).toBe(false);
  });

  it('plusieurs runs de même nom sur un SHA : le plus récemment démarré gagne', async () => {
    const state = emptyRepo({
      commits: ['sha-1'],
      checkRuns: [
        { headSha: 'sha-1', startedAt: '2026-01-01T00:00:00Z', title: 'a', summary: '', text: 'ancien' },
        { headSha: 'sha-1', startedAt: '2026-01-02T00:00:00Z', title: 'b', summary: '', text: 'rejeu' },
      ],
    });
    const { client: c } = client(state);
    expect((await c.findPublishedCheckRun(FAKE_PR))?.text).toBe('rejeu');
  });

  it('au-delà de la borne de commits, l’état est perdu plutôt que payé en appels', async () => {
    const state = emptyRepo({
      commits: [
        'sha-old',
        ...Array.from({ length: 40 }, (_, i) => `sha-${i}`),
      ],
      checkRuns: [
        { headSha: 'sha-old', startedAt: '2026-01-01T00:00:00Z', title: 't', summary: '', text: 'X' },
      ],
    });
    const { client: c } = client(state);
    expect(await c.findPublishedCheckRun(FAKE_PR, 5)).toBeNull();
  });

  it('aucun check run publié : `null`, et non une erreur', async () => {
    const { client: c } = client();
    expect(await c.findPublishedCheckRun(FAKE_PR)).toBeNull();
  });
});

describe('lectures et écritures élémentaires', () => {
  it('fetchConfigFile : 404 → absent, contenu → found, panne → unreachable (§9.2.2)', async () => {
    const absent = client(emptyRepo({ configFile: null }));
    expect((await absent.client.fetchConfigFile(FAKE_PR)).status).toBe('absent');

    const found = client(emptyRepo({ configFile: '{"mode":"warn"}' }));
    expect(await found.client.fetchConfigFile(FAKE_PR)).toEqual({
      status: 'found',
      text: '{"mode":"warn"}',
    });

    const down = new GithubClient({
      token: async () => 't',
      fetchImpl: (async () => {
        throw new Error('network');
      }) as unknown as typeof fetch,
    });
    expect((await down.fetchConfigFile(FAKE_PR)).status).toBe('unreachable');
  });

  it('removeLabel est idempotente : une étiquette absente n’est jamais une erreur (§9.2.4)', async () => {
    const { client: c } = client();
    await expect(c.removeLabel(FAKE_PR, 'cc-override')).resolves.toBeUndefined();
  });

  it('fetchLabels rend la provenance — c’est ce qui dispense GitHub du repli du §6.3.2', async () => {
    const { client: c } = client(
      emptyRepo({ labels: [{ name: 'cc-override', by: 'lead', at: '2026-10-05T00:00:00Z' }] })
    );
    const labels = await c.fetchLabels(FAKE_PR);
    expect(labels[0]!.by?.login).toBe('lead');
    expect(labels[0]!.at).toBe('2026-10-05T00:00:00Z');
  });

  it('sans étiquette, la timeline n’est pas même demandée (budget d’appels, §6.4)', async () => {
    const { client: c, calls } = client();
    expect(await c.fetchLabels(FAKE_PR)).toEqual([]);
    expect(calls.some((k) => k.includes('/timeline'))).toBe(false);
  });

  it('une lecture en erreur lève ReadFailedError — elle ne se confond pas avec une absence', async () => {
    const { client: c } = client(emptyRepo({ fail: new Set(['/pulls/42']) }));
    await expect(c.fetchPrState(FAKE_PR)).rejects.toThrow(/HTTP 500/);
  });
});
