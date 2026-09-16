// Une évaluation de bout en bout : `runOnce()` sur le VRAI adaptateur, posé sur un faux
// GitHub qui sert des routes. Rien n'est simulé entre les deux, donc ce que ces tests
// constatent est ce qu'un runner produirait.

import { describe, expect, it } from 'vitest';
import { decodeSummary } from '@cct/core';
import { GithubVerifierAdapter } from '../src/github.js';
import { runOnce } from '../src/run.js';
import { fakeGithub, fakeRepoState, type FakeRepoState, type FakeThread } from './fake-github.js';

const FLOOR_URL = 'https://interne.example/cc/plancher.json';
const ACTIVATED = '2026-09-01T00:00:00Z';

/** Un fil bloquant non résolu : une racine `issue:` que personne n'a close. */
function blockingThread(over: Partial<FakeThread> = {}): FakeThread {
  return {
    id: 'T1',
    isResolved: false,
    comments: [{ id: 'c1', body: 'issue: le nom est ambigu et prête à confusion', author: 'alice' }],
    ...over,
  };
}

function repoConfig(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ activation: { activatedAt: ACTIVATED }, ...over });
}

async function run(state: FakeRepoState, opts: { floorUrl?: string | null; prNumber?: number } = {}) {
  const github = fakeGithub(state);
  const adapter = new GithubVerifierAdapter({
    token: 'runner-token',
    repository: 'acme/demo',
    prNumber: opts.prNumber ?? 42,
    fetchImpl: github.fetch,
  });
  const outcome = await runOnce({
    adapter,
    floorUrl: opts.floorUrl === undefined ? null : opts.floorUrl,
    fetchImpl: github.fetch,
  });
  return { outcome, github };
}

describe('ce que le mode autorise à publier (§6.2.2)', () => {
  it('`off` et `assist` ne publient aucun statut', async () => {
    for (const mode of ['off', 'assist'] as const) {
      const { outcome, github } = await run(
        fakeRepoState({ configFile: repoConfig({ mode }), threads: [blockingThread()] })
      );
      expect(outcome.published, mode).toBe(false);
      expect(github.published, mode).toEqual([]);
    }
  });

  it('`warn` publie un statut JAMAIS en échec, fil bloquant non résolu compris', async () => {
    // Sans cette règle, un dépôt en `warn` verrait ses PR bloquées, en contradiction
    // directe avec le tableau du §7.
    const { outcome, github } = await run(
      fakeRepoState({ configFile: repoConfig({ mode: 'warn' }), threads: [blockingThread()] })
    );
    expect(outcome.published).toBe(true);
    expect(github.published[0]!.conclusion).toBe('success');
    // Le résumé liste quand même la non-conformité, à titre informatif.
    expect(outcome.result!.counts.unresolvedThreads).toBe(1);
  });

  it('`enforce` échoue sur un fil bloquant non résolu (§6.2.1, critère 2)', async () => {
    const { outcome, github } = await run(
      fakeRepoState({ configFile: repoConfig({ mode: 'enforce' }), threads: [blockingThread()] })
    );
    expect(github.published[0]!.conclusion).toBe('failure');
    expect(outcome.result!.state).toBe('failure');
  });

  it('`enforce` passe au vert quand le fil bloquant est résolu par l’auteur de sa racine', async () => {
    const { github } = await run(
      fakeRepoState({
        configFile: repoConfig({ mode: 'enforce' }),
        threads: [blockingThread({ isResolved: true, resolvedBy: 'alice' })],
      })
    );
    expect(github.published[0]!.conclusion).toBe('success');
  });

  it('`enforce` ignore un fil NON bloquant laissé ouvert', async () => {
    const { github } = await run(
      fakeRepoState({
        configFile: repoConfig({ mode: 'enforce' }),
        threads: [
          blockingThread({
            comments: [{ id: 'c1', body: 'note: pour information seulement', author: 'alice' }],
          }),
        ],
      })
    );
    expect(github.published[0]!.conclusion).toBe('success');
  });
});

describe('les deux incidents qui publient quel que soit le mode (§8.1.5)', () => {
  it('activation non datée : neutre même en `off`, là où le mode commanderait le silence', async () => {
    // Le cas fort. Rien n'activant le dépôt, le mode effectif est celui des défauts, donc
    // le silence — et sur un dépôt où le check est obligatoire, ce silence bloque TOUTES
    // les PR sans statut ni explication. Le neutre laisse passer et dit pourquoi.
    const { outcome, github } = await run(fakeRepoState({ configFile: null }));
    expect(outcome.published).toBe(true);
    expect(github.published[0]!.conclusion).toBe('neutral');
    expect(outcome.result!.notices.map((n) => n.kind)).toContain('activation-undated');
  });

  it('un fichier présent qui OMET la clé donne le même état et le même traitement', async () => {
    // Ce que `activation-undated` nomme est un fait de l'état courant, pas une disparition :
    // un fichier absent en est la cause la plus fréquente, jamais la seule.
    const { outcome, github } = await run(
      fakeRepoState({ configFile: JSON.stringify({ mode: 'enforce' }) })
    );
    expect(github.published[0]!.conclusion).toBe('neutral');
    expect(outcome.result!.notices.map((n) => n.kind)).toContain('activation-undated');
  });

  it('configuration invalide : échec sous `enforce`, neutre en dessous', async () => {
    const broken = '{ "mode": "banana", "activation": { "activatedAt": "' + ACTIVATED + '" } }';
    const { github: strict } = await run(
      fakeRepoState({
        configFile: broken,
        urls: { [FLOOR_URL]: JSON.stringify({ floorVersion: 1, minimumMode: 'enforce' }) },
      }),
      { floorUrl: FLOOR_URL }
    );
    expect(strict.published[0]!.conclusion).toBe('failure');

    const { github: lenient } = await run(fakeRepoState({ configFile: broken }));
    expect(lenient.published[0]!.conclusion).toBe('neutral');
  });
});

describe('quand la lecture échoue, le check échoue (§6.4)', () => {
  it('publie un échec, jamais un neutre ni un silence', async () => {
    // Publier un neutre laisserait passer le merge : `neutral` satisfait une vérification
    // obligatoire, exactement comme le statut vert périmé qu'on aurait laissé en place en
    // ne publiant rien. Un vérificateur qui porte une garantie ne peut pas s'abstenir sur
    // une panne — il rendrait la garantie fausse au moment où personne ne regarde.
    const state = fakeRepoState({ configFile: repoConfig({ mode: 'enforce' }) });
    const github = fakeGithub(state);
    const failing: typeof fetch = (input, init) =>
      String(input).includes('/contents/')
        ? Promise.reject(new Error('ECONNRESET'))
        : github.fetch(input, init);
    const adapter = new GithubVerifierAdapter({
      token: 't',
      repository: 'acme/demo',
      prNumber: 42,
      fetchImpl: failing,
    });

    const outcome = await runOnce({ adapter, floorUrl: null, fetchImpl: failing });
    expect(outcome.published).toBe(true);
    expect(github.published[0]!.conclusion).toBe('failure');
    expect(github.published[0]!.summary).toMatch(/unreachable/);
  });

  it('un plancher déclaré mais injoignable fait échouer, une URL absente non', async () => {
    // L'absence d'URL est le déploiement public — le plancher vaut alors
    // `{"minimumMode": "off"}` et n'impose aucune règle. Une URL posée qui ne répond pas
    // est une panne, et se traite comme telle.
    const { github: missing } = await run(
      fakeRepoState({ configFile: repoConfig({ mode: 'enforce' }), urls: {} }),
      { floorUrl: FLOOR_URL }
    );
    expect(missing.published[0]!.conclusion).toBe('failure');

    const { github: public_ } = await run(
      fakeRepoState({ configFile: repoConfig({ mode: 'enforce' }) }),
      { floorUrl: null }
    );
    expect(public_.published[0]!.conclusion).toBe('success');
  });
});

describe('brouillon et périmètre', () => {
  it('une PR en brouillon reçoit un statut informatif, jamais en échec (§6.2.4)', async () => {
    const state = fakeRepoState({
      configFile: repoConfig({ mode: 'enforce' }),
      threads: [blockingThread()],
      prs: { 42: { created_at: '2026-10-01T00:00:00Z', draft: true, head: 'sha-head' } },
    });
    const { github } = await run(state);
    expect(github.published[0]!.conclusion).not.toBe('failure');
  });

  it('une PR antérieure à `activatedAt` ne reçoit aucun statut en échec (§6.2.3, CA-15)', async () => {
    const state = fakeRepoState({
      configFile: repoConfig({ mode: 'enforce' }),
      threads: [blockingThread()],
      prs: { 42: { created_at: '2026-08-01T00:00:00Z', draft: false, head: 'sha-head' } },
    });
    const { github } = await run(state);
    expect(github.published[0]!.conclusion).toBe('success');
  });
});

describe('ce que le statut publié porte (§6.3.1)', () => {
  it('la ligne cc/1 se relit champ pour champ depuis output.title', async () => {
    // La seule couture entre les deux composants : ce que l'extension relit sans appel
    // d'API. Si l'encodage et le décodage divergent, le grisage du bouton de merge suit.
    const { outcome, github } = await run(
      fakeRepoState({ configFile: repoConfig({ mode: 'enforce' }), threads: [blockingThread()] })
    );
    const summary = decodeSummary(github.published[0]!.title);
    expect(summary).not.toBeNull();
    expect(summary!.state).toBe('failure');
    expect(summary!.mode).toBe('enforce');
    expect(summary!.activatedAt).toBe(ACTIVATED);
    expect(summary!.unresolvedBlockingCount).toBe(1);
    expect(summary!.configFingerprint).toBe(outcome.result!.configFingerprint);
  });

  it('le SHA de tête publié est celui relu au moment de juger, pas au départ (§6.4)', async () => {
    // Le SHA doit BOUGER pendant l'évaluation, sinon ce test ne distingue rien : une
    // première rédaction posait simplement un SHA et vérifiait qu'on le retrouvait, ce qui
    // passe aussi bien si la lecture se fait au début. Un push arrivé en cours
    // d'évaluation est exactement le cas que la règle du §6.4 existe pour couvrir.
    const state = fakeRepoState({ configFile: repoConfig({ mode: 'enforce' }) });
    state.prs[42]!.head = 'sha-du-debut';
    const github = fakeGithub(state);
    const pushMidRun: typeof fetch = (input, init) => {
      // La poussée survient quand l'évaluation commence à lire l'état de la PR — la requête
      // GraphQL des fils. Se caler sur le compte des lectures de `/pulls/42` ne suffisait
      // pas : avec une lecture anticipée, `fetchHeadSha()` tombe juste après `currentPr()`,
      // donc du même côté de la bascule, et le test passait des deux façons.
      if (String(input).endsWith('/graphql')) state.prs[42]!.head = 'sha-pousse-pendant';
      return github.fetch(input, init);
    };
    const adapter = new GithubVerifierAdapter({
      token: 't',
      repository: 'acme/demo',
      prNumber: 42,
      fetchImpl: pushMidRun,
    });

    const outcome = await runOnce({ adapter, floorUrl: null, fetchImpl: pushMidRun });
    expect(outcome.published).toBe(true);
    expect(github.published[0]!.head_sha).toBe('sha-pousse-pendant');
  });
});
