// @vitest-environment happy-dom
// Télémétrie (§10, §9.4, CA-11). Elle existait dans le schéma de configuration
// (`telemetry.enabled`, `telemetry.endpoint`, lues et validées par `core/`) et n'était
// câblée NULLE PART : `SelectorLog` acceptait un rappel que personne ne lui passait, et
// aucun compteur n'était tenu. La configuration promettait donc une fonction qui n'existait
// pas — le document de justification des permissions du store le signalait comme un écart.
//
// Ce que le §10 autorise, et que ces tests bornent : « compteurs agrégés (label utilisé,
// code d'erreur, mode, dépôt) — jamais de texte libre », désactivés par défaut, opt-in
// explicite. Chaque test ci-dessous tient l'une de ces clauses.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { EditorController } from '../src/editor-controller.js';
import {
  TELEMETRY_OPT_IN_KEY,
  TelemetryCounters,
  telemetryTarget,
  type TelemetryEvent,
} from '../src/telemetry.js';
import { EXTRA_HOSTS_KEY } from '../src/host-platform.js';

const ENDPOINT = 'https://collecte.example/cc';

function configWith(telemetry: { enabled: boolean; endpoint: string | null }) {
  const config = defaultConfig();
  config.telemetry = telemetry;
  return config;
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('A — les trois verrous : rien ne part si l’un manque (§10)', () => {
  const repo = 'github.com/acme/demo';

  it('avec les trois, une cible est rendue, avec le mode et le dépôt', () => {
    const config = configWith({ enabled: true, endpoint: ENDPOINT });
    config.mode = 'enforce';
    expect(telemetryTarget(config, true, repo)).toEqual({
      endpoint: `${ENDPOINT}`,
      mode: 'enforce',
      repo,
    });
  });

  // Le verrou qui n'est pas dans la spécification mais en découle : `telemetry.*` est une
  // clé de configuration ordinaire (§8.2), donc écrivable par le fichier d'un DÉPÔT. Sans
  // consentement local, « opt-in explicite » (§10) serait l'opt-in d'un dépôt.
  it('sans l’opt-in local, rien — même si la configuration l’active', () => {
    expect(telemetryTarget(configWith({ enabled: true, endpoint: ENDPOINT }), false, repo)).toBeNull();
  });

  it('sans `telemetry.enabled`, rien — c’est le défaut du §10', () => {
    expect(telemetryTarget(configWith({ enabled: false, endpoint: ENDPOINT }), true, repo)).toBeNull();
    expect(defaultConfig().telemetry).toEqual({ enabled: false, endpoint: null });
  });

  it('sans point de collecte, rien', () => {
    expect(telemetryTarget(configWith({ enabled: true, endpoint: null }), true, repo)).toBeNull();
  });

  // Une page de plateforme est servie en HTTPS et le navigateur bloque le contenu mixte :
  // un point de collecte en clair ne recevrait jamais rien. Le refuser ici plutôt que de
  // laisser croire le contraire.
  it('un point de collecte non-https, ou illisible, ne vaut pas mieux', () => {
    expect(telemetryTarget(configWith({ enabled: true, endpoint: 'http://collecte.example/cc' }), true, repo)).toBeNull();
    expect(telemetryTarget(configWith({ enabled: true, endpoint: 'pas une url' }), true, repo)).toBeNull();
  });
});

describe('B — des COMPTEURS, agrégés, et jamais de texte libre (§10)', () => {
  function armed(): { counters: TelemetryCounters; sent: { endpoint: string; body: string }[] } {
    const sent: { endpoint: string; body: string }[] = [];
    const counters = new TelemetryCounters((endpoint, body) => sent.push({ endpoint, body }));
    counters.arm({ endpoint: ENDPOINT, mode: 'enforce', repo: 'github.com/acme/demo' });
    return { counters, sent };
  }

  it('agrège plusieurs occurrences en un compteur, et n’émet qu’à la vidange', () => {
    const { counters, sent } = armed();
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.count({ kind: 'validation-code', code: 'E-NO-LABEL' });
    expect(sent).toEqual([]); // rien n'est parti pendant la frappe

    counters.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toBe(ENDPOINT);
    expect(JSON.parse(sent[0]!.body)).toEqual({
      v: 1,
      mode: 'enforce',
      repo: 'github.com/acme/demo',
      counters: { 'label:issue': 2, 'code:E-NO-LABEL': 1 },
    });
  });

  it('une vidange sans compteur n’émet RIEN', () => {
    const { counters, sent } = armed();
    counters.flush();
    counters.flush();
    expect(sent).toEqual([]);
    // Une requête périodique vers un point de collecte serait en soi une donnée : elle dit
    // qu'un onglet est ouvert sur ce dépôt. Le §10 n'autorise pas cela.
  });

  it('les compteurs repartent de zéro après émission', () => {
    const { counters, sent } = armed();
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.flush();
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.flush();
    expect(JSON.parse(sent[1]!.body).counters).toEqual({ 'label:issue': 1 });
  });

  it('désarmé, il ne compte rien — et n’émet rien à la vidange', () => {
    const sent: unknown[] = [];
    const counters = new TelemetryCounters((e, b) => sent.push({ e, b }));
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.flush();
    expect(counters.armed).toBe(false);
    expect(sent).toEqual([]);
  });

  it('désarmer JETTE ce qui était compté, plutôt que de l’envoyer plus tard', () => {
    const { counters, sent } = armed();
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.arm(null);
    counters.arm({ endpoint: ENDPOINT, mode: 'warn', repo: 'github.com/acme/autre' });
    counters.flush();
    expect(sent).toEqual([]);
  });

  // Un onglet reste ouvert quand on passe d'une PR à l'autre : la cible change sous les
  // compteurs déjà tenus. Les garder attribuerait au nouveau dépôt ce qui a été compté sur
  // l'ancien — une donnée fausse chez le destinataire, pas seulement une imprécision.
  it('changer de cible émet d’abord ce qui a été compté pour la précédente', () => {
    const { counters, sent } = armed();
    counters.count({ kind: 'label-used', label: 'issue' });
    counters.arm({ endpoint: ENDPOINT, mode: 'warn', repo: 'github.com/acme/autre' });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.body).repo).toBe('github.com/acme/demo');

    counters.count({ kind: 'label-used', label: 'todo' });
    counters.flush();
    expect(JSON.parse(sent[1]!.body)).toMatchObject({
      repo: 'github.com/acme/autre',
      mode: 'warn',
      counters: { 'label:todo': 1 },
    });
  });

  // Le cœur de « jamais de texte libre » : ce n'est pas une intention, c'est un vocabulaire
  // fermé appliqué à la clé. Une valeur hors forme est ABANDONNÉE, pas assainie — assainir
  // laisserait passer un fragment de ce qu'on voulait ne jamais envoyer.
  it('une valeur qui n’est pas un identifiant est abandonnée, pas assainie', () => {
    const { counters, sent } = armed();
    counters.count({ kind: 'label-used', label: 'le nom est ambigu, voir #42' });
    counters.count({ kind: 'validation-code', code: 'E-NO-LABEL\nfuite' });
    counters.count({ kind: 'selector-degradation', chain: 'a'.repeat(200) });
    counters.flush();
    expect(sent).toEqual([]);
  });

  it('un émetteur dont le transport lève ne remonte jamais l’erreur', () => {
    const counters = new TelemetryCounters(() => {
      throw new Error('collecteur injoignable');
    });
    counters.arm({ endpoint: ENDPOINT, mode: 'enforce', repo: 'github.com/acme/demo' });
    counters.count({ kind: 'label-used', label: 'issue' });
    expect(() => counters.flush()).not.toThrow();
  });
});

describe('C — ce que le contrôleur d’éditeur compte (§10 : label utilisé, code d’erreur)', () => {
  const pr: PrRef = {
    platform: 'github',
    createdAt: '2026-10-01T00:00:00Z',
    host: 'github.com',
    scope: ['acme', 'demo'],
    number: 42,
  };

  function setup(): { controller: EditorController; textarea: HTMLTextAreaElement; events: TelemetryEvent[] } {
    const host = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.className = 'CommentBox-input';
    const submit = document.createElement('button');
    submit.type = 'submit';
    host.append(textarea, submit);
    document.body.appendChild(host);
    const editor: EditorHandle = {
      id: 'e1',
      element: textarea,
      context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
    };
    const adapter: Partial<PlatformAdapter> = {
      platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
      getSubmitControls: (): SubmitControl[] => [{ element: submit, kind: 'submit' }],
      readValue: () => textarea.value,
      writeValue: (_e, text, caret) => writeToTextField(textarea, text, caret),
    };
    const config = defaultConfig();
    config.mode = 'enforce';
    config.activation.activatedAt = '2026-09-01T00:00:00Z';
    const events: TelemetryEvent[] = [];
    const controller = new EditorController({
      adapter: adapter as PlatformAdapter,
      editor,
      resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
      published: null,
      lang: 'fr',
      currentUserLogin: 'alice',
      telemetry: (event) => events.push(event),
    });
    return { controller, textarea, events };
  }

  it('l’identifiant du label posé est compté — jamais la ligne écrite', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'le nom est ambigu';
    controller.insertPrefix('issue', [], false);
    expect(events).toContainEqual({ kind: 'label-used', label: 'issue' });
    expect(JSON.stringify(events)).not.toContain('ambigu');
  });

  // `refresh()` s'exécute à chaque frappe débattue. Compter à chaque passage ferait d'un
  // « code d'erreur » un compteur de frappes — ce n'est plus un agrégat, et cela en dit
  // bien plus long sur ce que la personne écrit.
  it('un code n’est compté qu’à son APPARITION, pas à chaque frappe', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'sans label';
    controller.refresh();
    controller.refresh();
    controller.refresh();
    const codes = events.filter((e) => e.kind === 'validation-code');
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes.map((c) => JSON.stringify(c))).size).toBe(codes.length);
  });

  it('un code disparu puis revenu est recompté', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'sans label';
    controller.refresh();
    const first = events.filter((e) => e.kind === 'validation-code').length;
    textarea.value = 'issue: le nom est ambigu';
    controller.refresh();
    textarea.value = 'encore sans label';
    controller.refresh();
    expect(events.filter((e) => e.kind === 'validation-code').length).toBeGreaterThan(first);
  });
});

describe('D — dégradation de sélecteur : journal local TOUJOURS, télémétrie si armée (CA-11)', () => {
  /** Contexte d'un script de contenu, avec une aire locale observable. */
  function installChrome(): { written: Record<string, unknown> } {
    const written: Record<string, unknown> = {};
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) =>
            cb({ [EXTRA_HOSTS_KEY]: { github: [], azdo: [] } }),
          set: (items: Record<string, unknown>) => Object.assign(written, items),
        },
        sync: {
          // Opt-in local ABSENT : c'est le cas nominal, et il doit laisser le journal local
          // intact tout en interdisant toute émission.
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}),
        },
      },
    };
    return { written };
  }

  it('le journal local est écrit même sans opt-in — la télémétrie, elle, ne l’est pas', async () => {
    const { written } = installChrome();
    let captured: { log?: { degraded: (chain: { name: string; candidates: string[] }) => void } } = {};
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        constructor(opts: typeof captured) {
          captured = opts;
          Object.assign(this, {
            async getCurrentUser() {
              return { login: 'someone' };
            },
            async getRepoConfig() {
              return { status: 'absent' };
            },
            async getOrgConfig() {
              return { status: 'absent' };
            },
            observeEditors() {
              return { dispose: () => {} };
            },
            currentPr() {
              return null;
            },
            readPublishedResult() {
              return null;
            },
          });
        }
      },
    }));
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/42'),
      configurable: true,
    });
    await bootstrap(document);

    // Le journal de sélecteurs a bien été confié à l'adaptateur — sans quoi rien de ce que
    // le §9.4 promet n'a lieu, et la page d'options resterait vide pour toujours.
    expect(typeof captured.log?.degraded).toBe('function');
    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });

    const failures = written['selectorFailures'] as { chain: string; at: string }[] | undefined;
    expect(failures).toHaveLength(1);
    expect(failures![0]!.chain).toBe('editors');
    expect(typeof failures![0]!.at).toBe('string');

    vi.doUnmock('@cct/adapter-github');
  });

  it('l’opt-in vit dans une clé de préférence, pas dans la configuration', () => {
    expect(TELEMETRY_OPT_IN_KEY).toBe('telemetryOptIn');
  });
});
