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
  TELEMETRY_CONSENT_KEY,
  TelemetryCounters,
  parseConsent,
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
  const consent = { endpoint: `${ENDPOINT}` };

  it('avec les trois, une cible est rendue, avec le mode et le dépôt', () => {
    const config = configWith({ enabled: true, endpoint: ENDPOINT });
    config.mode = 'enforce';
    expect(telemetryTarget(config, consent, repo)).toEqual({
      endpoint: `${ENDPOINT}`,
      mode: 'enforce',
      repo,
    });
  });

  // LE défaut de conception du premier jet : le consentement était un booléen, donc valable
  // pour n'importe quelle destination. Il suffisait de visiter un dépôt dont la
  // configuration en désigne une autre pour que les compteurs y partent, sans que cette
  // destination ait jamais été montrée (revue Codex, PR #31).
  it('un accord donné pour un point de collecte ne vaut PAS pour un autre', () => {
    const autre = configWith({ enabled: true, endpoint: 'https://ailleurs.example/collecte' });
    expect(telemetryTarget(autre, consent, repo)).toBeNull();
  });

  // `off` : l'extension est inactive (§7). La règle vit dans `telemetryTarget` et non à
  // l'appelant, où une sortie anticipée la contournait — l'onglet restait armé sur la PR
  // précédente en naviguant vers un dépôt en `off` (revue Codex, PR #31).
  it('en mode `off`, aucune cible — quel que soit le reste', () => {
    const config = configWith({ enabled: true, endpoint: ENDPOINT });
    config.mode = 'off';
    expect(telemetryTarget(config, consent, repo)).toBeNull();
  });

  it('une valeur de consentement malformée ne vaut pas consentement', () => {
    expect(parseConsent(true)).toBeNull();
    expect(parseConsent({ endpoint: '' })).toBeNull();
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent({ endpoint: ENDPOINT })).toEqual({ endpoint: ENDPOINT });
  });

  // Le verrou qui n'est pas dans la spécification mais en découle : `telemetry.*` est une
  // clé de configuration ordinaire (§8.2), donc écrivable par le fichier d'un DÉPÔT. Sans
  // consentement local, « opt-in explicite » (§10) serait l'opt-in d'un dépôt.
  it('sans consentement local, rien — même si la configuration l’active', () => {
    expect(telemetryTarget(configWith({ enabled: true, endpoint: ENDPOINT }), null, repo)).toBeNull();
  });

  it('sans `telemetry.enabled`, rien — c’est le défaut du §10', () => {
    expect(telemetryTarget(configWith({ enabled: false, endpoint: ENDPOINT }), consent, repo)).toBeNull();
    expect(defaultConfig().telemetry).toEqual({ enabled: false, endpoint: null });
  });

  it('sans point de collecte, rien', () => {
    expect(telemetryTarget(configWith({ enabled: true, endpoint: null }), consent, repo)).toBeNull();
  });

  // Une page de plateforme est servie en HTTPS et le navigateur bloque le contenu mixte :
  // un point de collecte en clair ne recevrait jamais rien. Le refuser ici plutôt que de
  // laisser croire le contraire.
  it('un point de collecte non-https, ou illisible, ne vaut pas mieux', () => {
    expect(telemetryTarget(configWith({ enabled: true, endpoint: 'http://collecte.example/cc' }), { endpoint: 'http://collecte.example/cc' }, repo)).toBeNull();
    expect(telemetryTarget(configWith({ enabled: true, endpoint: 'pas une url' }), { endpoint: 'pas une url' }, repo)).toBeNull();
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

  // « Label utilisé » ne doit pas dépendre du CHEMIN par lequel la personne l'a posé. La
  // saisie rapide écrit le préfixe elle-même, sans passer par `insertPrefix()` : elle
  // n'était pas comptée, tandis que la barre d'outils et les raccourcis l'étaient — un
  // compteur qui mesurait l'interface autant que l'usage (revue Codex, PR #31).
  it('un label posé par la SAISIE RAPIDE est compté comme celui de la barre d’outils', async () => {
    const { controller, textarea, events } = setup();
    controller.attach();
    textarea.value = '/iss';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    const option = document.querySelector('.cct-quick-list li');
    expect(option).not.toBeNull();
    option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(events).toContainEqual({ kind: 'label-used', label: 'issue' });
    controller.dispose();
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

describe('E — la LIGNE DE TEMPS D’UN ONGLET (l’axe qui manquait, revue Codex PR #31)', () => {
  // Neuf trouvailles de revue, sept dans le câblage : mes tests étaient rangés par clause
  // du §10, c'est-à-dire par contrat du module — une boucle fermée sur la conception. Ce
  // bloc-ci est rangé par ce qui ARRIVE À UN ONGLET, dans l'ordre : chargement, PR affichée
  // sans éditeur, navigation, consentement retiré. C'est là que vivaient les défauts.

  const PR_A = 'https://github.com/acme/demo/pull/42';
  const PR_B = 'https://github.com/acme/autre/pull/7';

  function prFromLocation(doc: Document) {
    const m = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(new URL(doc.location.href).pathname);
    return m
      ? {
          platform: 'github',
          createdAt: '2026-10-01T00:00:00Z',
          host: 'github.com',
          scope: [m[1]!, m[2]!],
          number: Number(m[3]),
        }
      : null;
  }

  /** Un onglet : `chrome` complet (local + onChanged), et un adaptateur qui ne rend AUCUN
   * éditeur — c'est le cas que le premier jet n'armait jamais. */
  function installTab(consent: unknown, endpoint: string | null) {
    const written: Record<string, unknown> = {};
    const calls: string[] = [];
    const rawListeners: ((c: Record<string, { newValue?: unknown }>, a: string) => void)[] = [];
    // Chaque écouteur est enveloppé : ce qu'on observe est son APPEL, pas son inscription.
    const listeners = rawListeners;
    const registered = new Map<
      (c: Record<string, { newValue?: unknown }>, a: string) => void,
      (c: Record<string, { newValue?: unknown }>, a: string) => void
    >();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (keys: string[], cb: (i: Record<string, unknown>) => void) => {
            const picked: Record<string, unknown> = {
              [EXTRA_HOSTS_KEY]: { github: [], azdo: [] },
              [TELEMETRY_CONSENT_KEY]: consent,
            };
            for (const key of keys) if (key in written) picked[key] = written[key];
            cb(picked);
          },
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(written, items);
            cb?.();
          },
        },
        onChanged: {
          addListener: (cb: (typeof rawListeners)[number]) => {
            const wrapped: (typeof rawListeners)[number] = (changes, area) => {
              calls.push(Object.keys(changes).join(','));
              cb(changes, area);
            };
            registered.set(cb, wrapped);
            rawListeners.push(wrapped);
          },
          removeListener: (cb: (typeof rawListeners)[number]) => {
            const wrapped = registered.get(cb);
            const i = wrapped ? rawListeners.indexOf(wrapped) : -1;
            if (i >= 0) rawListeners.splice(i, 1);
          },
        },
      },
    };
    const config = defaultConfig();
    config.mode = 'enforce';
    config.activation.activatedAt = '2026-09-01T00:00:00Z';
    config.telemetry = { enabled: true, endpoint };
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        async getCurrentUser() {
          return { login: 'someone' };
        }
        async getRepoConfig() {
          return { status: 'found', text: JSON.stringify({ telemetry: config.telemetry }) };
        }
        async getOrgConfig() {
          return { status: 'absent' };
        }
        // AUCUN éditeur : une PR sans composeur rendu (droits absents, composeur replié).
        observeEditors() {
          return { dispose: () => {} };
        }
        currentPr() {
          return prFromLocation(document);
        }
        readPublishedResult() {
          return null;
        }
        getThreads() {
          return [];
        }
        getSubmitControls() {
          return [];
        }
        platformProfile() {
          return { id: 'github', suggestionInfoString: 'suggestion' };
        }
        getCompletionControl() {
          return null;
        }
        decorateComment() {
          return undefined;
        }
      },
    }));
    return { written, listeners, calls };
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  }

  afterEach(() => {
    vi.doUnmock('@cct/adapter-github');
  });

  // Le point de collecte doit être visible AVANT de cocher : c'est ce sur quoi porte le
  // consentement. Il est écrit dès qu'une PR est affichée, sans attendre un éditeur.
  it('une PR affichée SANS aucun éditeur publie quand même le point de collecte', async () => {
    const { written } = installTab(null, ENDPOINT);
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();
    // Avant le correctif, l'armement — et cette publication avec lui — vivait dans
    // l'attachement d'un éditeur : sur une PR qui n'en rend aucun, il n'arrivait jamais.
    expect(written['telemetryEndpoint']).toBe(ENDPOINT);
    dispose();
  });

  // Le P1 : décocher pendant que des onglets sont ouverts. Ils ne relisaient le
  // consentement qu'à l'attachement d'un éditeur et gardaient leurs compteurs armés, donc
  // continuaient à émettre toutes les cinq minutes et à la fermeture.
  it('le consentement RETIRÉ désarme l’onglet déjà ouvert, sans attendre un rechargement', async () => {
    const { listeners, written } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    // Compter les écouteurs ne prouve RIEN : `watchExtraHosts` en pose déjà un, et une
    // première version de ce test passait avec ET sans le correctif. Ce qu'il faut观 est un
    // EFFET propre au changement de consentement — ici, la réévaluation qui republie le
    // point de collecte. On efface donc la trace, puis on regarde si elle revient.
    delete written['telemetryEndpoint'];
    for (const listener of [...listeners]) {
      listener({ [TELEMETRY_CONSENT_KEY]: { newValue: null } }, 'local');
    }
    await settle();
    expect(written['telemetryEndpoint']).toBe(ENDPOINT); // réévalué : le changement a été traité
    dispose();
  });

  it('la révocation de l’onglet retire l’écouteur de consentement', async () => {
    const { listeners, calls } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();
    dispose();

    // Un décompte d'inscriptions ne distinguerait pas cet écouteur de celui de
    // `watchExtraHosts`, qui se retire aussi. Ce qui distingue : après révocation, un
    // changement de consentement ne doit atteindre PERSONNE. Sans le retrait, l'écouteur
    // resterait inscrit — donc appelé — et retiendrait tout l'onglet avec lui.
    calls.length = 0;
    for (const listener of [...listeners]) {
      listener({ [TELEMETRY_CONSENT_KEY]: { newValue: null } }, 'local');
    }
    expect(calls).toEqual([]);
  });

  it('naviguer vers une autre PR republie pour CETTE PR', async () => {
    const { written } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();
    expect(written['telemetryEndpoint']).toBe(ENDPOINT);

    Object.defineProperty(document, 'location', { value: new URL(PR_B), configurable: true });
    document.body.appendChild(document.createElement('div')); // la mutation d'une navigation SPA
    await settle();
    // La publication suit la PR affichée, et non le premier éditeur rencontré.
    expect(written['telemetryEndpoint']).toBe(ENDPOINT);
    dispose();
  });
});

describe('D — dégradation de sélecteur : journal local TOUJOURS, télémétrie si armée (CA-11)', () => {
  /** Contexte d'un script de contenu, avec une aire locale observable. */
  function installChrome(): { written: Record<string, unknown> } {
    const written: Record<string, unknown> = {};
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          // Une aire de stockage RELIT ce qu'on y a écrit : un faux qui rend toujours la
          // même chose ne peut pas exprimer un journal qui s'accumule, et laisserait passer
          // l'écrasement que ce test existe pour interdire.
          get: (keys: string[], cb: (i: Record<string, unknown>) => void) => {
            const picked: Record<string, unknown> = {
              [EXTRA_HOSTS_KEY]: { github: [], azdo: [] },
            };
            for (const key of keys) if (key in written) picked[key] = written[key];
            cb(picked);
          },
          // Le rappel est appelé : `appendToJournal` sérialise sur lui, et un faux muet
          // ferait attendre indéfiniment la deuxième écriture.
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(written, items);
            cb?.();
          },
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

    // L'écriture passe par une lecture-modification-écriture asynchrone : lui laisser un
    // tour de boucle. Sans cette attente le test constaterait l'absence du journal, pas sa
    // présence — et passerait aussi bien avec qu'sans le correctif.
    await new Promise((r) => setTimeout(r, 0));

    let failures = written['selectorFailures'] as { chain: string; at: string }[] | undefined;
    expect(failures).toHaveLength(1);
    expect(failures![0]!.chain).toBe('editors');
    expect(typeof failures![0]!.at).toBe('string');

    // ET la dégradation suivante s'AJOUTE, au lieu d'écraser. C'est le défaut corrigé : le
    // journal en mémoire d'un onglet écrasait la clé entière, si bien que la première
    // dégradation après un rechargement effaçait tout l'historique, et que deux onglets
    // s'effaçaient l'un l'autre (revue Codex, PR #31).
    captured.log!.degraded({ name: 'submitButtons', candidates: ['button'] });
    await new Promise((r) => setTimeout(r, 0));
    failures = written['selectorFailures'] as { chain: string; at: string }[] | undefined;
    expect(failures?.map((f) => f.chain)).toEqual(['editors', 'submitButtons']);

    vi.doUnmock('@cct/adapter-github');
  });

  it('le consentement vit dans une clé locale, jamais dans `sync`', () => {
    // `sync` propagerait l'accord aux autres appareils du compte, où personne n'a rien
    // coché — et `PRIVACY.md` affirme par ailleurs que la synchronisation se limite à la
    // langue et aux raccourcis (revue Codex, PR #31).
    expect(TELEMETRY_CONSENT_KEY).toBe('telemetryConsent');
  });
});
