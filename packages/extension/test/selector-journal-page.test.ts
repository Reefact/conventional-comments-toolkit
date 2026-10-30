// @vitest-environment happy-dom
//
// L'adresse de la page dans le journal de dégradation de sélecteurs (§9.4, CA-11).
//
// Le journal disait QUELLE chaîne avait échoué et QUAND, jamais OÙ : devant quatre lignes
// horodatées à la même seconde, rien ne permettait de savoir si elles venaient d'une seule
// page ou de quatre. L'entrée porte désormais l'adresse relevée.
//
// Le test qui compte ici est le second : GitHub navigue en SPA, et `bootstrap()` ne
// s'exécute qu'à l'injection. Une implémentation qui reprendrait l'URL lue à ce
// moment-là passerait le premier test sans rien enregistrer de juste.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrRef } from '@cct/core';
import { EXTRA_HOSTS_KEY } from '../src/host-platform.js';
import type { ErrorEntry, JournalEntry, SelectorFailure } from '../src/journal-entry.js';
import { testFactories, fakeAdapter, clearFakeAdapters } from './helpers/factories.js';

// Chaque `bootstrap()` pose ses écouteurs sur la `window` PARTAGÉE de happy-dom : un test qui
// ne défait pas le sien laisse ses gestionnaires d'erreur aux suivants, et une seule exception
// serait alors relevée par autant d'onglets fantômes qu'il y a eu de tests avant elle.
const bootstrapped: (() => void)[] = [];

/** Ce que l'adaptateur de test doit casser, à la demande, UNE fois — remis à zéro après chaque test. */
const behavior = { failRender: false };

afterEach(() => {
  behavior.failRender = false;
  for (const dispose of bootstrapped.splice(0)) dispose();
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
});

/** Contexte d'un script de contenu, avec une aire locale qui RELIT ce qu'on y écrit —
 * `appendToJournal` relit avant d'écrire, un faux muet ne pourrait pas l'exprimer. */
function installChrome(): { written: Record<string, unknown>; clear: () => void } {
  const written: Record<string, unknown> = {};
  const listeners: ((c: Record<string, { newValue?: unknown }>, a: string) => void)[] = [];
  // Effacer depuis la page d'options, tel que le navigateur le fait voir à un onglet : la clé
  // disparaît, ET `onChanged` le notifie. Un faux qui retirerait la clé sans notifier
  // décrirait un navigateur qui n'existe pas.
  const clear = () => {
    delete written['selectorFailures'];
    for (const l of listeners) l({ selectorFailures: {} }, 'local');
  };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l), removeListener: () => {} },
      local: {
        get: (keys: string[], cb: (i: Record<string, unknown>) => void) => {
          // `github.com` doit être CLASSÉ, sinon `bootstrap()` n'instancie aucun adaptateur
          // et le journal n'est confié à personne — le test échouerait pour une raison qui
          // n'a rien à voir avec ce qu'il mesure.
          const picked: Record<string, unknown> = {
            [EXTRA_HOSTS_KEY]: { github: ['github.com'], azdo: [] },
          };
          for (const key of keys) if (key in written) picked[key] = written[key];
          cb(picked);
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(written, items);
          cb?.();
        },
      },
    },
  };
  return { written, clear };
}

type Captured = {
  dispose?: () => void;
  log?: {
    degraded: (chain: { name: string; candidates: string[] }) => void;
    forgetSeen: () => void;
  };
};

/** Amarre le journal à un adaptateur mocké, comme le fait `telemetry.test.ts` : c'est le
 * seul moyen de déclencher une dégradation sans page réelle. */
async function bootstrapWith(url: string, prs: (PrRef | null)[] = [null]): Promise<Captured> {
  let captured: Captured = {};
  // `currentPr()` est interrogé à chaque passage de l'observateur : une file permet de
  // simuler une navigation d'une PR à l'autre, la dernière valeur valant ensuite pour
  // toujours.
  const queue = [...prs];
  const currentPr = () => (queue.length > 1 ? queue.shift()! : queue[0]!);
  fakeAdapter('github', class {
      constructor(opts: Captured) {
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
          getBannerMount() {
            return null;
          },
          getRenderedThreadElements() {
            // UNE fois : une panne persistante traverserait aussi le rendu asynchrone, dont la chaîne
            // de promesses n'a pas de `.catch` — un rejet non géré, qui ferait échouer toute la suite.
            if (behavior.failRender) {
              behavior.failRender = false;
              throw new Error('render failed');
            }
            return [];
          },
          getRenderedComments() {
            return [];
          },
          getRenderedCommentElements() {
            return [];
          },
          currentPr() {
            return currentPr();
          },
          readPublishedResult() {
            return null;
          },
          // L'observateur de navigation interroge la page à chaque tour pour décider si elle
          // a bougé : sans ces réponses, il lève, et le test échouerait sur son harnais
          // plutôt que sur ce qu'il mesure.
          matches: () => true,
          platformProfile: () => ({ id: 'github', suggestionInfoString: null }),
          getSubmitControls: () => [],
          readValue: () => '',
          writeValue: () => {},
          async getThreads() {
            return [];
          },
          getCompletionControl: () => null,
        });
      }
    });
  const { bootstrap } = await import('../src/content-internal.js');
  setLocation(url);
  // En deux temps : `captured.dispose = await …` évalue `captured` AVANT l'attente, or le
  // constructeur de l'adaptateur le réaffecte pendant elle — le résultat irait à l'ancien objet.
  const dispose = await bootstrap(document, testFactories());
  captured.dispose = dispose;
  bootstrapped.push(dispose);
  return captured;
}

function setLocation(url: string): void {
  Object.defineProperty(document, 'location', { value: new URL(url), configurable: true });
}

function journal(written: Record<string, unknown>): JournalEntry[] {
  return (written['selectorFailures'] as JournalEntry[] | undefined) ?? [];
}

/** L'écriture passe par une lecture-modification-écriture asynchrone : lui laisser un tour
 * de boucle, sans quoi le test constaterait une absence plutôt qu'une présence. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('§9.4 / CA-11 — le journal enregistre la page, pas seulement la chaîne', () => {
  it('l’entrée porte l’adresse ENTIÈRE relevée, paramètres et fragment compris', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith(
      'https://github.com/acme/demo/pull/42/files?diff=split#discussion_r7'
    );

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    await settle();

    // Entière, et non réduite à « quelle page » : c'est cette adresse que le lien de la page
    // d'options ouvre, et l'ancre en fait partie. La réduction se fait au RENDU (`pageKey`).
    expect(journal(written)[0]!.url).toBe(
      'https://github.com/acme/demo/pull/42/files?diff=split#discussion_r7'
    );

    clearFakeAdapters();
  });

  it('l’adresse est celle du moment de la dégradation, pas celle de l’injection', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42');

    // Navigation SPA : la page change sous l'onglet, sans nouvelle injection.
    setLocation('https://github.com/acme/demo/pull/99/changes');
    captured.log!.degraded({ name: 'comment-body', candidates: ['.comment-body'] });
    await settle();

    // Sans la relecture de `location` dans le rappel, cette entrée porterait `/pull/42` —
    // l'URL d'injection —, et le journal accuserait la mauvaise page.
    expect(journal(written)[0]!.url).toBe('https://github.com/acme/demo/pull/99/changes');

    clearFakeAdapters();
  });

  it('après une navigation SPA, la MÊME chaîne réenregistre la nouvelle page', async () => {
    // Le défaut signalé en revue (PR #70) : `SelectorLog` ne notifie qu'une fois par chaîne
    // et par onglet. Relire `location` au moment de la dégradation ne servait donc qu'à la
    // PREMIÈRE PR d'un onglet — sur toutes les suivantes, la chaîne restait muette et
    // l'entrée gardait la page la plus ancienne. C'est exactement le cas que la PR
    // annonçait couvrir.
    const { written } = installChrome();
    const pr = (number: number): PrRef => ({
      platform: 'github',
      host: 'github.com',
      scope: ['acme', 'demo'],
      number,
      createdAt: null,
    });
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42', [pr(42), pr(99)]);

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    await settle();
    expect(journal(written)[0]!.url).toBe('https://github.com/acme/demo/pull/42');

    // La navigation : l'URL change, et une mutation du DOM réveille l'observateur — c'est
    // ainsi que Turbo et React changent de PR, sans rechargement.
    setLocation('https://github.com/acme/demo/pull/99');
    document.body.appendChild(document.createElement('span'));
    for (let i = 0; i < 12; i++) await settle();

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    await settle();

    // Une seule ligne — la déduplication du journal partagé tient —, mais à jour.
    expect(journal(written)).toHaveLength(1);
    expect(journal(written)[0]!.url).toBe('https://github.com/acme/demo/pull/99');

    clearFakeAdapters();
  });

  it('après effacement, la même chaîne réenregistre sur la MÊME page', async () => {
    // « Effacer puis mesurer à nouveau » ne mesurait rien : le journal partait, mais les
    // onglets ouverts tenaient toujours la chaîne pour déjà signalée, et reproduire le
    // défaut sur la page même où on venait de le voir n'écrivait rien. Il fallait changer de
    // PR ou recharger (revue Reefact, PR #70).
    const { written, clear } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42/files');

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    await settle();
    expect(journal(written)).toHaveLength(1);

    clear();
    expect(journal(written)).toHaveLength(0);

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    // `appendToJournal` sérialise ses écritures : après plusieurs passages, la file compte
    // plus d'un maillon, et un seul tour de boucle ne suffit plus à la vider.
    for (let i = 0; i < 8; i++) await settle();
    expect(journal(written)).toHaveLength(1);
    expect(journal(written)[0]!.url).toBe('https://github.com/acme/demo/pull/42/files');

    clearFakeAdapters();
  });

  it('l’entrée porte ses champs de diagnostic, et rien d’autre', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42?view=1');

    captured.log!.degraded({ name: 'merge-button', candidates: ['button.a', 'button.b'], problem: 'completion-control' });
    await settle();

    // Ce que ce test dit : la forme de l'entrée LOCALE. Ce qu'il ne dit pas, et qu'il ne
    // faut pas lui faire dire : ce qui part au collecteur — cela se mesure là où la charge
    // est construite, dans `degradation.test.ts` (égalité exacte sur l'événement
    // `{ kind, chain }`) et `telemetry.test.ts` (égalité exacte sur le corps émis).
    const entry = journal(written)[0]!;
    expect(Object.keys(entry).sort()).toEqual([
      'at',
      'candidates',
      'chain',
      'count',
      'firstAt',
      'platform',
      'problem',
      'url',
    ]);
    expect(entry.url).toContain('?view=1');
    // Les candidats DANS L'ORDRE où la chaîne les a essayés : c'est ce qu'un développeur ouvre
    // dans les outils du navigateur pour comprendre pourquoi aucun n'a répondu.
    expect(entry.candidates).toEqual(['button.a', 'button.b']);
    expect(entry.platform).toBe('github');
    expect(entry.problem).toBe('completion-control');
    expect(entry.count).toBe(1);
    expect(entry.firstAt).toBe(entry.at);

    clearFakeAdapters();
  });

  it('une visite de plus fusionne dans la ligne : première date conservée, relevés comptés', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42');

    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    await settle();
    const first = journal(written)[0]!;

    // La page suivante : `forgetSeen()` est ce que fait l'onglet en changeant de PR.
    await new Promise((r) => setTimeout(r, 2));
    captured.log!.forgetSeen();
    captured.log!.degraded({ name: 'editors', candidates: ['textarea'] });
    for (let i = 0; i < 4; i++) await settle();

    // Une seule ligne — la borne du journal n'a pas bougé —, mais elle sait qu'elle a été
    // relevée deux fois, et depuis quand.
    expect(journal(written)).toHaveLength(1);
    const merged = journal(written)[0]!;
    expect(merged.count).toBe(2);
    expect(merged.firstAt).toBe(first.at);
    expect(merged.at).not.toBe(first.at);

    clearFakeAdapters();
  });
});

describe('§9.4 — les exceptions de l’extension vont au même journal', () => {
  /** Ce que le navigateur fait quand le script de contenu laisse échapper une exception. */
  const throwInExtension = (error: unknown) =>
    window.dispatchEvent(new ErrorEvent('error', { error, message: String(error) }));

  it('une exception relevée devient une ligne `error`, avec sa page et sa plateforme', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42/files');

    throwInExtension(new TypeError('x is undefined'));
    await settle();

    const entry = journal(written)[0]!;
    expect(entry.kind).toBe('error');
    expect(entry).toMatchObject({
      message: 'TypeError: x is undefined',
      url: 'https://github.com/acme/demo/pull/42/files',
      platform: 'github',
      count: 1,
    });
    expect(typeof (entry as ErrorEntry).stack).toBe('string');

    captured.dispose?.();
    clearFakeAdapters();
  });

  it('la même exception, vingt fois, n’écrit qu’une ligne — pas une écriture par tour de boucle', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42');

    for (let i = 0; i < 20; i++) throwInExtension(new Error('boom'));
    for (let i = 0; i < 4; i++) await settle();

    expect(journal(written)).toHaveLength(1);
    expect((journal(written)[0] as ErrorEntry).count).toBe(1);

    captured.dispose?.();
    clearFakeAdapters();
  });

  // Mesuré dans un vrai Chromium : après un rechargement de l'extension, `chrome.runtime.id`
  // devient `undefined` alors que `chrome.runtime` reste un objet — et l'erreur qui en découle
  // est tantôt « Extension context invalidated. », tantôt un TypeError sur `chrome.storage`.
  it('une extension rechargée sous l’onglet ne remplit pas le journal', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42');
    (globalThis as { chrome: { runtime?: unknown } }).chrome.runtime = {}; // plus d'`id`

    throwInExtension(new TypeError("Cannot read properties of undefined (reading 'local')"));
    throwInExtension(new Error('Extension context invalidated.'));
    await settle();

    expect(journal(written)).toHaveLength(0);

    captured.dispose?.();
    clearFakeAdapters();
  });

  it('retiré avec le reste : une fois l’onglet défait, plus rien ne s’écrit', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42');

    captured.dispose?.();
    throwInExtension(new Error('after dispose'));
    await settle();

    expect(journal(written)).toHaveLength(0);
    clearFakeAdapters();
  });

  it('après un changement de PR, la même exception se relève', async () => {
    const { written } = installChrome();
    const pr = (number: number): PrRef => ({
      platform: 'github',
      host: 'github.com',
      scope: ['acme', 'demo'],
      number,
      createdAt: null,
    });
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42', [pr(42), pr(99)]);

    throwInExtension(new Error('boom'));
    await settle();
    expect((journal(written)[0] as ErrorEntry).count).toBe(1);

    setLocation('https://github.com/acme/demo/pull/99');
    document.body.appendChild(document.createElement('span'));
    for (let i = 0; i < 12; i++) await settle();

    throwInExtension(new Error('boom'));
    for (let i = 0; i < 4; i++) await settle();

    // Une ligne, mais relevée sur deux pages : c'est ce que `count` dit.
    expect(journal(written)).toHaveLength(1);
    expect((journal(written)[0] as ErrorEntry).count).toBe(2);

    captured.dispose?.();
    clearFakeAdapters();
  });

  // Le rendu de la page : `run()` est enrobé, et ce qu'il lève est relevé « pendant l'affichage ».
  // Sans l'enrobage, la ligne existerait quand même — par le filet — mais sans contexte.
  //
  // La PREMIÈRE passe de `run()`, au `bootstrap` : sa lecture est synchrone, donc l'exception
  // remonte jusqu'ici, où le test l'attend. Provoquée par une mutation, elle tomberait dans le
  // rendu asynchrone, dont la chaîne de promesses n'a pas de `.catch` : un rejet non géré,
  // que Vitest compte comme un échec de toute la suite. DERNIER test du fichier : le `bootstrap`
  // avorté ne rend pas de `dispose`, ses écouteurs restent sur la `window` partagée.
  it('une exception du rendu de la page est relevée avec le contexte `render`', async () => {
    const { written } = installChrome();
    const pr: PrRef = { platform: 'github', host: 'github.com', scope: ['acme', 'demo'], number: 42, createdAt: null };
    behavior.failRender = true;

    await expect(bootstrapWith('https://github.com/acme/demo/pull/42', [pr])).rejects.toThrow('render failed');
    for (let i = 0; i < 4; i++) await settle();

    const errors = journal(written).filter((e): e is ErrorEntry => e.kind === 'error');
    expect(errors.map((e) => [e.context, e.message])).toEqual([['render', 'Error: render failed']]);

    clearFakeAdapters();
  });
});
