// Ce que le runner fournit, et ce que le vérificateur en déduit (§A.8.1).

import { describe, expect, it } from 'vitest';
import {
  InputError,
  pullRequestNumberFromEvent,
  resolveInputs,
  runMarkerFrom,
} from '../src/main.js';

const BASE = {
  CCT_TOKEN: 'ghs_token',
  GITHUB_REPOSITORY: 'acme/demo',
  GITHUB_RUN_ID: '1234',
  GITHUB_RUN_ATTEMPT: '1',
};

describe('de l’événement à la PR', () => {
  it.each(['pull_request', 'pull_request_target', 'pull_request_review', 'pull_request_review_comment'])(
    '%s → le numéro porté par la charge',
    (event) => {
      expect(pullRequestNumberFromEvent(event, { pull_request: { number: 42 } })).toBe(42);
    }
  );

  it('issue_comment sur une issue qui n’EST PAS une PR → aucune PR', () => {
    // `issue.pull_request` n'existe que sur les issues qui SONT des PR : sans lui, un
    // commentaire d'issue ferait évaluer une PR qui n'existe pas.
    expect(pullRequestNumberFromEvent('issue_comment', { issue: { number: 7 } })).toBeNull();
  });

  it('issue_comment sur une issue qui EST une PR → son numéro', () => {
    expect(
      pullRequestNumberFromEvent('issue_comment', {
        issue: { number: 7, pull_request: { url: 'https://…' } },
      })
    ).toBe(7);
  });

  it('les événements qui ne désignent aucune PR déclenchent la réconciliation, pas une erreur', () => {
    // `schedule` et `workflow_run` sont exactement les deux parades du §A.8.2 : leur
    // refuser une PR doit les envoyer sur les PR ouvertes, jamais les faire échouer.
    expect(pullRequestNumberFromEvent('schedule', {})).toBeNull();
    expect(pullRequestNumberFromEvent('workflow_run', { workflow_run: {} })).toBeNull();
    expect(pullRequestNumberFromEvent('pull_request', null)).toBeNull();
  });
});

describe('entrées du runner', () => {
  it('sans jeton : erreur qui nomme ce qu’il faut passer', () => {
    expect(() => resolveInputs({ ...BASE, CCT_TOKEN: undefined })).toThrow(InputError);
  });

  it('GITHUB_REPOSITORY mal formé : erreur, jamais un scope à moitié rempli', () => {
    expect(() => resolveInputs({ ...BASE, GITHUB_REPOSITORY: 'demo' })).toThrow(/owner\/repo/);
  });

  it('`pr-number` explicite l’emporte sur l’événement — c’est la réexécution manuelle (§6.4)', () => {
    expect(resolveInputs({ ...BASE, CCT_PR_NUMBER: '7' }).prNumber).toBe(7);
    expect(() => resolveInputs({ ...BASE, CCT_PR_NUMBER: 'sept' })).toThrow(/invalid pr-number/);
  });

  it('sans événement ni numéro : réconciliation de toutes les PR ouvertes', () => {
    expect(resolveInputs(BASE).prNumber).toBeNull();
  });
});

describe('GHES — l’instance vient du runner, pas d’une constante (§A.8.4)', () => {
  it('l’hôte des PrRef dérive de GITHUB_SERVER_URL', () => {
    const r = resolveInputs({
      ...BASE,
      GITHUB_API_URL: 'https://ghe.interne.example/api/v3',
      GITHUB_SERVER_URL: 'https://ghe.interne.example',
    });
    expect(r.client.webHost).toBe('ghe.interne.example');
  });

  it('à défaut, il se dérive de GITHUB_API_URL — une seule identité d’hôte par PR (§6.4)', () => {
    const r = resolveInputs({ ...BASE, GITHUB_API_URL: 'https://ghe.interne.example/api/v3' });
    expect(r.client.webHost).toBe('ghe.interne.example');
  });

  it('sur github.com, l’hôte web n’est pas l’hôte d’API', () => {
    expect(resolveInputs(BASE).client.webHost).toBe('github.com');
  });
});

describe('marqueur de récence (besoin 3, §6.4.1)', () => {
  it('une exécution plus tardive produit un marqueur strictement plus grand', () => {
    const early = runMarkerFrom(BASE, new Date('2026-11-01T00:00:00Z'));
    const late = runMarkerFrom(BASE, new Date('2026-11-01T00:00:01Z'));
    expect(late > early).toBe(true);
  });

  it('à horodatage égal, l’identifiant d’exécution départage — et il est PADDÉ', () => {
    // Sans le padding, la comparaison lexicographique dirait que « 9 » est postérieur à
    // « 10 », et une exécution ancienne écraserait une récente.
    const at = new Date('2026-11-01T00:00:00Z');
    const nine = runMarkerFrom({ ...BASE, GITHUB_RUN_ID: '9' }, at);
    const ten = runMarkerFrom({ ...BASE, GITHUB_RUN_ID: '10' }, at);
    expect(ten > nine).toBe(true);
  });

  it('une reprise de la même exécution est postérieure à sa première tentative', () => {
    const at = new Date('2026-11-01T00:00:00Z');
    const first = runMarkerFrom({ ...BASE, GITHUB_RUN_ATTEMPT: '1' }, at);
    const second = runMarkerFrom({ ...BASE, GITHUB_RUN_ATTEMPT: '2' }, at);
    expect(second > first).toBe(true);
  });
});
