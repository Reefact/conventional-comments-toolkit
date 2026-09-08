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

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
});

/** Contexte d'un script de contenu, avec une aire locale qui RELIT ce qu'on y écrit —
 * `appendToJournal` relit avant d'écrire, un faux muet ne pourrait pas l'exprimer. */
function installChrome(): { written: Record<string, unknown> } {
  const written: Record<string, unknown> = {};
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
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
  return { written };
}

type Captured = { log?: { degraded: (chain: { name: string; candidates: string[] }) => void } };

/** Amarre le journal à un adaptateur mocké, comme le fait `telemetry.test.ts` : c'est le
 * seul moyen de déclencher une dégradation sans page réelle. */
async function bootstrapWith(url: string, prs: (PrRef | null)[] = [null]): Promise<Captured> {
  let captured: Captured = {};
  // `currentPr()` est interrogé à chaque passage de l'observateur : une file permet de
  // simuler une navigation d'une PR à l'autre, la dernière valeur valant ensuite pour
  // toujours.
  const queue = [...prs];
  const currentPr = () => (queue.length > 1 ? queue.shift()! : queue[0]!);
  vi.doMock('@cct/adapter-github', () => ({
    GithubClientAdapter: class {
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
    },
  }));
  const { bootstrap } = await import('../src/content-internal.js');
  setLocation(url);
  await bootstrap(document);
  return captured;
}

function setLocation(url: string): void {
  Object.defineProperty(document, 'location', { value: new URL(url), configurable: true });
}

function journal(written: Record<string, unknown>): { chain: string; at: string; url?: string }[] {
  return (written['selectorFailures'] as { chain: string; at: string; url?: string }[] | undefined) ?? [];
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

    vi.doUnmock('@cct/adapter-github');
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

    vi.doUnmock('@cct/adapter-github');
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

    vi.doUnmock('@cct/adapter-github');
  });

  it('l’entrée porte trois champs, et rien d’autre', async () => {
    const { written } = installChrome();
    const captured = await bootstrapWith('https://github.com/acme/demo/pull/42?view=1');

    captured.log!.degraded({ name: 'merge-button', candidates: ['button'] });
    await settle();

    // Ce que ce test dit : la forme de l'entrée LOCALE. Ce qu'il ne dit pas, et qu'il ne
    // faut pas lui faire dire : ce qui part au collecteur — cela se mesure là où la charge
    // est construite, dans `degradation.test.ts` (égalité exacte sur l'événement
    // `{ kind, chain }`) et `telemetry.test.ts` (égalité exacte sur le corps émis).
    expect(Object.keys(journal(written)[0]!).sort()).toEqual(['at', 'chain', 'url']);
    expect(journal(written)[0]!.url).toContain('?view=1');

    vi.doUnmock('@cct/adapter-github');
  });
});
