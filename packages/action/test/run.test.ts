// Le vérificateur en profil A (§6.4.1), éprouvé de bout en bout contre un GitHub en
// mémoire : vraies requêtes, vraie pagination, vraie relecture du check run publié.

import { describe, expect, it } from 'vitest';
import { decodeSummary } from '@cct/core';
import { GithubClient } from '../src/client.js';
import { evaluatePullRequest } from '../src/run.js';
import { decodeState } from '../src/state.js';
import { emptyRepo, fakeGithub, FAKE_PR, type FakeRepoState } from './fake-github.js';

function clientFor(state: FakeRepoState) {
  const { impl, calls } = fakeGithub(state);
  return {
    client: new GithubClient({ token: async () => 'token', fetchImpl: impl }),
    calls,
  };
}

async function evaluate(state: FakeRepoState, runMarker = '2026-11-01T00:00:00.000Z|1|1') {
  const { client } = clientFor(state);
  return evaluatePullRequest(FAKE_PR, { client, runMarker });
}

/** Le dernier check run publié, tel que la page de la PR le porterait. */
function lastCheck(state: FakeRepoState) {
  return state.checkRuns[state.checkRuns.length - 1]!;
}

describe('critère 2 (§6.2.1) — les fils bloquants décident du verdict', () => {
  it('un fil `issue:` non résolu fait échouer le check (CA-05)', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', author: 'alice', body: 'issue: le nom ne dit pas ce que fait la fonction' }],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.published).toBe(true);
    expect(outcome.result.state).toBe('failure');
    expect(outcome.result.counts.unresolvedThreads).toBe(1);
    // La ligne cc/1 est relisible caractère pour caractère depuis le TITRE (§6.3.1, §A.8.3).
    const summary = decodeSummary(lastCheck(state).title);
    expect(summary).not.toBeNull();
    expect(summary!.state).toBe('failure');
    expect(summary!.unresolvedBlockingCount).toBe(1);
  });

  it('le même fil, résolu par l’auteur de la racine, passe au vert (§6.1)', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'alice',
          comments: [{ id: 'c1', author: 'alice', body: 'issue: le nom ne dit pas ce que fait la fonction' }],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('success');
    expect(outcome.result.counts.unresolvedThreads).toBe(0);
  });

  it('résolu par quelqu’un d’autre, sans `decision` : la résolution est refusée (§6.1)', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'bob', // ni l'auteur de la racine, ni un membre habilité
          comments: [{ id: 'c1', author: 'alice', body: 'issue: le nom ne dit pas ce que fait la fonction' }],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('failure');
    expect(outcome.result.notices.some((n) => n.kind === 'resolution-refused')).toBe(true);
  });

  it('un fil non bloquant non résolu ne fait rien échouer (§3.3)', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', author: 'alice', body: 'nitpick: espace en trop' }],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('success');
    expect(outcome.result.counts.unresolvedThreads).toBe(0);
  });
});

describe('critère 1 (§6.2.1) — la forme avertit, elle ne bloque pas par défaut', () => {
  it('un commentaire mal formé est signalé sans faire échouer le check', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', author: 'alice', body: 'ça ne me plaît pas beaucoup' }],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('success');
    expect(outcome.result.formatDiagnostics.length).toBeGreaterThan(0);
    // Le résumé humain nomme la cause en un clic (CA-25).
    expect(lastCheck(state).summary).toContain('https://github.com/acme/demo/pull/42');
  });

  it('sous `formatSeverity: error`, le même commentaire fait échouer le check', async () => {
    const state = emptyRepo({
      configFile: JSON.stringify({
        mode: 'enforce',
        formatSeverity: 'error',
        activation: { activatedAt: '2026-09-01T00:00:00Z' },
      }),
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', author: 'alice', body: 'ça ne me plaît pas beaucoup' }],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('failure');
  });
});

describe('besoin 4 (§6.4.1) — l’état survit d’une exécution à l’autre par le check run', () => {
  it('le check publié porte les fils bloquants observés, et le tour suivant les relit', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', author: 'alice', body: 'issue: à corriger avant de fusionner' }],
        },
      ],
    });
    await evaluate(state);
    const carried = decodeState(lastCheck(state).text);
    expect(carried).not.toBeNull();
    expect(carried!.known).toEqual(['T1']);
    // Rien n'est rendu au lecteur : l'état voyage dans un commentaire HTML.
    expect(lastCheck(state).text.startsWith('<!--')).toBe(true);
  });

  it('MONOTONIE (§6.1, CA-36) : `issue:` édité en `note:` ne dé-bloque pas le fil', async () => {
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', author: 'alice', body: 'issue: à corriger avant de fusionner' }],
        },
      ],
    });
    const first = await evaluate(state);
    expect(first.result.state).toBe('failure');

    // L'auteur de la PR affaiblit la racine — le chemin que la monotonie ferme.
    state.threads[0]!.comments[0]!.body = 'note: à corriger avant de fusionner';
    state.threads[0]!.comments[0]!.lastEditedAt = '2026-10-03T00:00:00Z';
    state.threads[0]!.comments[0]!.editor = 'mallory';
    state.headSha = 'sha-2';
    state.commits = ['sha-head', 'sha-2'];

    const second = await evaluate(state, '2026-11-01T00:00:01.000Z|2|1');
    expect(second.result.state).toBe('failure'); // le fil reste bloquant
    expect(second.result.notices.some((n) => n.kind === 'weakening-edit')).toBe(true);
  });

  it('sans état retrouvé — check run hors de portée —, la monotonie repart de zéro', async () => {
    // Le même affaiblissement, mais le check précédent n'existe plus : le vérificateur
    // n'a jamais vu la racine bloquante, il n'a donc rien à maintenir. C'est la seule
    // dégradation de ce support, et elle est ici mise en évidence plutôt que supposée.
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [
            {
              id: 'c1',
              author: 'alice',
              body: 'note: à corriger avant de fusionner',
              lastEditedAt: '2026-10-03T00:00:00Z',
              editor: 'mallory',
            },
          ],
        },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('success');
  });

  it('un fil bloquant vu pour la première fois DÉJÀ RÉSOLU entre quand même dans la mémoire', async () => {
    // Le piège : ce fil ne change ni le verdict ni les compteurs ni les diagnostics, donc
    // pas l'empreinte du résultat. Une porte d'idempotence qui ne regarderait que le
    // verdict s'abstiendrait de publier, et l'oublierait. Il redeviendrait alors un fil
    // « jamais observé », ce qui rouvre l'évasion en deux gestes que le §6.1 ferme.
    const state = emptyRepo({
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'alice',
          // Corps SANS aucun diagnostic — sujet et discussion —, sans quoi l'ajout du
          // second fil ferait bouger le compteur d'avertissements, donc l'empreinte, et
          // le cas qu'on veut éprouver ne se produirait pas.
          comments: [
            { id: 'c1', author: 'alice', body: 'issue: le nom est ambigu\n\nIl faudrait le préciser.' },
          ],
        },
      ],
    });
    const first = await evaluate(state);
    expect(first.result.state).toBe('success');
    expect(first.result.formatDiagnostics).toHaveLength(0);

    // Un SECOND fil bloquant, résolu dès sa première observation : verdict inchangé.
    state.threads.push({
      id: 'T2',
      isResolved: true,
      resolvedBy: 'bob',
      comments: [
        { id: 'c2', author: 'bob', body: 'issue: la limite est fausse\n\nElle exclut le dernier élément.' },
      ],
    });
    const second = await evaluate(state, '2026-11-01T00:00:01.000Z|2|1');
    expect(second.result.state).toBe('success'); // le verdict n'a effectivement pas bougé
    expect(decodeState(lastCheck(state).text)!.known.sort()).toEqual(['T1', 'T2']);

    // La preuve que la mémoire sert : T2 est affaibli puis rouvert. La monotonie doit le
    // maintenir bloquant, ce qu'elle ne peut faire que si T2 a bien été observé.
    state.threads[1]!.comments[0]!.body = 'note: la limite est fausse\n\nElle exclut le dernier élément.';
    state.threads[1]!.comments[0]!.lastEditedAt = '2026-10-04T00:00:00Z';
    state.threads[1]!.comments[0]!.editor = 'mallory';
    state.threads[1]!.isResolved = false;
    delete state.threads[1]!.resolvedBy;
    const third = await evaluate(state, '2026-11-01T00:00:02.000Z|3|1');
    expect(third.result.state).toBe('failure');
    expect(third.result.notices.some((n) => n.kind === 'weakening-edit')).toBe(true);
  });

  it('la configuration est ÉPINGLÉE à la première évaluation et ne se réécrit pas (§8.1.3)', async () => {
    const state = emptyRepo({});
    await evaluate(state);
    const pinnedFirst = decodeState(lastCheck(state).text)!.pinned;
    expect(pinnedFirst).toBeDefined();
    expect(pinnedFirst!.mode).toBe('enforce');

    // Le dépôt durcit sa configuration ; la PR déjà épinglée ne suit pas.
    state.configFile = JSON.stringify({
      mode: 'enforce',
      formatSeverity: 'error',
      activation: { activatedAt: '2026-09-01T00:00:00Z' },
    });
    state.threads = [
      { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'pas conforme du tout' }] },
    ];
    state.headSha = 'sha-2';
    state.commits = ['sha-head', 'sha-2'];
    const second = await evaluate(state, '2026-11-01T00:00:01.000Z|2|1');
    // `formatSeverity: error` aurait fait échouer ; la configuration épinglée l'ignore.
    expect(second.result.state).toBe('success');
    expect(decodeState(lastCheck(state).text)!.pinned!.formatSeverity).toBe('warn');
  });
});

describe('besoin 3 (§6.4.1) — récence et idempotence, portées par le statut publié', () => {
  it('un résultat identique sur le même SHA n’est pas republié (§6.4)', async () => {
    const state = emptyRepo({
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    await evaluate(state);
    expect(state.checkRuns).toHaveLength(1);
    const again = await evaluate(state, '2026-11-01T00:00:02.000Z|2|1');
    expect(again.published).toBe(false);
    expect(again.skipped).toBe('identical');
    expect(state.checkRuns).toHaveLength(1);
  });

  it('un changement d’état republie, lui', async () => {
    const state = emptyRepo({
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    await evaluate(state);
    state.threads[0]!.isResolved = true;
    state.threads[0]!.resolvedBy = 'alice';
    const again = await evaluate(state, '2026-11-01T00:00:02.000Z|2|1');
    expect(again.published).toBe(true);
    expect(again.result.state).toBe('success');
    expect(state.checkRuns).toHaveLength(2);
  });

  it('une exécution PLUS ANCIENNE n’écrase pas le statut d’une plus récente, sur le même SHA', async () => {
    const state = emptyRepo({
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    await evaluate(state, '2026-11-01T00:00:10.000Z|20|1'); // la récente publie d'abord
    state.threads[0]!.isResolved = true;
    state.threads[0]!.resolvedBy = 'alice';
    const stale = await evaluate(state, '2026-11-01T00:00:05.000Z|10|1'); // la lente arrive après
    expect(stale.published).toBe(false);
    expect(stale.skipped).toBe('superseded');
    expect(state.checkRuns).toHaveLength(1);
  });

  it('sur un SHA NEUF, la même exécution publie : la règle ne vaut que par SHA', async () => {
    const state = emptyRepo({
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    await evaluate(state, '2026-11-01T00:00:10.000Z|20|1');
    state.headSha = 'sha-2';
    state.commits = ['sha-head', 'sha-2'];
    const next = await evaluate(state, '2026-11-01T00:00:05.000Z|10|1');
    expect(next.published).toBe(true);
    expect(state.checkRuns).toHaveLength(2);
  });
});

describe('le mode reste maître de ce qui est publié (§6.2.2)', () => {
  it('`assist` ne publie aucun statut', async () => {
    const state = emptyRepo({
      configFile: JSON.stringify({ mode: 'assist', activation: { activatedAt: '2026-09-01T00:00:00Z' } }),
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.published).toBe(false);
    expect(outcome.skipped).toBe('mode');
    expect(state.checkRuns).toHaveLength(0);
  });

  it('`warn` publie un statut qui n’échoue jamais (CA-23)', async () => {
    const state = emptyRepo({
      configFile: JSON.stringify({ mode: 'warn', activation: { activatedAt: '2026-09-01T00:00:00Z' } }),
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.published).toBe(true);
    expect(outcome.result.state).not.toBe('failure');
  });

  it('une PR en brouillon reçoit un statut informatif, jamais un échec (§6.2.4)', async () => {
    const state = emptyRepo({
      isDraft: true,
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).not.toBe('failure');
    expect(outcome.result.counts.unresolvedThreads).toBe(1); // évalué, mais pas contraignant
  });

  it('une PR antérieure à `activatedAt` passe au vert sans jamais se taire (CA-15)', async () => {
    const state = emptyRepo({
      configFile: JSON.stringify({
        mode: 'enforce',
        activation: { activatedAt: '2026-12-01T00:00:00Z' }, // postérieure à la PR
      }),
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    const outcome = await evaluate(state);
    expect(outcome.published).toBe(true);
    expect(outcome.result.state).toBe('success');
  });
});

describe('exemption de PR (§6.3.2) — la provenance de l’étiquette suffit sur GitHub', () => {
  const EXEMPT_CONFIG = JSON.stringify({
    mode: 'enforce',
    activation: { activatedAt: '2026-09-01T00:00:00Z' },
    resolverOverrideGroup: ['acme/leads'],
  });

  function blockedRepo(extra: Partial<FakeRepoState> = {}) {
    return emptyRepo({
      configFile: EXEMPT_CONFIG,
      teams: { 'acme/leads': ['lead'] },
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
      ...extra,
    });
  }

  it('l’étiquette posée par un membre habilité exempte la PR, sans aucun état persistant (CA-26)', async () => {
    const state = blockedRepo();
    const blocked = await evaluate(state);
    expect(blocked.result.state).toBe('failure'); // le fil bloquant est OBSERVÉ d'abord

    // Le responsable pose l'étiquette sur une PR dont le fil bloquant est déjà connu :
    // ce n'est donc pas la remise à zéro du §6.3.2, c'est une exemption.
    state.labels = [{ name: 'cc-override', by: 'lead', at: '2026-10-05T00:00:00Z' }];
    const outcome = await evaluate(state, '2026-11-01T00:00:01.000Z|2|1');

    expect(outcome.result.state).toBe('success');
    const summary = decodeSummary(lastCheck(state).title)!;
    expect(summary.exempted).toBe(true);
    // Compteurs non nuls ET vert : c'est exactement ce que le §6.5 interdit à l'extension
    // de recalculer depuis les compteurs.
    expect(summary.unresolvedBlockingCount).toBe(1);
    // Toute la chaîne s'est relue de la PR : rien n'a été retenu de l'octroi.
    expect(state.labelWrites).toEqual([]);
  });

  it('posée par quelqu’un qui n’est pas habilité : refusée, étiquette LAISSÉE en place (CA-26)', async () => {
    // Le §6.3.2 le veut ainsi : une étiquette qui disparaît sans explication se comprend
    // moins bien qu'une étiquette présente et dite sans effet dans la sortie du check.
    const state = blockedRepo({
      labels: [{ name: 'cc-override', by: 'mallory', at: '2026-10-05T00:00:00Z' }],
    });
    const outcome = await evaluate(state);
    expect(outcome.result.state).toBe('failure');
    const refused = outcome.result.notices.find((n) => n.kind === 'exemption-refused');
    expect(refused?.actor?.login).toBe('mallory');
    expect(state.labelWrites).toEqual([]);
    expect(state.labels.map((l) => l.name)).toEqual(['cc-override']);
  });

  it('un NOUVEAU fil bloquant après l’exemption la remet à zéro et retire l’étiquette (§6.3.2, CA-26)', async () => {
    const state = blockedRepo({
      labels: [{ name: 'cc-override', by: 'lead', at: '2026-10-05T00:00:00Z' }],
    });
    // Premier tour : T1 est déjà connu ET l'étiquette est là — mais T1 n'a jamais été
    // observé, donc c'est bien un fil bloquant NOUVEAU par rapport à l'exemption.
    const first = await evaluate(state);
    expect(first.result.notices.some((n) => n.kind === 'exemption-reset')).toBe(true);
    expect(state.labelWrites).toContainEqual({ op: 'remove', name: 'cc-override' });
    expect(first.result.state).toBe('failure');
  });
});

describe('lecture impossible (§6.4.1) — échouer, jamais publier un verdict non calculé', () => {
  it('une API muette laisse l’exécution en échec et ne publie rien', async () => {
    const state = emptyRepo({ fail: new Set(['/graphql']) });
    await expect(evaluate(state)).rejects.toThrow();
    expect(state.checkRuns).toHaveLength(0);
  });

  it('un plancher injoignable arrête l’exécution plutôt que de juger sans lui (§8.1.1)', async () => {
    const state = emptyRepo({ fail: new Set(['floor.example']) });
    const { client } = clientFor(state);
    await expect(
      evaluatePullRequest(FAKE_PR, {
        client,
        runMarker: '2026-11-01T00:00:00.000Z|1|1',
        floorUrl: 'https://floor.example/floor.json',
      })
    ).rejects.toThrow(/floor document unreachable/);
    expect(state.checkRuns).toHaveLength(0);
  });
});

describe('plancher d’entreprise (§8.1.1) — servi par une URL hors du dépôt', () => {
  it('le plancher durcit le mode que le dépôt a choisi', async () => {
    const floorUrl = 'https://floor.example/floor.json';
    const state = emptyRepo({
      configFile: JSON.stringify({ mode: 'assist', activation: { activatedAt: '2026-09-01T00:00:00Z' } }),
      urls: { [floorUrl]: JSON.stringify({ minimumMode: 'enforce' }) },
      threads: [
        { id: 'T1', isResolved: false, comments: [{ id: 'c1', author: 'alice', body: 'issue: à traiter' }] },
      ],
    });
    const { client } = clientFor(state);
    const outcome = await evaluatePullRequest(FAKE_PR, {
      client,
      runMarker: '2026-11-01T00:00:00.000Z|1|1',
      floorUrl,
    });
    // Le dépôt disait `assist` — donc silence ; le plancher impose `enforce`.
    expect(outcome.published).toBe(true);
    expect(outcome.result.state).toBe('failure');
  });

  it('un plancher mal formé est SIGNALÉ et ne s’applique pas, au lieu de s’effacer', async () => {
    const floorUrl = 'https://floor.example/floor.json';
    const state = emptyRepo({
      urls: { [floorUrl]: JSON.stringify({ minimumMode: 'sévère' }) },
    });
    const { client } = clientFor(state);
    const outcome = await evaluatePullRequest(FAKE_PR, {
      client,
      runMarker: '2026-11-01T00:00:00.000Z|1|1',
      floorUrl,
    });
    expect(outcome.result.notices.some((n) => n.message.includes('floor document rejected'))).toBe(true);
  });
});
