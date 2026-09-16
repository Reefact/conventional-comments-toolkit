import { describe, expect, it } from 'vitest';
import type { ComplianceResult, PrRef, UserInfo } from '@cct/core';
import {
  GithubVerifierAdapter,
  prNumberFromEvent,
  webHostFromApiBase,
  workflowRunPullRequests,
} from '../src/github.js';
import { fakeGithub, fakeRepoState } from './fake-github.js';

const PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function adapterOn(state = fakeRepoState(), over: Record<string, unknown> = {}) {
  const github = fakeGithub(state);
  const adapter = new GithubVerifierAdapter({
    token: 'runner-token',
    repository: 'acme/demo',
    fetchImpl: github.fetch,
    ...over,
  });
  return { adapter, github, state };
}

describe('la PR que cette évaluation évalue (§6.4, §9.2.4)', () => {
  it("prend le numéro injecté par la répartition plutôt que celui de l'événement", async () => {
    // Sur un job de matrice, l'événement est celui de l'exécution planifiée : il ne désigne
    // aucune PR, ou en désigne une autre. C'est la matrice qui fait foi.
    const state = fakeRepoState({
      prs: {
        7: { created_at: '2026-09-01T00:00:00Z', draft: false, head: 'sha-7' },
        42: { created_at: '2026-10-01T00:00:00Z', draft: false, head: 'sha-42' },
      },
    });
    const { adapter } = adapterOn(state, { prNumber: 7, event: { pull_request: { number: 42 } } });
    expect((await adapter.currentPr()).number).toBe(7);
  });

  it("se sert de l'événement quand rien n'est injecté", async () => {
    const { adapter } = adapterOn(fakeRepoState(), { event: { pull_request: { number: 42 } } });
    expect((await adapter.currentPr()).number).toBe(42);
  });

  it("refuse d'inventer une PR quand l'événement n'en désigne aucune", async () => {
    const { adapter } = adapterOn(fakeRepoState(), { event: { schedule: '0 * * * *' } });
    await expect(adapter.currentPr()).rejects.toThrow(/no pull request to evaluate/);
  });
});

describe("le numéro de PR que porte un événement", () => {
  it('ignore un issue_comment posté sur une issue qui n’est pas une PR', () => {
    // `issue.pull_request` n'existe que sur les issues qui SONT des PR. Sans ce test, une
    // issue ordinaire ferait évaluer une PR portant son numéro — qui peut exister.
    expect(prNumberFromEvent({ issue: { number: 42 } })).toBeNull();
    expect(prNumberFromEvent({ issue: { number: 42, pull_request: {} } })).toBe(42);
  });

  it('distingue « pas un workflow_run » de « workflow_run sans PR associée »', () => {
    // Les deux rendraient une liste vide si on les confondait, et seul le second demande le
    // repli par la branche de tête (§A.8).
    expect(workflowRunPullRequests({ pull_request: { number: 42 } })).toBeNull();
    expect(workflowRunPullRequests({ workflow_run: { pull_requests: [], head_branch: 'feat/x' } }))
      .toEqual({ numbers: [], headBranch: 'feat/x' });
  });
});

describe('les PR qu’un déclencheur couvre quand il en couvre plusieurs (§6.4)', () => {
  it('rend toutes les PR ouvertes sur une exécution planifiée', async () => {
    const state = fakeRepoState({
      openPrs: [
        { number: 42, created_at: '2026-10-01T00:00:00Z' },
        { number: 43, created_at: '2026-10-02T00:00:00Z' },
      ],
    });
    const { adapter } = adapterOn(state, { event: { schedule: '0 * * * *' } });
    expect((await adapter.pullRequestsToDispatch()).map((pr) => pr.number)).toEqual([42, 43]);
  });

  it('retrouve la PR par la branche de tête quand workflow_run n’en associe aucune', async () => {
    // Sans ce repli, toutes ces exécutions partageraient un même groupe de concurrence et
    // deux PR de forks différents s'annuleraient l'une l'autre (§A.8).
    const state = fakeRepoState({ openPrs: [{ number: 99, created_at: '2026-10-05T00:00:00Z' }] });
    const { adapter, github } = adapterOn(state, {
      event: { workflow_run: { pull_requests: [], head_branch: 'fork:feat' } },
    });
    expect((await adapter.pullRequestsToDispatch()).map((pr) => pr.number)).toEqual([99]);
    expect(github.requests.some((r) => r.url.includes('head=fork%3Afeat'))).toBe(true);
  });
});

describe('l’habilitation sur GitHub (§A.7, §A.8)', () => {
  const alice: UserInfo = { id: 'u-alice', login: 'alice', isServiceAccount: false };
  const mallory: UserInfo = { id: 'u-mallory', login: 'mallory', isServiceAccount: false };

  it('ne fait AUCUN appel d’API pour trancher une habilitation, slug compris', async () => {
    // Le `GITHUB_TOKEN` n'a aucune portée d'organisation : appeler l'API des équipes
    // donnerait un 403 sur tout dépôt réel, et ferait dépendre l'habilitation d'une erreur
    // réseau. Ce que ce test protège est l'ABSENCE d'appel.
    //
    // Le slug `acme/tech-leads` est ce qui donne sa valeur au test, et il a fallu deux
    // tentatives pour s'en apercevoir. Avec la seule liste `alice,bob,carol`, une version
    // qui repasse par l'API des équipes sort sur `group.split('/')` avant d'appeler quoi que
    // ce soit : le test passait AVEC et SANS le défaut, donc ne prouvait rien. Un slug est
    // précisément la forme qu'un tel retour en arrière traiterait — et celle que §A.7
    // déclare inutilisable ici, ce qui la rend doublement pertinente.
    const { adapter, github } = adapterOn();
    await adapter.isInGroup(alice, 'alice,bob,carol');
    await adapter.isInGroup(mallory, 'acme/tech-leads');
    expect(github.requests).toEqual([]);
  });

  it('n’habilite personne sur un slug d’équipe, qui n’est pas utilisable ici (§A.7)', async () => {
    const { adapter } = adapterOn();
    expect(await adapter.isInGroup(alice, 'acme/tech-leads')).toBe(false);
  });

  it('tranche une liste de comptes séparés par des virgules', async () => {
    const { adapter } = adapterOn();
    expect(await adapter.isInGroup(alice, 'alice,bob,carol')).toBe(true);
    expect(await adapter.isInGroup(mallory, 'alice,bob,carol')).toBe(false);
  });

  it('ignore la casse et les espaces autour des logins', async () => {
    const { adapter } = adapterOn();
    expect(await adapter.isInGroup(alice, ' Alice , bob ')).toBe(true);
  });

  it('n’habilite personne sur un groupe vide', async () => {
    const { adapter } = adapterOn();
    expect(await adapter.isInGroup(alice, '')).toBe(false);
    expect(await adapter.isInGroup(alice, ',,')).toBe(false);
  });
});

describe('lecture de l’état courant', () => {
  it('lit la résolution d’un fil depuis GraphQL, avec son résolveur', async () => {
    const state = fakeRepoState({
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'bob',
          comments: [
            { id: 'c1', body: 'issue: le nom est ambigu', author: 'alice' },
            { id: 'c2', body: 'decision: on garde, motif documenté ailleurs', author: 'bob' },
          ],
        },
      ],
    });
    const { adapter } = adapterOn(state);
    const threads = await adapter.fetchThreads(PR);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.resolution).toBe('resolved');
    expect(threads[0]!.resolvedBy?.login).toBe('bob');
    expect(threads[0]!.root.body).toBe('issue: le nom est ambigu');
    expect(threads[0]!.replies).toHaveLength(1);
    expect(threads[0]!.canCarryBlockingState).toBe(true);
  });

  it('marque les zones hors fil comme ne pouvant porter aucun état bloquant (§4.1)', async () => {
    const state = fakeRepoState({
      issueComments: [{ id: 1, body: 'note: rien à signaler', author: 'alice' }],
      reviews: [{ id: 2, body: 'issue: revoir le nommage', author: 'bob' }],
    });
    const { adapter } = adapterOn(state);
    const loose = await adapter.fetchStandaloneComments(PR);
    expect(loose.map((entry) => entry.zone)).toEqual(['conversation', 'review-body']);
    expect(loose.every((entry) => entry.comment.canCarryBlockingState === false)).toBe(true);
  });

  it('rend la provenance d’une étiquette depuis la timeline (§A.7)', async () => {
    const state = fakeRepoState({
      labels: [{ name: 'cc-override', by: 'lead', at: '2026-10-04T12:00:00Z' }],
    });
    const { adapter } = adapterOn(state);
    const labels = await adapter.fetchLabels(PR);
    expect(labels[0]!.by?.login).toBe('lead');
    expect(labels[0]!.at).toBe('2026-10-04T12:00:00Z');
  });

  it('distingue un fichier de configuration absent d’une lecture impossible', async () => {
    // Deux états que le §8.1.5 traite de façons opposées : l'un se replie, l'autre fait
    // échouer le check. Les confondre est le défaut que cette distinction existe pour éviter.
    const { adapter } = adapterOn(fakeRepoState({ configFile: null }));
    expect(await adapter.fetchConfigFile(PR)).toEqual({ status: 'absent' });

    const broken = new GithubVerifierAdapter({
      token: 't',
      repository: 'acme/demo',
      fetchImpl: (() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch,
    });
    expect((await broken.fetchConfigFile(PR)).status).toBe('unreachable');
  });
});

describe('écritures', () => {
  it('publie la ligne cc/1 dans output.title et la sortie humaine dans le corps (§6.3.1)', async () => {
    const { adapter, github } = adapterOn();
    await adapter.publishStatus(PR, resultFixture());
    expect(github.published).toHaveLength(1);
    expect(github.published[0]!.name).toBe('conventional-comments');
    expect(github.published[0]!.head_sha).toBe('sha-head');
    expect(github.published[0]!.conclusion).toBe('failure');
    expect(github.published[0]!.title).toMatch(/^cc\/1 /);
    expect(github.published[0]!.summary).toContain('1 fil');
  });

  it('absorbe le retrait d’une étiquette absente, sans erreur (§9.2.4)', async () => {
    // Idempotente : une remise à zéro peut suivre un retrait manuel.
    const { adapter } = adapterOn(fakeRepoState({ labels: [] }));
    await expect(adapter.removeLabel(PR, 'cc-override')).resolves.toBeUndefined();
  });

  it('retire une étiquette présente', async () => {
    const state = fakeRepoState({ labels: [{ name: 'cc-override' }] });
    const { adapter, github } = adapterOn(state);
    await adapter.removeLabel(PR, 'cc-override');
    expect(github.removedLabels).toEqual(['cc-override']);
  });
});

describe('hôte web dérivé de l’hôte d’API', () => {
  it('retire le préfixe api. et supporte un GHE Server', () => {
    expect(webHostFromApiBase('https://api.github.com')).toBe('github.com');
    expect(webHostFromApiBase('https://ghe.corp/api/v3')).toBe('ghe.corp');
  });
});

function resultFixture(): ComplianceResult {
  return {
    pr: PR,
    headSha: 'sha-head',
    mode: 'enforce',
    state: 'failure',
    isDraft: false,
    activatedAt: '2026-09-01T00:00:00Z',
    headline: '1 fil(s) bloquant(s) non résolu(s), 0 commentaire(s) non conforme(s), 0 avertissement(s).',
    configFingerprint: 'abc123',
    coreVersion: '1.0.0',
    formatDiagnostics: [],
    unresolvedBlockingThreads: [],
    notices: [],
    docUrl: 'https://conventionalcomments.org',
    counts: { unresolvedThreads: 1, nonCompliantComments: 0, warnings: 0 },
    actions: {},
    blockingThreadIds: [],
    correctedThreadIds: [],
    newFirstVerdicts: {},
  };
}
