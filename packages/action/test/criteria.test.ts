// Les critères d'acceptation du §11 que le vérificateur GitHub porte seul. Ils étaient
// couverts par les tests du serveur, qui disparaît ; ce sont donc ceux dont la ligne de
// `docs/ca-matrix-fr.md` change de cible.
//
// Tout tourne sur le VRAI adaptateur posé sur le faux qui sert des routes : ce que ces
// tests constatent est ce qu'un runner publierait.

import { describe, expect, it } from 'vitest';
import { GithubVerifierAdapter } from '../src/github.js';
import { runOnce } from '../src/run.js';
import { fakeGithub, fakeRepoState, type FakeRepoState } from './fake-github.js';

const ORG_URL = 'https://interne.example/cc/organisation.json';
const FLOOR_URL = 'https://interne.example/cc/plancher.json';
const ACTIVATED = '2026-09-01T00:00:00Z';

async function run(state: FakeRepoState, opts: { floorUrl?: string | null } = {}) {
  const github = fakeGithub(state);
  const adapter = new GithubVerifierAdapter({
    token: 'runner-token',
    repository: 'acme/demo',
    prNumber: 42,
    fetchImpl: github.fetch,
  });
  const outcome = await runOnce({
    adapter,
    floorUrl: opts.floorUrl ?? null,
    fetchImpl: github.fetch,
  });
  return { outcome, github };
}

describe('CA-10 — une exemption est attribuée et datée sur la PR elle-même', () => {
  it('le statut publié nomme le poseur de l’étiquette et la date de la pose', async () => {
    // La provenance vient de la timeline (§A.7), pas d'un journal que le vérificateur
    // tiendrait : il n'en tient aucun. Là où une plateforme ne l'expose pas, il n'y a
    // simplement pas d'exemption de PR (§6.3.2).
    const state = fakeRepoState({
      configFile: JSON.stringify({
        mode: 'enforce',
        activation: { activatedAt: ACTIVATED },
        resolverOverrideGroup: ['lead,alice'],
      }),
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', body: 'issue: le nom est ambigu\n\nil prête à confusion', author: 'bob' }],
        },
      ],
      labels: [{ name: 'cc-override', by: 'lead', at: '2026-10-04T12:00:00Z' }],
    });
    const { outcome, github } = await run(state);

    expect(github.published[0]!.conclusion).toBe('success');
    expect(outcome.result!.exemption?.by.login).toBe('lead');
    expect(outcome.result!.exemption?.at).toBe('2026-10-04T12:00:00Z');
    // « et le statut publié les nomme » : les deux, dans le corps.
    expect(github.published[0]!.summary).toContain('lead');
    expect(github.published[0]!.summary).toContain('2026-10-04T12:00:00Z');
  });

  it('une étiquette posée par un non-habilité est refusée et laissée en place', async () => {
    const state = fakeRepoState({
      configFile: JSON.stringify({
        mode: 'enforce',
        activation: { activatedAt: ACTIVATED },
        resolverOverrideGroup: ['lead'],
      }),
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', body: 'issue: le nom est ambigu\n\nil prête à confusion', author: 'bob' }],
        },
      ],
      labels: [{ name: 'cc-override', by: 'mallory', at: '2026-10-04T12:00:00Z' }],
    });
    const { outcome, github } = await run(state);

    expect(github.published[0]!.conclusion).toBe('failure');
    expect(outcome.result!.notices.map((n) => n.kind)).toContain('exemption-refused');
    expect(github.removedLabels).toEqual([]); // la trace du geste reste visible
  });
});

describe('CA-25 — sortie exploitable : chaque cause en un clic au plus', () => {
  it('le corps du check porte lien, auteur et label de chaque fil bloquant non résolu', async () => {
    const state = fakeRepoState({
      configFile: JSON.stringify({ mode: 'enforce', activation: { activatedAt: ACTIVATED } }),
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', body: 'issue: le nom est ambigu\n\nil prête à confusion', author: 'alice' }],
        },
      ],
    });
    const { github } = await run(state);
    const body = github.published[0]!.summary;

    expect(github.published[0]!.conclusion).toBe('failure');
    expect(body).toContain('https://github.com/acme/demo/pull/42#discussion_rc1'); // le lien
    expect(body).toContain('@alice'); // l'auteur
    expect(body).toContain('issue:'); // le label, via la première ligne du sujet
  });

  it('et pour chaque diagnostic de format : lien, code, sévérité, correction proposée', async () => {
    // Un commentaire peut en porter plusieurs (§3.5.1) ; la liste les rend un par un.
    const state = fakeRepoState({
      configFile: JSON.stringify({ mode: 'enforce', activation: { activatedAt: ACTIVATED } }),
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', body: 'issue: le nom est ambigu\n\nil prête à confusion', author: 'alice' }],
        },
      ],
      issueComments: [{ id: 7, body: 'issue le deux-points manque', author: 'bob' }],
    });
    const { outcome, github } = await run(state);
    const body = github.published[0]!.summary;
    const diagnostic = outcome.result!.formatDiagnostics[0]!;

    expect(diagnostic.code).toMatch(/^E-MALFORMED-PREFIX/);
    expect(body).toContain(`\`${diagnostic.code}\``); // le code
    expect(body).toContain(diagnostic.comment.permalink); // le lien
    expect(body).toContain(`(${diagnostic.severity})`); // la sévérité
    expect(body).toContain(diagnostic.fix!.replacement); // la correction proposée
  });
});

describe('CA-28 — une évaluation ne s’appuie jamais sur le contenu de l’événement', () => {
  it('un commentaire corrigé avant l’exécution produit un statut conforme', async () => {
    // L'événement dit qu'il faut réévaluer ; il ne dit pas quoi. Ici il porte la version
    // fautive, et la plateforme sert la version corrigée : c'est elle qui décide.
    const evenementPerime = {
      pull_request: { number: 42 },
      comment: { id: 'c1', body: 'issue le deux-points manque' },
    };
    const state = fakeRepoState({
      configFile: JSON.stringify({
        mode: 'enforce',
        formatSeverity: 'error',
        activation: { activatedAt: ACTIVATED },
      }),
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'alice',
          comments: [{ id: 'c1', body: 'issue: le deux-points est là\n\nc’est corrigé', author: 'alice' }],
        },
      ],
    });
    const github = fakeGithub(state);
    const adapter = new GithubVerifierAdapter({
      token: 't',
      repository: 'acme/demo',
      event: evenementPerime,
      fetchImpl: github.fetch,
    });
    const outcome = await runOnce({ adapter, floorUrl: null, fetchImpl: github.fetch });

    expect(github.published[0]!.conclusion).toBe('success');
    expect(outcome.result!.counts.nonCompliantComments).toBe(0);
    // Le corps fautif de l'événement n'apparaît nulle part dans la sortie.
    expect(github.published[0]!.summary).not.toContain('issue le deux-points manque');

    // Et surtout : l'état courant a bien été RELU. Sans cette assertion, le test ne
    // protégeait rien — aucun chemin de code ne lit le contenu de l'événement, donc il ne
    // pouvait pas échouer. Une version qui ferait confiance à l'événement sauterait ces
    // lectures, et c'est leur présence qui le révèle.
    expect(github.requests.some((r) => r.url.endsWith('/graphql'))).toBe(true);
    expect(github.requests.some((r) => /\/issues\/42\/comments/.test(r.url))).toBe(true);
    expect(github.requests.some((r) => /\/issues\/42\/labels/.test(r.url))).toBe(true);
  });
});

describe('CA-33 — anti-cache : le vérificateur n’a rien à contourner', () => {
  it('accepte un label ajouté à la config d’organisation dès la PREMIÈRE évaluation', async () => {
    // Le vérificateur n'a pas de cache : la contre-épreuve porte sur l'absence de seconde
    // passe, pas sur un contournement qui n'existe pas ici.
    const state = fakeRepoState({
      configFile: JSON.stringify({
        mode: 'enforce',
        formatSeverity: 'error',
        activation: { activatedAt: ACTIVATED },
      }),
      urls: {
        [FLOOR_URL]: JSON.stringify({ floorVersion: 1, minimumMode: 'off', configUrl: ORG_URL }),
        [ORG_URL]: JSON.stringify({ labels: [{ id: 'security', enabled: true }] }),
      },
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'alice',
          comments: [{ id: 'c1', body: 'security: revoir les droits\n\ndétail du point', author: 'alice' }],
        },
      ],
    });
    const { outcome, github } = await run(state, { floorUrl: FLOOR_URL });

    expect(github.published[0]!.conclusion).toBe('success');
    expect(outcome.result!.counts.nonCompliantComments).toBe(0);
    // Une seule lecture du document d'organisation : aucune seconde passe.
    expect(github.requests.filter((r) => r.url === ORG_URL)).toHaveLength(1);
  });

  it('contre-épreuve : sans ce label déclaré, le même commentaire est non conforme', async () => {
    // Sans quoi le test ci-dessus passerait aussi bien si la configuration d'organisation
    // n'était jamais lue.
    const state = fakeRepoState({
      configFile: JSON.stringify({
        mode: 'enforce',
        formatSeverity: 'error',
        activation: { activatedAt: ACTIVATED },
      }),
      urls: {
        [FLOOR_URL]: JSON.stringify({ floorVersion: 1, minimumMode: 'off', configUrl: ORG_URL }),
        [ORG_URL]: JSON.stringify({}),
      },
      threads: [
        {
          id: 'T1',
          isResolved: true,
          resolvedBy: 'alice',
          comments: [{ id: 'c1', body: 'security: revoir les droits\n\ndétail du point', author: 'alice' }],
        },
      ],
    });
    const { outcome } = await run(state, { floorUrl: FLOOR_URL });
    expect(outcome.result!.counts.nonCompliantComments).toBe(1);
    expect(outcome.result!.formatDiagnostics.map((d) => d.code)).toContain('E-UNKNOWN-LABEL');
  });
});

describe('CA-34 — mesurer avant de contraindre', () => {
  it('`warn` n’échoue jamais et liste ce qui échouerait sous `enforce`, avec les liens', async () => {
    const state = fakeRepoState({
      configFile: JSON.stringify({
        mode: 'warn',
        formatSeverity: 'error',
        activation: { activatedAt: ACTIVATED },
      }),
      threads: [
        {
          id: 'T1',
          isResolved: false,
          comments: [{ id: 'c1', body: 'issue: le nom est ambigu\n\nil prête à confusion', author: 'alice' }],
        },
      ],
      issueComments: [{ id: 7, body: 'issue le deux-points manque', author: 'bob' }],
    });
    const { outcome, github } = await run(state);
    const body = github.published[0]!.summary;

    expect(github.published[0]!.conclusion).toBe('success'); // jamais en échec
    // Mais le corps liste les deux causes, avec leurs liens permanents.
    expect(outcome.result!.counts.unresolvedThreads).toBe(1);
    expect(outcome.result!.counts.nonCompliantComments).toBe(1);
    expect(body).toContain('https://github.com/acme/demo/pull/42#discussion_rc1');
    expect(body).toContain('https://github.com/acme/demo/pull/42#issuecomment-7');
  });
});
