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
  canonicalEndpoint,
  managedEndpoint,
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
  const active = configWith({ enabled: true, endpoint: ENDPOINT });

  // LE point de conception, arrêté au troisième round de revue : le point de collecte ne
  // vient plus de la configuration effective — qu'un dépôt peut écrire — mais du SEUL canal
  // de politique d'entreprise. Le même raisonnement que le §8.1.1 tient pour `configUrl`.
  it('le point de collecte vient de la POLITIQUE, jamais de la configuration', () => {
    expect(managedEndpoint({ enabled: true, endpoint: ENDPOINT })).toBe(`${ENDPOINT}`);
    // Déclarée mais désactivée, absente, ou malformée : rien.
    expect(managedEndpoint({ enabled: false, endpoint: ENDPOINT })).toBeNull();
    expect(managedEndpoint({ endpoint: ENDPOINT })).toBeNull();
    expect(managedEndpoint(undefined)).toBeNull();
    expect(managedEndpoint({ enabled: true, endpoint: 'http://collecte.example' })).toBeNull();
  });

  it('avec les trois, une cible est rendue, avec le mode et le dépôt', () => {
    active.mode = 'enforce';
    expect(telemetryTarget(active, `${ENDPOINT}`, consent, repo)).toEqual({
      endpoint: `${ENDPOINT}`,
      mode: 'enforce',
      repo,
    });
  });

  it('un accord donné pour un point de collecte ne vaut PAS pour un autre', () => {
    expect(
      telemetryTarget(active, 'https://ailleurs.example/collecte', consent, repo)
    ).toBeNull();
  });

  it('en mode `off`, aucune cible — quel que soit le reste', () => {
    expect(telemetryTarget({ mode: 'off' }, `${ENDPOINT}`, consent, repo)).toBeNull();
  });

  it('sans consentement local, rien — même si la politique déclare un point de collecte', () => {
    expect(telemetryTarget(active, `${ENDPOINT}`, null, repo)).toBeNull();
  });

  it('sans point de collecte déclaré par la politique, rien', () => {
    expect(telemetryTarget(active, null, consent, repo)).toBeNull();
  });

  // La forme d'URL la PLUS COURANTE — sans barre oblique finale — rendait la fonctionnalité
  // inerte en silence : la page affichait et stockait `https://collecte.example`, la
  // comparaison portait sur `https://collecte.example/`, et le consentement ne coïncidait
  // jamais. Aucune erreur nulle part (revue Codex, PR #31).
  it('un point de collecte sans barre finale s’arme quand même — une seule forme canonique', () => {
    const consenti = canonicalEndpoint('https://collecte.example');
    expect(consenti).toBe('https://collecte.example/');
    expect(managedEndpoint({ enabled: true, endpoint: 'https://collecte.example' })).toBe(consenti);
    expect(telemetryTarget(active, consenti, { endpoint: consenti! }, repo)).toMatchObject({
      endpoint: 'https://collecte.example/',
    });
  });

  it('la casse de l’hôte et le port par défaut ne font pas deux points de collecte', () => {
    expect(canonicalEndpoint('https://Collecte.Example:443/cc')).toBe('https://collecte.example/cc');
    expect(canonicalEndpoint('http://collecte.example/cc')).toBeNull(); // contenu mixte : bloqué
    expect(canonicalEndpoint('pas une url')).toBeNull();
  });

  it('un consentement stocké sous une forme non canonique reste utilisable', () => {
    expect(parseConsent({ endpoint: 'https://collecte.example' })).toEqual({
      endpoint: 'https://collecte.example/',
    });
  });

  it('une valeur de consentement malformée ne vaut pas consentement', () => {
    expect(parseConsent(true)).toBeNull();
    expect(parseConsent({ endpoint: '' })).toBeNull();
    expect(parseConsent(null)).toBeNull();
  });

  it('la configuration par défaut ne déclare aucune télémétrie', () => {
    expect(defaultConfig().telemetry).toEqual({ enabled: false, endpoint: null });
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

  function setup(): {
    controller: EditorController;
    textarea: HTMLTextAreaElement;
    events: TelemetryEvent[];
    armed: { value: boolean };
  } {
    // L'émetteur d'un onglet naît DÉSARMÉ et le reste jusqu'à la résolution de la
    // configuration : un faux qui accepterait toujours ne pourrait pas exprimer cet
    // intervalle, où vivait le défaut.
    const armed = { value: true };
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
      // Rend `true` : c'est le contrat de l'émetteur armé — « j'ai compté ». Un faux qui
      // rendrait `undefined` décrirait un émetteur désarmé, et le contrôleur cesserait à
      // juste titre de retenir les codes comme comptés.
      telemetry: (event) => {
        events.push(event);
        return armed.value; // `false` = émetteur désarmé : il a refusé de compter
      },
    });
    return { controller, textarea, events, armed };
  }

  it('l’identifiant du label posé est compté — jamais la ligne écrite', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'le nom est ambigu';
    controller.insertPrefix('issue', [], false);
    expect(events).toContainEqual({ kind: 'label-used', label: 'issue' });
    expect(JSON.stringify(events)).not.toContain('ambigu');
  });

  // Cliquer deux fois le même bouton pose puis RETIRE le préfixe. Compter les deux gonflait
  // l'usage d'un label qu'on a justement renoncé à employer (revue Codex, PR #31).
  it('retirer un label par bascule n’est PAS un usage', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'le nom est ambigu';
    controller.insertPrefix('issue', [], true); // pose
    controller.insertPrefix('issue', [], true); // retire
    expect(events.filter((e) => e.kind === 'label-used')).toEqual([
      { kind: 'label-used', label: 'issue' },
    ]);
  });

  // Le MÊME point d'entrée sert aux décorations : la barre d'outils rappelle
  // `insertPrefix()` avec le label courant pour poser `(blocking)`, puis `(non-blocking)`,
  // puis une décoration libre… Rien n'est retiré, donc `removed` vaut `false`, et chaque
  // retouche recomptait le label. L'agrégat mesurait alors l'hésitation sur les décorations
  // plutôt que les labels posés (revue Codex, PR #31).
  it('changer de DÉCORATION sur un label déjà posé n’est pas un nouvel usage', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'le nom est ambigu';
    controller.insertPrefix('issue', [], false); // pose le label : UN usage
    controller.insertPrefix(null, ['blocking'], false); // décoration
    const afterFirstDecoration = textarea.value;
    controller.insertPrefix(null, ['non-blocking'], false); // on change d'avis
    expect(events.filter((e) => e.kind === 'label-used')).toEqual([
      { kind: 'label-used', label: 'issue' },
    ]);
    // La ligne de préfixe a bel et bien été RÉÉCRITE à chaque appel : c'est un compteur
    // qu'on corrige, pas une insertion qu'on aurait cessé de faire.
    expect(afterFirstDecoration).toBe('issue (blocking): le nom est ambigu');
    expect(textarea.value).toBe('issue (non-blocking): le nom est ambigu');
  });

  it('changer de LABEL sur un commentaire déjà labellisé compte le nouveau', () => {
    const { controller, textarea, events } = setup();
    textarea.value = 'le nom est ambigu';
    controller.insertPrefix('issue', [], false);
    controller.insertPrefix('praise', [], false);
    expect(events.filter((e) => e.kind === 'label-used')).toEqual([
      { kind: 'label-used', label: 'issue' },
      { kind: 'label-used', label: 'praise' },
    ]);
  });

  // §3.2 : « l'alias n'est pas un label distinct […] il est comptabilisé sous son label
  // canonique ». Depuis qu'un geste de décoration réinsère le préfixe TEL QU'IL EST ÉCRIT
  // (revue Codex, PR #35), le contrôleur reçoit parfois un alias : comparer et compter sur
  // cette orthographe ferait d'un alias un label de plus dans l'agrégat, et ferait passer
  // une simple décoration pour un changement de label.
  it('un alias est compté sous son label CANONIQUE', () => {
    const { controller, textarea, events } = setup();
    controller.deps.resolved.config.labels.find((l) => l.id === 'issue')!.aliases = ['bug'];
    textarea.value = 'le nom est ambigu';

    controller.insertPrefix('bug', undefined, false);
    expect(events.filter((e) => e.kind === 'label-used')).toEqual([
      { kind: 'label-used', label: 'issue' },
    ]);
  });

  it('décorer un commentaire écrit avec un alias n’est pas un nouvel usage', () => {
    const { controller, textarea, events } = setup();
    controller.deps.resolved.config.labels.find((l) => l.id === 'issue')!.aliases = ['bug'];
    textarea.value = 'bug: le nom est ambigu';

    // Ce que la barre envoie sur un clic de décoration : le label tel qu'il est écrit.
    controller.insertPrefix('bug', ['blocking'], false);
    expect(textarea.value).toBe('bug (blocking): le nom est ambigu');
    expect(events.filter((e) => e.kind === 'label-used')).toEqual([]);
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

  // L'autre chemin de la saisie rapide : les abréviations dépliées par Tab. Seule la liste
  // de complétion avait été câblée, si bien que `?i` → `issue: ` restait invisible du
  // compteur (revue Codex, PR #31).
  it('un label posé par une ABRÉVIATION Tab est compté, un dépliement quelconque ne l’est pas', async () => {
    const { controller, textarea, events } = setup();
    controller.deps.resolved.config.shortcuts.abbreviations = { '?i': 'issue: ', '?x': 'TODO(perf) ' };
    controller.attach();

    textarea.value = '?i';
    textarea.selectionStart = textarea.selectionEnd = 2;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(events).toContainEqual({ kind: 'label-used', label: 'issue' });

    // Un dépliement qui ne pose AUCUN label du vocabulaire ne se compte pas : ce qui part
    // est un identifiant de la configuration, jamais du texte deviné.
    let avant = events.filter((e) => e.kind === 'label-used').length;
    textarea.value = '?x';
    textarea.selectionStart = textarea.selectionEnd = 2;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(events.filter((e) => e.kind === 'label-used').length).toBe(avant);

    // ...et une abréviation dépliée AILLEURS QU'EN TÊTE ne pose aucun préfixe : `issue: `
    // inséré au milieu d'une phrase n'est le préfixe de rien. La question se pose sur le
    // RÉSULTAT, pas sur le texte déplié (revue Codex, PR #31).
    avant = events.filter((e) => e.kind === 'label-used').length;
    textarea.value = 'Some text ?i';
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(textarea.value).toContain('Some text issue: '); // le dépliement a bien eu lieu
    expect(events.filter((e) => e.kind === 'label-used').length).toBe(avant); // ...sans compter
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

  // Un diagnostic présent AVANT que l'émetteur soit armé était marqué « déjà compté » alors
  // qu'il venait d'être jeté : il n'était plus jamais émis de toute la vie de l'éditeur — il
  // ne comptait que s'il disparaissait puis revenait (revue Codex, PR #31).
  it('un code apparu AVANT l’armement est compté une fois la télémétrie armée', () => {
    const { controller, textarea, events, armed } = setup();
    armed.value = false; // l'onglet n'a pas encore résolu sa configuration
    textarea.value = 'sans label';
    controller.refresh();
    const refusés = events.filter((e) => e.kind === 'validation-code').length;
    expect(refusés).toBeGreaterThan(0); // proposés, mais refusés par l'émetteur

    armed.value = true; // la configuration est résolue, l'onglet s'arme
    controller.refresh();
    // Le diagnostic est toujours affiché, et il doit maintenant être compté.
    expect(events.filter((e) => e.kind === 'validation-code').length).toBeGreaterThan(refusés);
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

describe('G — écritures de stockage : un diagnostic ne fait jamais échouer son appelant', () => {
  // Une mise à jour, un rechargement ou une désactivation de l'extension invalide le
  // contexte du script de contenu, et `chrome.storage.local.set` lève alors SYNCHRONEMENT.
  // La centralisation dans `storage.ts` n'entourait que la recherche de propriété, pas
  // l'appel : un diagnostic inoffensif pouvait faire échouer la résolution de configuration
  // qui l'appelait (revue Codex, PR #31).
  it('un `set` qui lève ne remonte pas — ces clés sont un diagnostic', async () => {
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}),
          set: () => {
            throw new Error('Extension context invalidated.');
          },
        },
      },
    };
    const { writeCurrentState, appendToJournal } = await import('../src/storage.js');
    expect(() => writeCurrentState({ degradedState: false })).not.toThrow();
    await expect(appendToJournal('selectorFailures', [{ chain: 'x', at: 'now' }], 50)).resolves.toBeUndefined();
  });
});

describe('E — la LIGNE DE TEMPS D’UN ONGLET (l’axe qui manquait, revue Codex PR #31)', () => {
  // Neuf trouvailles de revue, sept dans le câblage : mes tests étaient rangés par clause
  // du §10, c'est-à-dire par contrat du module — une boucle fermée sur la conception. Ce
  // bloc-ci est rangé par ce qui ARRIVE À UN ONGLET, dans l'ordre : chargement, PR affichée
  // sans éditeur, navigation, consentement retiré. C'est là que vivaient les défauts.

  const PR_A = 'https://github.com/acme/demo/pull/42';
  const PR_B = 'https://github.com/acme/autre/pull/7';
  const PR_C = 'https://github.com/acme/troisieme/pull/9';

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
  function installTab(initialConsent: unknown, endpoint: string | null) {
    const written: Record<string, unknown> = {};
    /** Le consentement doit pouvoir CHANGER : un faux qui rend toujours la valeur initiale
     * ne peut pas exprimer un retrait, et le test passerait alors qu'un onglet continue
     * d'émettre (CLAUDE.md, règle 2 — un faux est une affirmation sur l'environnement). */
    const consentHolder: { value: unknown } = { value: initialConsent };
    /** La politique d'entreprise : c'est de LÀ que vient le point de collecte, et de nulle
     * part ailleurs. Un faux qui le ferait venir de la configuration décrirait la
     * conception d'avant le troisième round de revue. */
    const policy: Record<string, unknown> = {
      telemetry: endpoint === null ? { enabled: false } : { enabled: true, endpoint },
    };
    /** Le journal confié à l'adaptateur : c'est par lui qu'on peut faire COMPTER quelque
     * chose sans éditeur, donc observer à quel dépôt l'onglet attribue ce qu'il compte. */
    const captured: { log?: { degraded: (c: { name: string; candidates: string[] }) => void } } = {};
    /** Retards injectables : une course ne se teste pas avec un faux instantané, qui ne
     * peut pas exprimer la fenêtre où le défaut vit (CLAUDE.md, règle 2). */
    const delays: { repoConfig: number; consentRead: number } = { repoConfig: 0, consentRead: 0 };
    /** Combien de fois la configuration a été résolue : c'est l'effet observable d'un
     * réarmement, depuis que le point de collecte ne transite plus par une clé partagée. */
    const resolves = { count: 0 };
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
              [TELEMETRY_CONSENT_KEY]: consentHolder.value,
            };
            for (const key of keys) if (key in written) picked[key] = written[key];
            const wait = keys.includes(TELEMETRY_CONSENT_KEY) ? delays.consentRead : 0;
            if (wait === 0) cb(picked);
            else setTimeout(() => cb(picked), wait);
          },
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(written, items);
            cb?.();
          },
        },
        managed: {
          get: (cb: (i: Record<string, unknown>) => void) => cb(policy),
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
    // La configuration du dépôt ne porte PLUS la télémétrie : si ce faux la portait, il
    // décrirait un monde où un dépôt peut désigner le collecteur — celui qu'on vient
    // justement de fermer.
    vi.doMock('@cct/adapter-github', () => ({
      GithubClientAdapter: class {
        constructor(opts: { log?: typeof captured.log }) {
          captured.log = opts.log;
        }
        async getCurrentUser() {
          return { login: 'someone' };
        }
        async getRepoConfig() {
          resolves.count += 1;
          if (delays.repoConfig > 0) {
            await new Promise((r) => setTimeout(r, delays.repoConfig));
          }
          return { status: 'absent' };
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
    return { written, listeners, calls, captured, delays, policy, resolves, consentHolder };
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  }

  afterEach(() => {
    vi.doUnmock('@cct/adapter-github');
  });

  // Une PR sans composeur rendu (droits de commentaire absents, composeur replié) doit
  // remonter ses dégradations comme les autres (CA-11). Avant le correctif, l'armement
  // vivait dans l'attachement d'un éditeur : sur une telle PR, il n'arrivait jamais.
  it('une PR affichée SANS aucun éditeur arme quand même, et émet', async () => {
    const { captured } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    flushByPagehide();
    await settle();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ repo: 'github.com/acme/demo' });
    expect(Object.keys(bodies[0]!['counters'] as object)).toContain('selector:editors');
    dispose();
  });

  // L'armement ne peut pas être ATTENDU : la navigation, elle, est synchrone. `armFor()`
  // part et se suspend aussitôt sur la résolution de configuration, pendant que le rendu
  // continue et sonde les sélecteurs — un bouton d'envoi introuvable au chargement d'une PR
  // tombe donc en plein dans cet intervalle. Un émetteur encore désarmé le refusait, et un
  // diagnostic ne se répète pas : la dégradation la plus attendue de toutes était celle qui
  // ne partait jamais (revue Codex, PR #31).
  it('une dégradation sondée PENDANT l’armement est comptée une fois l’armement conclu', async () => {
    const { captured, delays } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    // Sans ce retard, le faux serait instantané et l'intervalle où vit le défaut n'aurait
    // aucune durée — le test passerait avec ET sans le correctif (CLAUDE.md, règle 3).
    delays.repoConfig = 10;
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);

    // AVANT tout `settle()` : l'armement est encore en vol.
    captured.log!.degraded({ name: 'completion-control', candidates: ['button'] });

    await new Promise((r) => setTimeout(r, 30)); // l'armement se conclut ici
    await settle();
    flushByPagehide();
    await settle();

    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0]!['counters'] as object)).toContain('selector:completion-control');
    dispose();
  });

  // Et l'inverse, qui est la raison d'être de la règle : ce qui a été sondé pendant
  // l'armement ne part QUE si l'armement conclut qu'on en a le droit. Le tampon ne doit pas
  // devenir une file d'attente qui finit par émettre.
  //
  // Ce test-ci passe avec ET sans la condition `target !== null` du rejeu — c'est dit
  // franchement plutôt que compté comme une vérification par retrait : ce n'est pas cette
  // condition qui le tient, mais la règle de l'émetteur lui-même (« compté sans être armé
  // est perdu »), et le rejeu ne fait alors que retomber dessus. Ce qu'il verrouille est la
  // conséquence de bout en bout, et elle vaut d'être verrouillée : c'est la propriété qui
  // sépare un tampon d'une file d'attente.
  it('une dégradation sondée pendant un armement qui REFUSE est perdue, pas différée', async () => {
    const { captured, delays } = installTab({ endpoint: `${ENDPOINT}` }, null);
    delays.repoConfig = 10;
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);

    captured.log!.degraded({ name: 'completion-control', candidates: ['button'] });

    await new Promise((r) => setTimeout(r, 30));
    await settle();
    flushByPagehide();
    await settle();

    expect(bodies).toEqual([]);
    dispose();
  });

  // La zone `managed` ne porte pas que la télémétrie : `allowedHosts` et `floor` y vivent
  // aussi. Désarmer JETTE les compteurs — c'est voulu quand on vient d'apprendre qu'on n'a
  // peut-être plus le droit d'émettre, et gratuit sinon. Un hôte d'entreprise ajouté par la
  // politique faisait perdre jusqu'à cinq minutes de comptage à tous les onglets ouverts,
  // pour se réarmer aussitôt sur exactement la même cible (revue Codex, PR #31).
  it('un changement de politique SANS rapport avec la télémétrie ne jette pas les compteurs', async () => {
    const { listeners, captured } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    for (const listener of [...listeners]) {
      listener({ allowedHosts: { newValue: [{ host: 'ghes.example.corp', platform: 'github' }] } }, 'managed');
    }
    await settle();

    flushByPagehide();
    await settle();
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0]!['counters'] as object)).toContain('selector:editors');
    dispose();
  });

  // Le P1 : décocher pendant que des onglets sont ouverts. Ils ne relisaient le consentement
  // qu'à l'attachement d'un éditeur et gardaient leurs compteurs armés, donc continuaient à
  // émettre toutes les cinq minutes et à la fermeture.
  it('le consentement RETIRÉ désarme l’onglet déjà ouvert : plus rien ne part', async () => {
    const { listeners, captured, consentHolder } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    // Retirer VRAIMENT l'accord, puis notifier — c'est ce que fait la page d'options.
    consentHolder.value = null;
    for (const listener of [...listeners]) {
      listener({ [TELEMETRY_CONSENT_KEY]: { newValue: null } }, 'local');
    }
    await settle();

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    flushByPagehide();
    await settle();
    expect(bodies).toEqual([]);
    dispose();
  });

  // La politique d'entreprise peut changer sous un onglet ouvert, comme le consentement.
  it('une politique qui retire le point de collecte désarme l’onglet ouvert', async () => {
    const { listeners, captured, policy } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    policy['telemetry'] = { enabled: false };
    for (const listener of [...listeners]) listener({ telemetry: { newValue: null } }, 'managed');
    await settle();

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    flushByPagehide();
    await settle();
    expect(bodies).toEqual([]);
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

  /** Ce que le collecteur reçoit RÉELLEMENT. Le transport passe par `fetch` : le stuber est
   * la seule façon d'observer à quel dépôt l'onglet attribue ce qu'il compte, sans exposer
   * l'émetteur pour les besoins du test. La vidange est provoquée par `pagehide`, comme à la
   * fermeture d'un onglet. */
  function collectPosts(): { bodies: Record<string, unknown>[] } {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { body?: string }) => {
      if (init?.body) bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return { ok: true } as unknown as Response;
    });
    return { bodies };
  }

  const flushByPagehide = (): void => {
    window.dispatchEvent(new Event('pagehide'));
  };

  // La fenêtre entre « la PR a changé » et « sa configuration est résolue » : l'onglet
  // restait armé sur la PRÉCÉDENTE, et une dégradation rencontrée sur la nouvelle était
  // comptée puis émise au nom de l'ancienne (revue Codex, PR #31).
  it('ce qui est compté pendant la résolution d’une NOUVELLE PR n’est pas attribué à l’ancienne', async () => {
    const { captured, delays } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    // Une dégradation sur A, légitimement attribuée à A.
    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });

    // Navigation vers B, dont la configuration met du temps à se résoudre.
    delays.repoConfig = 30;
    Object.defineProperty(document, 'location', { value: new URL(PR_B), configurable: true });
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 0)); // la navigation est vue, B n'est pas résolue

    // Une dégradation rencontrée sur B PENDANT cette fenêtre.
    captured.log!.degraded({ name: 'submitButtons', candidates: ['button'] });

    await new Promise((r) => setTimeout(r, 60));
    await settle();
    flushByPagehide();
    await settle();

    const versA = bodies.filter((b) => b['repo'] === 'github.com/acme/demo');
    // A reçoit ce qui a été compté sur A — le désarmement protège de la mauvaise
    // attribution, il ne doit pas faire perdre la mesure.
    expect(versA.flatMap((b) => Object.keys(b['counters'] as object))).toContain('selector:editors');
    // ...et surtout PAS ce qui a été compté sur B.
    expect(versA.flatMap((b) => Object.keys(b['counters'] as object))).not.toContain(
      'selector:submitButtons'
    );
    dispose();
  });

  // La lecture du consentement est un SECOND aller-retour asynchrone. Une première version
  // ne re-vérifiait la clé de PR qu'AVANT celui-ci : l'invocation partie pour une PR
  // précédente pouvait réarmer après qu'une plus récente avait armé la bonne cible (revue
  // Codex, PR #31).
  //
  // Ma première rédaction de ce test ne prouvait rien : elle « renaviguait » vers la MÊME
  // PR, or `armFor` n'est rappelé que sur changement de clé — la course n'était jamais
  // créée, et le test passait avec ET sans le correctif. Il faut donc trois PR distinctes :
  // B part avec une lecture de consentement lente, C arme entre-temps, et B revient trop
  // tard.
  it('une invocation partie pour une PR précédente ne réarme pas après la lecture du consentement', async () => {
    const { captured, delays } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    // B : sa lecture de consentement traîne.
    delays.consentRead = 60;
    Object.defineProperty(document, 'location', { value: new URL(PR_B), configurable: true });
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 5));

    // C arrive pendant, et s'arme normalement.
    delays.consentRead = 0;
    Object.defineProperty(document, 'location', { value: new URL(PR_C), configurable: true });
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 120)); // B revient trop tard
    await settle();

    // Ce qui est compté maintenant appartient à C. Sans la re-vérification, l'invocation de
    // B avait réarmé par-dessus, et ceci partait sous le dépôt de B.
    captured.log!.degraded({ name: 'threads', candidates: ['div'] });
    flushByPagehide();
    await settle();

    const repos = bodies
      .filter((b) => Object.keys(b['counters'] as object).includes('selector:threads'))
      .map((b) => b['repo']);
    expect(repos).toEqual(['github.com/acme/troisieme']);
    dispose();
  });

  it('naviguer vers une autre PR compte sous CETTE PR', async () => {
    const { captured } = installTab({ endpoint: `${ENDPOINT}` }, ENDPOINT);
    const { bodies } = collectPosts();
    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL(PR_A), configurable: true });
    const dispose = await bootstrap(document);
    await settle();

    Object.defineProperty(document, 'location', { value: new URL(PR_B), configurable: true });
    document.body.appendChild(document.createElement('div')); // la mutation d'une navigation SPA
    await settle();

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    flushByPagehide();
    await settle();

    // L'armement suit la PR affichée, et non le premier éditeur rencontré.
    expect(bodies.map((b) => b['repo'])).toEqual(['github.com/acme/autre']);
    dispose();
  });
});

describe('F — la page d’options : consentir à ce que la POLITIQUE déclare (PR #31)', () => {
  function mountOptionsDom(): void {
    document.body.innerHTML = `
      <input type="text" id="host-input" />
      <select id="host-platform"><option value="" selected></option></select>
      <button id="host-add" type="button"></button>
      <span id="host-add-state"></span>
      <ul id="host-list"></ul>
      <select id="language"></select>
      <textarea id="direct-shortcuts"></textarea>
      <button id="direct-shortcuts-save"></button>
      <span id="direct-shortcuts-state"></span>
      <input type="checkbox" id="telemetry-opt-in" />
      <p id="telemetry-endpoint"></p>
      <p id="degraded-state"></p>
      <p id="selector-log"></p>`;
  }

  function installOptionsChrome(stored: Record<string, unknown>, managed: Record<string, unknown>) {
    (globalThis as { chrome?: unknown }).chrome = {
      permissions: {
        request: () => {},
        getAll: (cb: (p: { origins?: string[] }) => void) => cb({ origins: [] }),
      },
      storage: {
        local: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({ ...stored }),
          set: (items: Record<string, unknown>, cb?: () => void) => {
            Object.assign(stored, items);
            cb?.();
          },
        },
        sync: {
          get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({}),
          set: () => {},
        },
        managed: { get: (cb: (i: Record<string, unknown>) => void) => cb(managed) },
        onChanged: { addListener: () => {} },
      },
    };
  }

  it('le consentement enregistre le point de collecte DÉCLARÉ PAR LA POLITIQUE, celui qui est affiché', async () => {
    const stored: Record<string, unknown> = {};
    mountOptionsDom();
    installOptionsChrome(stored, { telemetry: { enabled: true, endpoint: ENDPOINT } });
    await import('../src/options/options.js');
    await new Promise((r) => setTimeout(r, 0));

    const box = document.getElementById('telemetry-opt-in') as HTMLInputElement;
    const line = document.getElementById('telemetry-endpoint')!;
    expect(line.textContent).toContain(`${ENDPOINT}`);
    // La phrase peut désormais nommer la politique d'entreprise sans mentir : le point de
    // collecte ne peut plus venir du fichier d'un dépôt (revue Codex, PR #31).
    expect(line.textContent).toContain("politique d'entreprise");

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(stored[TELEMETRY_CONSENT_KEY]).toEqual({ endpoint: `${ENDPOINT}` });
  });

  // Le P1 : une politique retirée emprisonnait l'accord donné. La case se désactivait, plus
  // rien ne permettait de révoquer, et des onglets ouverts pouvaient encore émettre.
  it('un accord stocké reste RÉVOCABLE même si la politique ne déclare plus rien', async () => {
    const stored: Record<string, unknown> = {
      [TELEMETRY_CONSENT_KEY]: { endpoint: `${ENDPOINT}` },
    };
    mountOptionsDom();
    installOptionsChrome(stored, { telemetry: { enabled: false } });
    await import('../src/options/options.js');
    await new Promise((r) => setTimeout(r, 0));

    const box = document.getElementById('telemetry-opt-in') as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(document.getElementById('telemetry-endpoint')!.textContent).toContain('reste enregistré');

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(stored[TELEMETRY_CONSENT_KEY]).toBeNull();
  });

  it('sans politique ni accord, la case n’a rien à autoriser', async () => {
    mountOptionsDom();
    installOptionsChrome({}, {});
    await import('../src/options/options.js');
    await new Promise((r) => setTimeout(r, 0));
    expect((document.getElementById('telemetry-opt-in') as HTMLInputElement).disabled).toBe(true);
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
