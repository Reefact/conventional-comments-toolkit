// @vitest-environment happy-dom
// Non-régression : la barre (bandeau, §5.5) doit se ré-afficher sans rechargement complet
// de la page. Trois causes indépendantes, corrigées séparément (D1/D2/D3, revue du
// 2026-08-24) :
//
// D1 — bootstrap() n'armait les observateurs QUE si la page chargée était déjà une PR.
//      Sur le chemin le plus courant (liste des PR, notifications, tableau de bord → clic
//      sur une PR, en SPA), la page de CHARGEMENT n'est jamais la PR elle-même : l'extension
//      restait intégralement inactive.
// D2 — le budget de rattrapage de l'hydratation se comptait en nombre de tentatives (20),
//      épuisées en quelques dizaines de millisecondes dès que la configuration était en
//      cache — bien avant que le contenu réel (les fils) n'ait le temps d'arriver.
//      Remplacé par une fenêtre de TEMPS.
// D3 — une fois qu'un premier rendu avait montré quelque chose, plus rien ne retentait sur
//      la même PR : ce qui arrivait après coup n'était jamais adopté (CA-03). Le cas
//      d'origine était le résumé publié par un vérificateur, retiré depuis (§2) ; la
//      garantie vaut aujourd'hui pour les fils de la page, seule source du bandeau (§5.5).
//
// Revue automatisée de la PR (Codex, 2026-08-24) — cinq constats confirmés, tous des
// conséquences directes du fait que D3 rend possible un DEUXIÈME rendu sur la même PR,
// ce qu'aucun chemin de code n'avait jamais eu à affronter avant :
//   - la signature de reprise ne couvrait pas tout ce que le bandeau affichait ;
//   - un premier rendu où une partie de la page précède le reste (fils, commentaires) se
//     figeait sans jamais attraper ce qui arrivait ensuite ;
//   - un badge posé par decorateComment() sur un commentaire est lu par getThreads()/
//     getRenderedComments() au tour SUIVANT, corrompant le corps qu'analyze() reçoit ;
//   - un rendu posé pendant que le mode était actif survivait à un passage à off ;
//   - clearStaleBanner remettait `display: ''` sur TOUT fil rendu, y compris ceux que la
//     plateforme masque elle-même (réduit, virtualisé) — jamais seulement ceux du filtre.
//
// Convention de ce fichier : chaque `observePrChromeNavigation`/`bootstrap()` arme un
// MutationObserver vivant, JAMAIS disposé (comme en production), sur le `document` GLOBAL
// happy-dom partagé par tout le fichier — `afterEach` ne fait que vider `document.body`, il
// ne désarme aucun observateur. Un observateur qui n'atteint jamais un état durablement
// dormant (fenêtre de rattrapage jamais expirée, contenu jamais stabilisé) resterait
// réactif aux mutations des tests SUIVANTS et pourrait leur retirer leur bandeau via
// `clearStaleBanner()`. Chaque test qui n'atteint pas cet état naturellement (navigation
// vers `pr → null`, ou contenu de page stable) le neutralise explicitement avant
// sa fin (voir les commentaires « Neutralise »/« Cette PR ne s'hydrate jamais » ci-dessous).
// Un test ajouté qui laisserait un observateur indéfiniment réactif casserait cette garantie
// SANS qu'aucune assertion ne le signale à l'endroit fautif — le symptôme apparaîtrait dans
// un test ultérieur, sans rapport apparent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { commentBodyText, SelectorLog, type PlatformAdapter, NEUTRAL_EDITOR_CHROME } from '@cct/adapter-shared';
import { defaultConfig, splitBody, type PrRef, type ThreadInfo } from '@cct/core';
import { ClientConfigResolver, type ResolvedClientConfig } from '../src/config-resolver.js';
import { decorateWithHtmlShape, HTML_SHAPE } from './helpers/decorate.js';
import { applyLabelFilter, clearLabelFilter } from '../src/ui/thread-filter.js';
import {
  bootstrap,
  observePrChromeNavigation,
  prKeyFor,
  RENDER_RETRY_THROTTLE_MS,
  RENDER_RETRY_WINDOW_MS,
} from '../src/content-internal.js';
import { testFactories } from './helpers/factories.js';
// CONFIG_POLL_INTERVAL_MS n'est pas importée : les tests du sondage périodique lui
// substituent une valeur courte (voir `configPollIntervalMs`, dernier paramètre de
// `observePrChromeNavigation`) pour ne pas attendre les cinq minutes de production.

function pr(number: number): PrRef {
  return { platform: 'github', createdAt: '2026-01-01T00:00:00Z', host: 'github.com', scope: ['acme', 'demo'], number };
}

/** Fils que la page « porte » pour un faux : `count` fils bloquants non résolus (`issue:`), et
 * toujours un fil NON bloquant (`note:`, résolu) en plus. Ce dernier tient lieu de ce que la page
 * montre même sans fil bloquant : une page qui porte des fils a quelque chose à montrer (le
 * filtre du §5.5), si bien que le rendu ne retente pas indéfiniment l'hydratation. `null` : la
 * page ne porte encore aucun fil.
 *
 * Depuis le retrait du vérificateur (§2), le bandeau ne lit plus que les fils de la page (§5.5) :
 * c'est par eux, et non plus par un résumé publié, qu'un test fait varier ce qu'il affiche. */
function blocking(count: number): number {
  return count;
}

function synthesizedThreads(prRef: PrRef, count: number | null): ThreadInfo[] {
  if (count === null) return [];
  const thread = (id: string, body: string, resolution: ThreadInfo['resolution']): ThreadInfo => ({
    id,
    pr: prRef,
    root: {
      id: `${id}-root`,
      author: { id: 'login:x', login: 'x', isServiceAccount: false },
      body,
      createdAt: '2026-01-01T00:00:00Z',
      permalink: `#${id}`,
      isSystemGenerated: false,
      canCarryBlockingState: true,
    },
    replies: [],
    resolution,
    canCarryBlockingState: true,
  });
  const out = [thread('n0', 'note: rien de bloquant ici', 'resolved')];
  for (let i = 1; i <= count; i++) out.push(thread(`b${i}`, `issue: point ${i}`, 'unresolved'));
  return out;
}

/** Adaptateur factice, COMPLET au sens du contrat (§9.2.3) : `currentPr()` reflète la PR
 * « affichée » par la page à un instant donné, au gré des mutations simulées ci-dessous ; les
 * surfaces d'affichage qu'un test ne fournit pas répondent « rien » — liste vide, `null` —,
 * ce qui est une réponse du contrat, et plus un repli du code partagé. */
function makeAdapter(
  getCurrent: () => PrRef | null,
  getBlocking: () => number | null = () => null,
  opts: {
    getThreads?: () => Promise<ThreadInfo[]>;
    getRenderedThreadElements?: () => { id: string; element: Element }[];
    getRenderedComments?: () => { element: Element; bodyText: string }[];
    getRenderedCommentElements?: () => Element[];
    getBannerMount?: () => Element | null;
    getThreadFilterMount?: () => Element | null;
  } = {}
): PlatformAdapter {
  const renderedComments = opts.getRenderedComments ?? (() => []);
  // Les fils synthétisés (`synthesizedThreads`) S'AJOUTENT à ceux que le test fournit, et la page
  // les « rend » aussi : c'est l'identité des fils rendus que la signature de reprise compare
  // (`contentSignatureOf`), si bien qu'un décompte qui change est vu comme la page qui change.
  // Leurs éléments restent hors du document, et le filtre ne s'y accroche pas.
  const synthesized = (): ThreadInfo[] => {
    const current = getCurrent();
    return current ? synthesizedThreads(current, getBlocking()) : [];
  };
  const synthesizedElements = new Map<string, Element>();
  const synthesizedRendered = (): { id: string; element: Element }[] =>
    synthesized().map((t) => {
      if (!synthesizedElements.has(t.id)) synthesizedElements.set(t.id, document.createElement('div'));
      return { id: t.id, element: synthesizedElements.get(t.id)! };
    });
  return {
    currentPr: getCurrent,
    platformProfile: () => ({ id: 'github', suggestionInfoString: null }),
    getRepoConfig: async () => ({ status: 'absent' }),
    getOrgConfig: async () => ({ status: 'absent' }),
    observeEditors: () => ({ dispose: () => {} }),
    getEditorChrome: () => NEUTRAL_EDITOR_CHROME,
    renderedBodyShape: () => HTML_SHAPE,
    getSubmitControls: () => [],
    submitKeystrokes: () => ({ field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' as const }], control: [] }),
    readValue: () => '',
    writeValue: () => {},
    getThreads: async () => [...(opts.getThreads ? await opts.getThreads() : []), ...synthesized()],
    getCurrentUser: async () => ({ id: 'u', login: 'u', isServiceAccount: false }),
    getRenderedThreadElements: () => [...(opts.getRenderedThreadElements?.() ?? []), ...synthesizedRendered()],
    getRenderedComments: renderedComments,
    // À défaut d'une sonde dédiée, les mêmes corps que la lecture décorante — l'accord que
    // le dernier test de ce fichier vérifie sur les vrais adaptateurs.
    getRenderedCommentElements:
      opts.getRenderedCommentElements ?? (() => renderedComments().map((c) => c.element)),
    getBannerMount: opts.getBannerMount ?? (() => null),
    // Par défaut, la place que le code partagé choisissait lui-même : avant le premier fil.
    getThreadFilterMount:
      opts.getThreadFilterMount ?? (() => (opts.getRenderedThreadElements?.() ?? [])[0]?.element ?? null),
  };
}

/** Horloge injectable — même convention que `ClientConfigResolver` (config-resolver.ts) —
 * pour tester `RENDER_RETRY_WINDOW_MS` sans dépendre d'une attente réelle. */
function makeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushAll(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await flush();
}

/** Toute observation ouverte par un test est révoquée à sa fin. Sans cela, l'observateur
 * survit au test qui l'a créé et continue de réagir aux mutations du SUIVANT, dans le
 * document que happy-dom partage entre eux : il y réinjecte alors son propre bandeau, et
 * les assertions du test en cours portent sur le DOM d'un autre. */
const openObservations: (() => void)[] = [];

function observe(
  adapter: Parameters<typeof observePrChromeNavigation>[0],
  resolver: Parameters<typeof observePrChromeNavigation>[1],
  doc: Parameters<typeof observePrChromeNavigation>[2],
  now?: Parameters<typeof observePrChromeNavigation>[3],
  onPrChange?: Parameters<typeof observePrChromeNavigation>[4],
  configPollIntervalMs?: Parameters<typeof observePrChromeNavigation>[5],
  configPollMinIntervalMs?: Parameters<typeof observePrChromeNavigation>[6]
): () => void {
  const dispose = observePrChromeNavigation(
    adapter,
    resolver,
    doc,
    now,
    onPrChange,
    configPollIntervalMs,
    configPollMinIntervalMs
  );
  openObservations.push(dispose);
  return dispose;
}

// La répartition publiée est le SEUL titre d'activation d'un hôte, depuis que le manifeste
// ne déclare plus aucun `content_scripts` : sans elle, `bootstrap()` sort avant d'armer quoi
// que ce soit. Les tests qui appellent `bootstrap()` ici observaient github.com du temps où
// `selectPlatform()` le court-circuitait.
beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: (_keys: string[], cb: (items: Record<string, unknown>) => void) =>
          cb({ extraHostsByPlatform: { github: ['github.com'], azdo: [] } }),
      },
    },
  };
});

afterEach(() => {
  for (const dispose of openObservations.splice(0)) dispose();
  delete (globalThis as { chrome?: unknown }).chrome;
});

function bannerTitles(doc: Document): string[] {
  return [...doc.querySelectorAll('.cct-banner strong')].map((el) => el.textContent ?? '');
}

/** Puce du filtre par label (§5.5) — en tête des fils rendus, plus dans le bandeau. */
function filterChip(doc: Document, labelId: string | null): HTMLElement | null {
  return doc.querySelector(`.cct-thread-filter .cct-filter-chip[data-label="${labelId ?? ''}"]`);
}

/** Label actuellement filtré d'après l'état LU des puces (`aria-pressed`), null pour « tous ». */
function activeFilter(doc: Document): string | null {
  const pressed = doc.querySelector('.cct-thread-filter .cct-filter-chip[aria-pressed="true"]') as HTMLElement | null;
  return pressed?.dataset['label'] || null;
}

describe('barre — ré-affichage après navigation SPA sans rechargement (§5.5)', () => {
  // Chaque test enregistre un MutationObserver vivant sur `document.documentElement` (pas
  // de dispose, comme le service worker de contenu réel qui vit pour toute la durée de
  // l'onglet) : sans ce nettoyage, le DOM d'un test polluerait les assertions du suivant.
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prKeyFor identifie une PR par host/scope/numéro, null en son absence', () => {
    expect(prKeyFor(null)).toBeNull();
    expect(prKeyFor(pr(1))).toBe('github.com/acme/demo#1');
    expect(prKeyFor(pr(2))).toBe('github.com/acme/demo#2');
  });

  it('rend le bandeau dès le chargement quand une PR est déjà affichée', async () => {
    const doc = document;
    let current: PrRef | null = pr(1);
    const adapter = makeAdapter(() => current, () => blocking(current!.number));
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
  });

  it('navigation vers une PR différente : le bandeau se ré-affiche sans rechargement, sans doublon', async () => {
    const doc = document;
    let current: PrRef | null = pr(1);
    const adapter = makeAdapter(() => current, () => blocking(current!.number));
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(bannerTitles(doc)[0]).toContain('1');

    // Navigation SPA : l'URL/le DOM changent sous Turbo/React, le script de contenu n'est
    // PAS relancé — seule une mutation du document le signale.
    current = pr(2);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    const banners = doc.querySelectorAll('.cct-banner');
    expect(banners).toHaveLength(1); // jamais deux bandeaux empilés
    expect(bannerTitles(doc)[0]).toContain('2'); // reflète la nouvelle PR, pas l'ancienne
  });

  it('première PR atteinte après le chargement (page initiale sans PR) : le bandeau apparaît sans rechargement', async () => {
    const doc = document;
    let current: PrRef | null = null;
    const adapter = makeAdapter(
      () => current,
      () => (current ? blocking(current.number) : null)
    );
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0); // rien à afficher pour l'instant

    current = pr(7);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    expect(bannerTitles(doc)[0]).toContain('7');
  });

  it('navigation vers une page sans PR : le bandeau de l’ancienne PR est retiré, pas laissé périmé', async () => {
    const doc = document;
    let current: PrRef | null = pr(3);
    const adapter = makeAdapter(() => current, () => (current ? blocking(current.number) : null));
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);

    current = null;
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);
  });
});

describe('D1 — bootstrap(document, testFactories()) choisit l’adaptateur par hôte, pas par présence d’une PR (§2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('la barre apparaît après une navigation SPA vers une PR atteinte depuis une page non-PR, sans second appel à bootstrap(document, testFactories())', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('stubbed : pas de réseau en test')));
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pulls'),
      configurable: true,
    });

    openObservations.push(await bootstrap(document, testFactories()));
    await flushAll();
    // Avant ce correctif, aucun adaptateur n'était choisi ici (matches() exigeait une PR) :
    // bootstrap() sortait aussitôt, sans armer observeEditors ni observePrChromeNavigation —
    // l'extension restait définitivement inactive sur cette page, et sur la PR atteinte
    // ensuite en SPA.
    expect(document.querySelectorAll('.cct-banner')).toHaveLength(0); // page non-PR : rien à montrer pour l'instant

    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/42'),
      configurable: true,
    });
    // La mutation qui signale la navigation SPA (Turbo/React, §A.3) : un commentaire de la
    // Conversation, rendu comme GitHub le rend (voir le bloc « commentaire MIS À JOUR » plus
    // bas). Son badge prouve que l'observation armée sur la page non-PR a rendu la PR.
    const comment = document.createElement('div');
    comment.className = 'js-comment';
    comment.innerHTML = '<div data-testid="comment-body"><p>nitpick (test): un sujet</p><p>une discussion</p></div>';
    document.body.appendChild(comment);
    await flushAll();

    expect(comment.querySelector('.cct-badge')).not.toBeNull();

    // bootstrap() a armé un MutationObserver vivant (jamais disposé, comme en production)
    // sur ce `document` PARTAGÉ par tout le fichier : sans neutralisation explicite, il
    // continuerait à réagir aux mutations des tests suivants et à effacer LEURS bandeaux
    // via clearStaleBanner(). Navigue vers une page sans PR pour l'y installer, dormant.
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pulls'),
      configurable: true,
    });
    document.body.innerHTML = '';
    await flushAll();
  });
});

describe('D2 — le rattrapage de l’hydratation est borné dans le TEMPS, pas en nombre de tentatives', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('le contenu peuplé APRÈS la première lecture fait quand même apparaître la barre', async () => {
    const doc = document;
    // Cas signalé : arrivée en direct sur la PR (pas de navigation SPA, la PR est là dès le
    // premier instant), mais le statut publié et les fils ne sont pas encore dans le DOM —
    // GitHub/AzDO les peuplent en différé. Le premier rendu ne trouve donc rien à montrer.
    const current = pr(11);
    let hydrated = false;
    const adapter = makeAdapter(() => current, () => (hydrated ? blocking(current.number) : null));
    const resolver = new ClientConfigResolver(async () => null);
    const clock = makeClock();

    observe(adapter, resolver, doc, clock.now);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0); // trop tôt : rien à montrer

    // La page finit de se peupler : sans relance, cette lecture-là n'a jamais lieu et la
    // barre reste absente jusqu'à un rechargement complet (le symptôme signalé).
    hydrated = true;
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    expect(bannerTitles(doc)[0]).toContain('11');
  });

  it('une PR réellement vide n’est pas retentée indéfiniment : bornée par le TEMPS, pas un nombre de tentatives', async () => {
    const doc = document;
    const current = pr(12);
    let getThreadsCalls = 0;
    const adapter = makeAdapter(() => current, () => null /* ne s'hydrate jamais */, {
      getThreads: async () => {
        getThreadsCalls++;
        return [];
      },
    });
    const resolver = new ClientConfigResolver(async () => null);
    const clock = makeClock();

    observe(adapter, resolver, doc, clock.now);
    await flushAll();
    expect(getThreadsCalls).toBe(1);

    // Bien au-delà de l'ancien plafond de tentatives (MAX_EMPTY_RENDER_ATTEMPTS = 20,
    // supprimé) : toujours DANS la fenêtre (l'horloge injectée n'a pas avancé), donc
    // toujours retenté. C'est exactement l'inverse de la régression que cbd4457 avait
    // introduite — un plafond de 20 tentatives, épuisé en quelques dizaines de
    // millisecondes, bien avant que le contenu réel n'ait eu le temps d'arriver.
    for (let i = 0; i < 25; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll();
    }
    expect(getThreadsCalls).toBe(26); // 1 + 25 : aucune n'a été ignorée dans la fenêtre

    // Hors fenêtre : plus aucune relecture, quel que soit le nombre de mutations.
    clock.advance(RENDER_RETRY_WINDOW_MS + 1000);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(getThreadsCalls).toBe(26); // pas de 27e lecture
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);
  });

  it('une fois la barre affichée, les mutations suivantes sans changement du contenu rendu ne la re-rendent pas', async () => {
    const doc = document;
    const current = pr(13);
    let getThreadsCalls = 0;
    const adapter = makeAdapter(() => current, () => blocking(current.number), {
      getThreads: async () => {
        getThreadsCalls++;
        return [];
      },
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    const callsOnceShown = getThreadsCalls;

    for (let i = 0; i < 10; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll(2);
    }

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1); // toujours un seul
    expect(getThreadsCalls).toBe(callsOnceShown); // plus aucune relecture
  });

  it('la relance après une mutation manquée pendant un rendu en vol est temporisée (§10), pas immédiate', async () => {
    const doc = document;
    let current: PrRef | null = pr(15);
    let getThreadsCalls = 0;
    let releaseFirstRender: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseFirstRender = resolve;
    });
    const adapter = makeAdapter(() => current, () => null, {
      getThreads: async () => {
        getThreadsCalls++;
        if (getThreadsCalls === 1) await gate; // maintient le premier rendu « en vol »
        return [];
      },
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flush(); // laisse le premier run() démarrer et se bloquer sur getThreads()
    expect(getThreadsCalls).toBe(1);

    // Une mutation arrive PENDANT que ce premier rendu est en vol.
    doc.body.appendChild(doc.createElement('span'));
    await flush();
    expect(getThreadsCalls).toBe(1); // pas de second rendu concurrent

    releaseFirstRender!(); // le premier rendu se termine
    await flushAll();
    expect(getThreadsCalls).toBe(1); // toujours pas de rattrapage IMMÉDIAT au même tick

    await new Promise((resolve) => setTimeout(resolve, RENDER_RETRY_THROTTLE_MS + 100));
    expect(getThreadsCalls).toBe(2); // ...mais la relance temporisée finit par arriver

    // Cette PR ne s'hydrate jamais (getPublished renvoie toujours null) : l'observateur
    // reste dans sa fenêtre de rattrapage (horloge réelle, à peine entamée) et resterait
    // réactif — donc capable d'effacer le bandeau des tests suivants sur ce document
    // PARTAGÉ — bien après la fin de CE test. Neutralisé en navigant vers une page sans PR.
    current = null;
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();
  });

  it('onPrChange ne publie jamais, pour une PR, la configuration résolue pour une AUTRE (revue Codex, PR #39)', async () => {
    const doc = document;
    // Deux DÉPÔTS distincts — le cache de `ClientConfigResolver` est scopé par
    // `host/scope`, jamais par numéro de PR (deux PR du MÊME dépôt partagent la même
    // configuration, à raison) : pour que les deux résolutions produisent des configurations
    // reconnaissables l'une de l'autre, la navigation doit changer de dépôt, pas seulement de
    // numéro.
    const prA: PrRef = { platform: 'github', createdAt: '2026-01-01T00:00:00Z', host: 'github.com', scope: ['acme', 'demo'], number: 1 };
    const prB: PrRef = { platform: 'github', createdAt: '2026-01-01T00:00:00Z', host: 'github.com', scope: ['acme', 'autre-depot'], number: 2 };
    let current: PrRef | null = prA;
    let getThreadsCalls = 0;
    let releaseSecondRender: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseSecondRender = resolve;
    });
    const adapter: PlatformAdapter = {
      currentPr: () => current,
      getBannerMount: () => null,
      getRenderedThreadElements: () => [],
      getRenderedComments: () => [],
      getRenderedCommentElements: () => [],
      platformProfile: () => ({ id: 'github', suggestionInfoString: null }),
      getRepoConfig: async (requestedPr) => ({
        status: 'found',
        text: JSON.stringify({ mode: requestedPr.scope.join('/') === 'acme/demo' ? 'assist' : 'enforce' }),
      }),
      getOrgConfig: async () => ({ status: 'absent' }),
      observeEditors: () => ({ dispose: () => {} }),
      getEditorChrome: () => NEUTRAL_EDITOR_CHROME,
      renderedBodyShape: () => HTML_SHAPE,
      getSubmitControls: () => [],
      submitKeystrokes: () => ({ field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' as const }], control: [] }),
      readValue: () => '',
      writeValue: () => {},
      // Rien à montrer (aucun fil) : `observePrChromeNavigation` reste
      // dans sa fenêtre de rattrapage et retente à CHAQUE mutation tant qu'elle n'est pas
      // écoulée — c'est ce second essai, sur la MÊME PR, que le gate bloque.
      getThreads: async () => {
        getThreadsCalls++;
        if (getThreadsCalls === 2) await gate;
        return [];
      },
      getCurrentUser: async () => ({ id: 'u', login: 'u', isServiceAccount: false }),
    };
    const resolver = new ClientConfigResolver(async () => null);
    const calls: { pr: PrRef | null; changed: boolean; resolved: ResolvedClientConfig | null }[] = [];

    observe(adapter, resolver, doc, undefined, (p, changed, resolved) => calls.push({ pr: p, changed, resolved }));
    await flushAll(); // premier rendu de prA, complet (getThreads #1, non bloqué)
    expect(getThreadsCalls).toBe(1);

    // Toujours SUR prA : ce second rendu (rattrapage de l'hydratation, `navigated: false`
    // pour LUI) se bloque sur son propre `getThreads()`.
    doc.body.appendChild(doc.createElement('span'));
    await flush();
    expect(getThreadsCalls).toBe(2);

    // La page navigue vers un AUTRE DÉPÔT PENDANT que ce second rendu de prA est encore en
    // vol — cette mutation est coalescée (`missedMutation`), `lastPrKey` n'est PAS mise à
    // jour avant que le rendu de prA ne se termine (revue Codex, PR #39).
    current = prB;
    doc.body.appendChild(doc.createElement('span'));
    await flush();
    expect(getThreadsCalls).toBe(2); // toujours pas de troisième rendu concurrent

    releaseSecondRender!(); // le second rendu de prA se termine enfin
    await flushAll();
    await new Promise((resolve) => setTimeout(resolve, RENDER_RETRY_THROTTLE_MS + 100));
    await flushAll();

    // Sans le correctif, un appel `{ pr: prB, changed: false, resolved: <config assist de
    // prA> }` se glisserait ici — la configuration de l'ANCIEN dépôt publiée comme si elle
    // s'appliquait au NOUVEAU. Un éditeur déjà découvert sur prB reconstruirait alors ses
    // règles de validation sur le mauvais dépôt.
    for (const call of calls) {
      if (call.changed || call.resolved === null) continue;
      const expectedMode = call.pr?.scope.join('/') === 'acme/demo' ? 'assist' : 'enforce';
      expect(call.resolved.config.mode).toBe(expectedMode);
    }
  });
});

describe('D3 — des fils arrivés après coup sont adoptés, même une fois la barre déjà affichée (§5.5, CA-03)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('décompte et filtre actif suivent les fils de la page quand ils apparaissent puis disparaissent', async () => {
    const doc = document;
    const current = pr(16);
    const thread: ThreadInfo = {
      id: 't1',
      pr: current,
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'issue: quelque chose ne va pas',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    // Un second fil, non bloquant, pour que 'praise' soit proposé par le filtre : celui-ci
    // ne propose que les labels PRÉSENTS sur la page (§5.5).
    const praised: ThreadInfo = {
      ...thread,
      id: 't2',
      root: { ...thread.root, id: 't2-root', body: 'praise: joliment fait', permalink: '#t2' },
    };
    // Les fils rendus vivent dans la page : le filtre s'insère juste avant le premier.
    const renderedThreadEl = doc.createElement('div');
    const praisedThreadEl = doc.createElement('div');
    doc.body.append(renderedThreadEl, praisedThreadEl);
    // D'autres fils bloquants, qui n'existent pas encore au premier rendu.
    let more: number | null = null;
    const adapter = makeAdapter(() => current, () => more, {
      getThreads: async () => [thread, praised],
      getRenderedThreadElements: () => [
        { id: 't1', element: renderedThreadEl },
        { id: 't2', element: praisedThreadEl },
      ],
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();

    // Un seul fil bloquant sur la page : il suffit à afficher la barre.
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    expect(bannerTitles(doc)[0]).toContain('1');

    // Filtre actif sur un label différent de celui du fil bloquant : ce fil est masqué.
    const chip = filterChip(doc, 'praise');
    expect(chip).not.toBeNull();
    chip!.dispatchEvent(new Event('click'));
    expect(renderedThreadEl.style.display).toBe('none');
    expect(praisedThreadEl.style.display).toBe('');

    // Deux autres fils bloquants arrivent APRÈS ce premier rendu : sans D3, `showedSomething`
    // resterait bloqué sur le premier constat et cette lecture n'aurait jamais lieu.
    more = blocking(2);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(bannerTitles(doc)[0]).toContain('3'); // le décompte suit la page
    // La barre de puces est reconstruite, mais la SÉLECTION elle-même (§5.5, revue Codex
    // round 4) survit à un rendu répété sur la MÊME PR — jamais réinitialisée à « tous »
    // tant que le contexte de PR ne change pas.
    expect(activeFilter(doc)).toBe('praise');
    expect(renderedThreadEl.style.display).toBe('none');

    // Ces deux fils disparaissent (résolus, puis repliés par la plateforme) : le décompte
    // redescend, et la sélection tient toujours.
    more = blocking(0);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(bannerTitles(doc)[0]).toContain('1');
    expect(activeFilter(doc)).toBe('praise');
  });
});

describe('Codex #2 — retente tant que tout le contexte de la barre n’a pas été observé', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('des fils chargés APRÈS le premier rendu reçoivent quand même leur ancre au bandeau', async () => {
    const doc = document;
    const current = pr(21);
    const thread: ThreadInfo = {
      id: 't1',
      pr: current,
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'issue: x',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    let loaded = false; // le fil n'existe pas encore dans le DOM au premier rendu
    // `blocking(0)` : la page porte déjà un fil, non bloquant — ce premier rendu « montre
    // quelque chose », et c'est bien la reprise sur un contenu qui change qui est testée.
    const adapter = makeAdapter(() => current, () => blocking(0), {
      getThreads: async () => (loaded ? [thread] : []),
      getRenderedThreadElements: () => (loaded ? [{ id: 't1', element: doc.createElement('div') }] : []),
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner li[data-thread-id]')).toHaveLength(0); // rien encore

    loaded = true;
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner li[data-thread-id]')).toHaveLength(1); // ancre présente
  });
});

describe('Codex #4 — le texte d’un badge injecté n’est jamais mêlé au corps relu (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('commentBodyText exclut un badge posé en enfant direct, laisse le reste intact', () => {
    const el = document.createElement('div');
    el.textContent = 'issue: quelque chose ne va pas';
    expect(commentBodyText(el)).toBe('issue: quelque chose ne va pas');

    const badge = document.createElement('span');
    badge.className = 'cct-badge';
    badge.textContent = '🐛 issue';
    el.insertAdjacentElement('afterbegin', badge);

    expect(el.textContent).toContain('🐛 issue'); // le DOM, lui, porte bien le badge
    expect(commentBodyText(el)).toBe('issue: quelque chose ne va pas'); // mais pas la lecture
  });

  it('commentBodyText exclut TOUS les badges — label ET chaque décoration, pas seulement le premier', () => {
    // decorateComment() pose désormais un badge de label suivi d'un badge par décoration
    // (§3.3, §5.5) : plusieurs enfants directs .cct-badge, pas un seul. Un querySelector()
    // simple n'en retirerait que le premier, laissant « blocking security » mêlé au corps
    // relu au tour suivant.
    const el = document.createElement('div');
    el.textContent = 'issue (blocking, security): fuite mémoire';
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    decorateWithHtmlShape(el, 'issue (blocking, security): fuite mémoire', defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge').length).toBe(3); // label + 2 décorations
    expect(commentBodyText(el)).toBe('issue (blocking, security): fuite mémoire');
  });

  it('decorateComment() : un badge par décoration, stylé selon `forces`/`known` (§3.3, §5.5)', () => {
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const el = document.createElement('div');
    // blocking : porteuse connue, bloquante. security : libre (allowFree, absente de
    // decorations.known par défaut). if-minor : porteuse connue, même `forces` que non-blocking.
    el.textContent = 'issue (blocking, security, if-minor): x';
    decorateWithHtmlShape(el, 'issue (blocking, security, if-minor): x', defaultConfig(), profile, 'en');

    const decoBadges = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoBadges.map((b) => b.textContent)).toEqual(['blocking', 'security', 'if-minor']);
    expect(decoBadges[0]!.className).toContain('cct-badge-deco-blocking'); // porteuse bloquante
    expect(decoBadges[1]!.className).not.toMatch(/cct-badge-deco-(blocking|nonblocking)/); // libre, descriptive
    expect(decoBadges[1]!.className).toContain('cct-badge-deco-custom'); // non déclarée (allowFree)
    expect(decoBadges[2]!.className).toContain('cct-badge-deco-nonblocking'); // if-minor → même forces que non-blocking
  });

  it('decorateComment() : une décoration inconnue REJETÉE (allowFree=false) ne reçoit aucun badge (revue Reefact, PR #37)', () => {
    // Sans ce filtre côté core, (foo) — pourtant invalide (E-UNKNOWN-DECORATION) — recevrait
    // le même badge en pointillé qu'une décoration libre RÉELLEMENT autorisée : le lecteur ne
    // pourrait pas distinguer un commentaire non conforme d'un commentaire valide.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const cfg = defaultConfig();
    cfg.decorations.allowFree = false;
    const el = document.createElement('div');
    el.textContent = 'issue (foo, blocking): x';
    decorateWithHtmlShape(el, 'issue (foo, blocking): x', cfg, profile, 'en');

    const decoBadges = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoBadges.map((b) => b.textContent)).toEqual(['blocking']); // (foo) absent
    expect(el.querySelector(':scope > .cct-badge-label')).not.toBeNull(); // le label, lui, reste rendu
  });

  it('decorateComment() : un rendu répété à configuration INCHANGÉE ne touche pas le DOM (§5.5, anti-churn)', () => {
    // content-internal.ts appelle decorateComment() sur CHAQUE commentaire à CHAQUE passage
    // de rendu — un simple mouvement de souris ailleurs sur une PR à 200 commentaires ne doit
    // jamais retirer puis reposer 200 badges pour rien.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const body = 'issue (blocking, security): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');
    const labelBefore = el.querySelector(':scope > .cct-badge-label');
    const decoBefore = [...el.querySelectorAll(':scope > .cct-badge-deco')];

    // Un objet de configuration FRAIS mais structurellement identique — la comparaison doit
    // porter sur ce que analyze() en tire, pas sur l'identité de l'objet JS.
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector(':scope > .cct-badge-label')).toBe(labelBefore); // même nœud
    expect([...el.querySelectorAll(':scope > .cct-badge-deco')]).toEqual(decoBefore); // mêmes nœuds
  });

  it('decorateComment() : ne construit aucun badge sur le chemin inchangé (revue Codex, PR #38)', () => {
    // decorateComment() tourne pour CHAQUE commentaire à CHAQUE passage de rendu, y compris
    // ceux déjà à jour — leur bâtir des éléments DOM détachés avant de les jeter aussitôt
    // serait un coût réel sur une PR à beaucoup de commentaires, même sans aucune écriture.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const body = 'issue (blocking, security): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');

    const createElementSpy = vi.spyOn(document, 'createElement');
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');
    // Seul `el` lui-même a été créé avant l'espion ; le second appel, inchangé, ne doit créer
    // ni le badge de label ni ses deux badges de décoration.
    expect(createElementSpy).not.toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it('decorateComment() : rafraîchit label ET décoration quand la configuration change en direct (§8.1.1, §5.5)', () => {
    // Cas cité par la revue Codex sur la PR #37 : (security) passe de libre à connue et
    // bloquante après expiration du cache de configuration (§8.1.2) — le badge doit suivre,
    // pas rester figé sur l'état du premier rendu. Le label change de couleur en même temps,
    // pour couvrir aussi le badge de label, pas seulement les décorations.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const body = 'issue (blocking, security): x';
    const el = document.createElement('div');
    el.textContent = body;

    const before = defaultConfig();
    decorateWithHtmlShape(el, body, before, profile, 'en');
    const labelBefore = el.querySelector(':scope > .cct-badge-label')!;
    const securityBefore = [...el.querySelectorAll(':scope > .cct-badge-deco')][1]!;
    expect(securityBefore.className).toContain('cct-badge-deco-custom'); // encore libre

    const after = defaultConfig();
    after.decorations.known.push({ id: 'security', forces: 'blocking' });
    after.labels.find((l) => l.id === 'issue')!.color = '#123456';
    decorateWithHtmlShape(el, body, after, profile, 'en');

    const labelAfter = el.querySelector(':scope > .cct-badge-label')!;
    const decoAfter = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoAfter.map((b) => b.textContent)).toEqual(['blocking', 'security']); // toujours les deux
    expect(decoAfter[1]!.className).toContain('cct-badge-deco-blocking'); // security est maintenant porteuse
    expect(decoAfter[1]!.className).not.toContain('cct-badge-deco-custom');
    expect((labelAfter as HTMLElement).style.getPropertyValue('--cct-label-color')).toBe('#123456');
    expect(labelAfter).not.toBe(labelBefore); // churn légitime : le contenu a réellement changé
  });

  it('decorateComment() : plafonne les badges de décoration, repli sur un badge « +N » (revue Codex, PR #38)', () => {
    // decorations.allowFree n'a pas de limite de nombre (§3.3) : un préfixe adversarial avec
    // des dizaines de décorations distinctes ne doit pas poser autant de nœuds DOM.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const ids = Array.from({ length: 15 }, (_, i) => `d${i + 1}`);
    const body = `issue (${ids.join(', ')}): x`;
    const el = document.createElement('div');
    el.textContent = body;
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');

    const decoBadges = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoBadges).toHaveLength(13); // 12 décorations affichées + 1 badge de dépassement
    expect(decoBadges.slice(0, 12).map((b) => b.textContent)).toEqual(ids.slice(0, 12));
    expect(decoBadges[12]!.textContent).toBe('+3'); // les 3 décorations restantes, repliées
  });

  it('decorateComment() : la signature stockée reste bornée même avec des milliers de décorations (revue Codex, PR #38)', () => {
    // Le plafond d'affichage ne sert à rien si la signature persistée dans data-cct-sig
    // sérialise quand même le tableau COMPLET : un commentaire adversarial ferait alors porter
    // un attribut DOM de plusieurs dizaines de Ko à chaque comparaison, malgré 12 badges visibles.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const ids = Array.from({ length: 2000 }, (_, i) => `d${i + 1}`);
    const body = `issue (${ids.join(', ')}): x`;
    const el = document.createElement('div');
    el.textContent = body;
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');

    const label = el.querySelector(':scope > .cct-badge-label') as HTMLElement;
    const sig = label.dataset['cctSig']!;
    expect(sig.length).toBeLessThan(2000); // très en-deçà de la taille du corps (≈14 Ko)
    expect(sig).not.toContain('"d1999"'); // une décoration repliée n'apparaît pas dans la signature
  });

  it('decorateComment() : une décoration PORTEUSE au-delà du plafond reste affichée, jamais repliée (revue Codex, PR #38)', () => {
    // Cas cité par la revue : issue (d1, ..., d12, blocking): x — une troncature naïve
    // couperait juste avant `blocking`, effaçant le seul signal que les badges existent pour
    // porter. Seules les décorations DESCRIPTIVES sont bornées : leur nombre est contrôlé par
    // l'auteur du commentaire, jamais celui des porteuses, borné par la configuration.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const ids = Array.from({ length: 12 }, (_, i) => `d${i + 1}`);
    const body = `issue (${ids.join(', ')}, blocking): x`;
    const el = document.createElement('div');
    el.textContent = body;
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');

    const decoBadges = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoBadges).toHaveLength(13); // les 12 descriptives + blocking — aucun dépassement
    expect(decoBadges[12]!.textContent).toBe('blocking');
    expect(decoBadges[12]!.className).toContain('cct-badge-deco-blocking');

    // Avec des descriptives EN EXCÈS en plus de la porteuse, seules les descriptives débordent.
    const manyIds = Array.from({ length: 15 }, (_, i) => `d${i + 1}`);
    const body2 = `issue (${manyIds.join(', ')}, blocking): x`;
    const el2 = document.createElement('div');
    el2.textContent = body2;
    decorateWithHtmlShape(el2, body2, defaultConfig(), profile, 'en');

    const decoBadges2 = [...el2.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoBadges2).toHaveLength(14); // 12 descriptives affichées + blocking + « +3 »
    expect(decoBadges2[12]!.textContent).toBe('blocking');
    expect(decoBadges2[12]!.className).toContain('cct-badge-deco-blocking');
    expect(decoBadges2[13]!.textContent).toBe('+3');
  });

  it('decorateComment() : l’infobulle du badge de dépassement suit la langue résolue (revue Codex, PR #38)', () => {
    // Chaîne d'interface : chacune dans SA langue (CLAUDE.md) — un chiffre en dur en français
    // ne doit jamais s'afficher à un lecteur en anglais.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const ids = Array.from({ length: 15 }, (_, i) => `d${i + 1}`);
    const body = `issue (${ids.join(', ')}): x`;

    const elFr = document.createElement('div');
    elFr.textContent = body;
    decorateWithHtmlShape(elFr, body, defaultConfig(), profile, 'fr');
    const overflowFr = [...elFr.querySelectorAll(':scope > .cct-badge-deco')][12] as HTMLElement;
    expect(overflowFr.title).toBe('3 décoration(s) supplémentaire(s), non affichée(s)');

    const elEn = document.createElement('div');
    elEn.textContent = body;
    decorateWithHtmlShape(elEn, body, defaultConfig(), profile, 'en');
    const overflowEn = [...elEn.querySelectorAll(':scope > .cct-badge-deco')][12] as HTMLElement;
    expect(overflowEn.title).toBe('3 more decoration(s), not shown');

    // Un changement de langue SEUL, même config et même corps, doit rafraîchir l'infobulle —
    // la langue résolue entre dans la signature au même titre que le style ou la couleur.
    decorateWithHtmlShape(elFr, body, defaultConfig(), profile, 'en');
    const overflowAfter = [...elFr.querySelectorAll(':scope > .cct-badge-deco')][12] as HTMLElement;
    expect(overflowAfter.title).toBe('3 more decoration(s), not shown');
  });

  it('decorateComment() : restaure un badge de décoration effacé par une réhydratation de plateforme (revue Codex, PR #38)', () => {
    // Le court-circuit anti-churn ne doit pas se fier au seul badge de label : si la
    // plateforme efface un badge de DÉCORATION sans toucher au label, sa signature reste
    // intacte, et un contrôle qui ne regarderait qu'elle renoncerait à réparer le manquant.
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const body = 'issue (blocking, security): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');
    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(3); // label + 2 décorations

    // Simule une réhydratation qui emporte le badge « security », en laissant le label intact.
    [...el.querySelectorAll(':scope > .cct-badge-deco')][1]!.remove();
    expect(el.querySelectorAll(':scope > .cct-badge-deco')).toHaveLength(1);

    // Même corps, même configuration — seul le DOM a divergé de ce que ce rendu produirait.
    decorateWithHtmlShape(el, body, defaultConfig(), profile, 'en');

    const decoAfter = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoAfter.map((b) => b.textContent)).toEqual(['blocking', 'security']); // réparé
  });

  it('un .cct-badge imbriqué (pas enfant direct) n’est pas exclu à tort', () => {
    // decorateComment() ne pose jamais un badge ailleurs qu'en tête du corps ou en tête du
    // paragraphe qui porte le sujet — un `.cct-badge` plus profond (citation, bloc de code d'un
    // autre commentaire cité) est un texte normal, pas notre propre badge.
    const el = document.createElement('div');
    el.innerHTML = '<blockquote><span class="cct-badge">🐛 issue</span></blockquote>issue: x';
    // Le texte cité reste dans le corps relu, sous sa forme SOURCE (`> `) depuis que le §3.4.1 doit
    // pouvoir écarter une citation placée avant le préfixe.
    expect(commentBodyText(el)).toBe('\n> 🐛 issue\nissue: x');
  });

  it('un .cct-badge dans le <p> d’une CITATION n’est pas exclu non plus — l’exclusion s’arrête au premier niveau', () => {
    // Frontière exacte du sélecteur élargi (OWN_BADGES) le jour où les badges ont pu descendre
    // dans le paragraphe du sujet : « enfant direct du corps, ou enfant direct de son `<p>` », et
    // rien de plus profond. Un `<blockquote><p>` est un niveau au-delà — le confondre amputerait
    // le corps relu du texte cité, et analyze() jugerait un commentaire tronqué.
    const el = document.createElement('div');
    el.innerHTML = '<blockquote><p><span class="cct-badge">🐛 issue</span></p></blockquote><p>issue: x</p>';
    // Le texte cité reste dans le corps relu, sous sa forme SOURCE (`> `) depuis que le §3.4.1 doit
    // pouvoir écarter une citation placée avant le préfixe.
    expect(commentBodyText(el)).toBe('\n> 🐛 issue\nissue: x');
  });

  it('un code cité qui CONTIENT une clôture ``` ne ferme pas le bloc reconstruit (revue Reefact, PR #141)', () => {
    // Rendu de ````md … ```` : le code montre lui-même une clôture et une ligne préfixée. Un
    // délimiteur synthétique de trois accents graves se fermait sur la ligne ``` du code, et
    // `issue: example` passait pour la ligne de préfixe du commentaire.
    const el = document.createElement('div');
    el.innerHTML = '<pre><code>```\nissue: example\n```</code></pre><p>issue: actual</p>';
    expect(splitBody(commentBodyText(el)).prefixLine).toBe('issue: actual');
  });

  it('GithubClientAdapter.getThreads() relit le vrai corps même après un badge posé par decorateComment', async () => {
    document.body.innerHTML =
      '<div data-testid="review-thread" id="t1"><div data-testid="comment-body">issue: quelque chose ne va pas</div></div>';
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/9'),
      configurable: true,
    });
    const adapter = new GithubClientAdapter({ documentRef: document });
    const bodyEl = document.querySelector('[data-testid="comment-body"]')!;
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };

    // Simule ce que le premier rendu a fait : decorateComment() a posé un badge.
    decorateWithHtmlShape(bodyEl, 'issue: quelque chose ne va pas', defaultConfig(), profile, 'en');
    expect(bodyEl.querySelector('.cct-badge')).not.toBeNull();

    const threads = await adapter.getThreads();
    // Sans le correctif, le corps relu commencerait par le texte du badge (« 🐛 issue »),
    // cassant la reconnaissance du préfixe par analyze() au tour suivant.
    expect(threads[0]!.root.body).toBe('issue: quelque chose ne va pas');

    // Contrairement aux adaptateurs factices (makeAdapter), currentPr() d'un VRAI
    // GithubClientAdapter relit `document.location` à chaque appel : le laisser pointer sur
    // cette PR ferait revivre, à la prochaine mutation, l'observateur dormant armé par
    // bootstrap() dans le test D1 ci-dessus (même document PARTAGÉ) — sa clé de PR
    // changerait, `navigated` redeviendrait vrai, et son clearStaleBanner() effacerait le
    // bandeau d'un test SUIVANT. Neutralise en repointant vers une page sans PR.
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pulls'),
      configurable: true,
    });
  });
});

describe('Codex #6 — un rendu répété ne touche pas au display d’un fil masqué par la plateforme (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clearStaleBanner ne restaure jamais un display posé par la plateforme, seulement celui posé par notre filtre', async () => {
    const doc = document;
    const current = pr(23);
    const platformHidden = doc.createElement('div');
    platformHidden.style.display = 'none'; // ex. fil réduit/virtualisé par GitHub lui-même
    const adapter = makeAdapter(() => current, () => blocking(1), {
      getRenderedThreadElements: () => [{ id: 't1', element: platformHidden }],
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();

    // clearStaleBanner tourne dès le premier rendu (efface un bandeau d'un contexte
    // précédent) : sans le correctif, il aurait déjà remis `display: ''` ici.
    expect(platformHidden.style.display).toBe('none');
  });
});

describe('Codex round 2 #2 — le display d’origine est restauré, jamais une chaîne vide (§5.5)', () => {
  it('applyLabelFilter restaure la valeur D’ORIGINE, pas juste `\'\'`', () => {
    const el = document.createElement('div');
    el.style.display = 'flex'; // posé par la plateforme, pour SA mise en page
    const labelOfThread = new Map([['t1', 'issue']]);

    applyLabelFilter([{ id: 't1', element: el }], labelOfThread, 'praise');
    expect(el.style.display).toBe('none'); // masqué par le filtre

    applyLabelFilter([{ id: 't1', element: el }], labelOfThread, null); // « tous »
    expect(el.style.display).toBe('flex'); // restauré tel quel, jamais une chaîne vide
  });

  it('clearLabelFilter restaure aussi la valeur d’origine, y compris quand elle était déjà vide', () => {
    const el = document.createElement('div');
    el.style.display = 'grid';
    const labelOfThread = new Map([['t1', 'issue']]);
    applyLabelFilter([{ id: 't1', element: el }], labelOfThread, 'praise');
    expect(el.style.display).toBe('none');
    clearLabelFilter([{ id: 't1', element: el }]);
    expect(el.style.display).toBe('grid');

    const untouched = document.createElement('div'); // jamais filtré : rien à restaurer
    clearLabelFilter([{ id: 't2', element: untouched }]);
    expect(untouched.style.display).toBe('');
  });
});

describe('Codex round 2 #7 — les badges posés pendant que le mode était actif sont retirés au passage à off (§7)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('un badge posé avant le passage à off ne reste pas affiché par une extension censée être inactive', async () => {
    const doc = document;
    const current = pr(26);
    let configText = '{}'; // défauts : mode assist
    const body = 'issue: quelque chose ne va pas';
    const commentEl = doc.createElement('div');
    // Le texte RÉEL, pas un élément vide : c'est lui que `decorateComment` masque en partie
    // (le préfixe structuré, §5.5) et que le passage à off doit rendre entièrement.
    commentEl.textContent = body;
    doc.body.appendChild(commentEl); // le nettoyage interroge le document entier, pas un élément détaché
    let blockingOnPage: number | null = blocking(1);
    const adapter = makeAdapter(() => current, () => blockingOnPage, {
      getRenderedComments: () => [{ element: commentEl, bodyText: body }],
    });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(commentEl.querySelector('.cct-badge')).not.toBeNull();
    expect(commentEl.querySelector('.cct-hidden-prefix')).not.toBeNull(); // préfixe masqué, sujet mis en avant
    expect(commentEl.querySelector('.cct-subject')).not.toBeNull();

    configText = JSON.stringify({ mode: 'off' });
    blockingOnPage = blocking(0);
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(commentEl.querySelector('.cct-badge')).toBeNull();
    // …et RIEN d'autre non plus : ne retirer que les badges laissait le préfixe structuré
    // masqué — une partie du texte de l'auteur rendue invisible par une extension qui se
    // déclare inactive, jusqu'au rechargement de la page.
    expect(commentEl.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(commentEl.querySelector('.cct-subject')).toBeNull();
    expect(commentEl.textContent).toBe(body);
    expect(commentEl.childNodes).toHaveLength(1); // un seul nœud de texte recollé, pas des morceaux
  });
});

describe('Codex round 4 — le filtre par label survit à un rendu répété sur la MÊME PR (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reste actif quand les fils de la page changent, repart à zéro sur une nouvelle PR', async () => {
    const doc = document;
    let current = pr(27);
    const thread: ThreadInfo = {
      id: 't1',
      pr: current,
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'issue: quelque chose ne va pas',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    // Un second fil, non bloquant : le filtre ne propose que les labels PRÉSENTS (§5.5).
    const praised: ThreadInfo = {
      ...thread,
      id: 't2',
      root: { ...thread.root, id: 't2-root', body: 'praise: joliment fait', permalink: '#t2' },
    };
    const renderedThreadEl = doc.createElement('div');
    const praisedThreadEl = doc.createElement('div');
    doc.body.append(renderedThreadEl, praisedThreadEl);
    let blockingOnPage: number | null = blocking(1);
    const adapter = makeAdapter(() => current, () => blockingOnPage, {
      getThreads: async () => [thread, praised],
      getRenderedThreadElements: () => [
        { id: 't1', element: renderedThreadEl },
        { id: 't2', element: praisedThreadEl },
      ],
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();

    filterChip(doc, 'praise')!.dispatchEvent(new Event('click'));
    expect(renderedThreadEl.style.display).toBe('none');

    // Rendu répété sur la MÊME PR (fils de la page changés, §5.5, D3) : avant ce correctif, la
    // barre reconstruite repartait toujours sur « tous », perdant la sélection.
    blockingOnPage = blocking(0);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();
    expect(activeFilter(doc)).toBe('praise');
    expect(renderedThreadEl.style.display).toBe('none');

    // Navigation vers une AUTRE PR : le filtre, lui, repart bien à zéro.
    current = pr(28);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();
    expect(filterChip(doc, null)).not.toBeNull();
    expect(activeFilter(doc)).toBeNull();
  });
});

describe('Codex round 5 — le filtre repart à zéro quand son label n’est plus activé (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('une reconfiguration qui désactive le label choisi ne continue pas à filtrer sur un label fantôme', async () => {
    const doc = document;
    const current = pr(30);
    const thread: ThreadInfo = {
      id: 't1',
      pr: current,
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'praise: bien joué',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    const renderedThreadEl = doc.createElement('div');
    doc.body.appendChild(renderedThreadEl); // le filtre s'insère juste avant le premier fil rendu
    let configText = '{}'; // défauts : 'praise' activé
    let blockingOnPage: number | null = blocking(1);
    const adapter = makeAdapter(() => current, () => blockingOnPage, {
      getThreads: async () => [thread],
      getRenderedThreadElements: () => [{ id: 't1', element: renderedThreadEl }],
    });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);

    observe(adapter, resolver, doc);
    await flushAll();

    filterChip(doc, 'praise')!.dispatchEvent(new Event('click'));
    expect(renderedThreadEl.style.display).toBe(''); // le fil EST 'praise' : filtre actif, mais visible

    // La configuration du dépôt désactive 'praise' ; un fil bloquant disparaît aussi de la
    // page (résolu ailleurs) pour déclencher la relecture.
    configText = JSON.stringify({ labels: [{ id: 'praise', enabled: false }] });
    blockingOnPage = blocking(0);
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    // Sans le correctif : la barre retombe visuellement sur « tous » (aucune puce 'praise'
    // ne subsiste) mais le filtre appliqué reste 'praise' — un label que plus aucun fil ne
    // porte (analyze() ne résout plus un label désactivé) — masquant tout.
    expect(filterChip(doc, 'praise')).toBeNull();
    expect(activeFilter(doc)).toBeNull();
    expect(renderedThreadEl.style.display).toBe('');
  });
});

describe('§5.5 — le bandeau se monte en tête de PR, le filtre en tête des fils', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('s’insère après l’en-tête que l’adaptateur désigne, jamais au-dessus du chrome de la page', async () => {
    // Injecté en tête de <body>, il flotte au-dessus du header de la plateforme et se lit
    // comme une greffe. « En tête de PR » (§5.5) veut dire dans le flux de la page.
    const doc = document;
    const header = doc.createElement('div');
    header.className = 'gh-header';
    const after = doc.createElement('div');
    doc.body.append(header, after);

    const adapter = makeAdapter(() => pr(40), () => blocking(2), {
      getBannerMount: () => header,
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    const banner = doc.querySelector('.cct-banner');
    expect(banner).not.toBeNull();
    expect(banner!.previousElementSibling).toBe(header);
    expect(doc.body.firstElementChild).not.toBe(banner);
  });

  it('se replie sur le haut du document quand aucun en-tête n’apparie — jamais rien afficher serait pire', async () => {
    const doc = document;
    const adapter = makeAdapter(() => pr(41), () => blocking(2), {
      getBannerMount: () => null,
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    expect(doc.body.firstElementChild).toBe(doc.querySelector('.cct-banner'));
  });

  it('le filtre s’insère avant le premier fil rendu, hors du bandeau', async () => {
    const doc = document;
    const first = doc.createElement('div');
    doc.body.appendChild(first);
    const thread: ThreadInfo = {
      id: 't1',
      pr: pr(42),
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'issue: quelque chose ne va pas',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    const adapter = makeAdapter(() => pr(42), () => blocking(1), {
      getThreads: async () => [thread],
      getRenderedThreadElements: () => [{ id: 't1', element: first }],
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    const filter = doc.querySelector('.cct-thread-filter');
    expect(filter).not.toBeNull();
    expect(filter!.nextElementSibling).toBe(first);
    expect(doc.querySelector('.cct-banner .cct-thread-filter')).toBeNull(); // plus dans le bandeau
    expect(doc.querySelector('.cct-banner select')).toBeNull(); // ni le menu déroulant d'avant
  });

  it('un décompte publié nul n’affiche aucun bandeau, mais laisse le filtre disponible', async () => {
    const doc = document;
    const first = doc.createElement('div');
    doc.body.appendChild(first);
    const thread: ThreadInfo = {
      id: 't1',
      pr: pr(43),
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'praise: joliment fait',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    const adapter = makeAdapter(() => pr(43), () => blocking(0), {
      getThreads: async () => [thread],
      getRenderedThreadElements: () => [{ id: 't1', element: first }],
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0); // une PR saine ne se décore pas
    expect(doc.querySelector('.cct-thread-filter')).not.toBeNull();
  });

  it('la place du filtre est celle que la PLATEFORME donne — et `null` veut dire : pas de filtre', async () => {
    // La décision était celle du code partagé (« avant le premier fil ») ; elle appartient à
    // l'adaptateur (`getThreadFilterMount`) : dans une vue de diff, les fils sont intercalés
    // entre les lignes, et le filtre tombait au milieu du code (validation sur GitLab).
    const doc = document;
    const thread: ThreadInfo = {
      id: 't1',
      pr: pr(44),
      root: {
        id: 't1-root',
        author: { id: 'login:x', login: 'x', isServiceAccount: false },
        body: 'issue: quelque chose ne va pas',
        createdAt: '2026-01-01T00:00:00Z',
        permalink: '#t1',
        isSystemGenerated: false,
        canCarryBlockingState: true,
      },
      replies: [],
      resolution: 'unknown',
      canCarryBlockingState: true,
    };
    const first = doc.createElement('div');
    const elsewhere = doc.createElement('section');
    doc.body.append(elsewhere, first);

    const placed = makeAdapter(() => pr(44), () => null, {
      getThreads: async () => [thread],
      getRenderedThreadElements: () => [{ id: 't1', element: first }],
      getThreadFilterMount: () => elsewhere,
    });
    const stopPlaced = observe(placed, new ClientConfigResolver(async () => null), doc);
    await flushAll();
    expect(doc.querySelector('.cct-thread-filter')?.nextElementSibling).toBe(elsewhere);
    stopPlaced();

    doc.body.innerHTML = '';
    const again = doc.createElement('div');
    doc.body.appendChild(again);
    const none = makeAdapter(() => pr(45), () => null, {
      getThreads: async () => [{ ...thread, pr: pr(45) }],
      getRenderedThreadElements: () => [{ id: 't1', element: again }],
      getThreadFilterMount: () => null,
    });
    observe(none, new ClientConfigResolver(async () => null), doc);
    await flushAll();
    expect(doc.querySelector('.cct-thread-filter')).toBeNull();
  });
});

describe('§5.5 — ce que notre rendu a laissé dans la page est surveillé aussi (revue Codex, PR #26)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** Fil dont le corps ET le texte rendu suivent la même source : une racine éditée SUR
   * PLACE, comme le fait la plateforme quand on corrige un commentaire. */
  function editableThread(doc: Document, prRef: PrRef, body: () => string) {
    const element = doc.createElement('div');
    element.textContent = body();
    return {
      element,
      retext: (next: string) => {
        element.textContent = next;
      },
      info: (): ThreadInfo => ({
        id: 't1',
        pr: prRef,
        root: {
          id: 't1-root',
          author: { id: 'login:alice', login: 'alice', isServiceAccount: false },
          body: body(),
          createdAt: '2026-01-01T00:00:00Z',
          permalink: '#t1',
          isSystemGenerated: false,
          canCarryBlockingState: true,
        },
        replies: [],
        resolution: 'unresolved',
        canCarryBlockingState: true,
      }),
    };
  }

  it('une racine éditée sur place rafraîchit le sujet : ni le nombre de fils ni leurs identifiants ne bougent', async () => {
    // Le bandeau affiche désormais le SUJET (§5.5). Une correction en place ne change ni le
    // nombre de fils, ni leurs identifiants, ni le nombre de commentaires : la signature de
    // plateforme reste identique, et sans surveillance du texte le bandeau resterait périmé.
    const doc = document;
    const current = pr(50);
    let body = 'issue: le retry ne borne pas le backoff';
    const thread = editableThread(doc, current, () => body);
    doc.body.appendChild(thread.element);

    const adapter = makeAdapter(() => current, () => blocking(1), {
      getThreads: async () => [thread.info()],
      getRenderedThreadElements: () => [{ id: 't1', element: thread.element }],
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();
    expect(doc.querySelector('.cct-banner-subject')?.textContent).toBe('le retry ne borne pas le backoff');

    body = 'issue: le backoff doit être plafonné';
    thread.retext(body); // édition en place : le DOM du fil change, son identifiant non
    await flushAll();

    expect(doc.querySelector('.cct-banner-subject')?.textContent).toBe('le backoff doit être plafonné');
  });

  it('un bandeau emporté par une réhydratation de la plateforme est remonté', async () => {
    // Le bandeau est adossé à un élément qui appartient à la PLATEFORME (`bannerMount`) :
    // un rerendu React qui remplace ce parent emporte notre élément avec lui, sans rien
    // changer aux fils.
    const doc = document;
    const current = pr(51);
    const header = doc.createElement('div');
    doc.body.appendChild(header);
    const adapter = makeAdapter(() => current, () => blocking(2), {
      getBannerMount: () => header,
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);

    doc.querySelector('.cct-banner')!.remove(); // la plateforme reprend la main sur son en-tête
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1); // remonté, pas laissé absent
  });

  it('nos propres écritures ne se re-déclenchent pas elles-mêmes : un seul rendu par changement', async () => {
    // Le revers du test précédent. La photo de notre sortie est prise APRÈS le rendu ; prise
    // avant, chaque insertion de bandeau relancerait un rendu, indéfiniment.
    const doc = document;
    const current = pr(52);
    let renders = 0;
    const adapter = makeAdapter(() => current, () => blocking(1), {
      getThreads: async () => {
        renders++;
        return [];
      },
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();
    const afterFirst = renders;

    for (let i = 0; i < 5; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll();
    }

    expect(renders).toBe(afterFirst); // aucune relance : ni nos écritures, ni des mutations neutres
  });

  it('révoquée, l’observation n’écrit plus rien — y compris depuis un rendu en vol', async () => {
    const doc = document;
    const current = pr(53);
    const adapter = makeAdapter(() => current, () => blocking(1));
    const dispose = observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);

    dispose();
    doc.querySelector('.cct-banner')!.remove();
    for (let i = 0; i < 5; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll();
    }
    await new Promise((resolve) => setTimeout(resolve, RENDER_RETRY_THROTTLE_MS + 20));

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0); // plus rien ne repousse
  });
});

describe('§5.5 — révocation et pliage (revue Codex round 3, PR #26)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('révoquée pendant un rendu EN VOL, l’observation n’écrit plus rien', async () => {
    // Déconnecter l'observateur ne suffit pas : le rendu déjà parti aboutit et écrirait
    // bandeau et badges dans une page dont cette observation ne sait plus rien.
    const doc = document;
    const current = pr(60);
    let releaseThreads: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseThreads = resolve;
    });
    const commentEl = doc.createElement('div');
    const adapter = makeAdapter(() => current, () => blocking(2), {
      getThreads: async () => {
        await gate; // le rendu se bloque ici, avant toute écriture
        return [];
      },
      getRenderedComments: () => [{ element: commentEl, bodyText: 'issue: x' }],
    });

    const dispose = observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flush(); // laisse le rendu démarrer et se bloquer
    dispose();
    releaseThreads!();
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);
    expect(commentEl.querySelector('.cct-badge')).toBeNull(); // ni badge
  });

  it('un bandeau déplié par l’utilisateur le reste quand un fil est édité', async () => {
    // Le bandeau est reconstruit à chaque rendu, et depuis que le texte des fils est
    // surveillé, une correction en place en déclenche un : réappliquer le défaut replierait
    // ce que l'utilisateur vient de déplier.
    const doc = document;
    const current = pr(61);
    const threadEl = doc.createElement('div');
    threadEl.textContent = 'issue: le retry ne borne pas le backoff';
    doc.body.appendChild(threadEl);
    let body = 'issue: le retry ne borne pas le backoff';
    const adapter = makeAdapter(() => current, () => null, {
      getThreads: async () => [
        {
          id: 't1',
          pr: current,
          root: {
            id: 't1-root',
            author: { id: 'login:alice', login: 'alice', isServiceAccount: false },
            body,
            createdAt: '2026-01-01T00:00:00Z',
            permalink: '#t1',
            isSystemGenerated: false,
            canCarryBlockingState: true,
          },
          replies: [],
          resolution: 'unresolved',
          canCarryBlockingState: true,
        } as ThreadInfo,
      ],
      getRenderedThreadElements: () => [{ id: 't1', element: threadEl }],
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    const banner = doc.querySelector('.cct-banner') as HTMLDetailsElement;
    expect(banner.open).toBe(false); // replié par défaut : le bandeau signale, il n'interrompt pas
    banner.open = true; // l'utilisateur le déplie
    banner.dispatchEvent(new Event('toggle'));

    body = 'issue: le backoff doit être plafonné';
    threadEl.textContent = body; // édition en place → nouveau rendu
    await flushAll();

    const rebuilt = doc.querySelector('.cct-banner') as HTMLDetailsElement;
    expect(rebuilt.querySelector('.cct-banner-subject')?.textContent).toBe('le backoff doit être plafonné');
    expect(rebuilt.open).toBe(true); // toujours déplié : son choix a survécu
  });
});

describe('§5.5 — révocation complète et pliage remis à neuf (revue Codex round 4, PR #26)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('un bandeau déplié puis DISPARU repart sur son défaut quand un fil bloquant revient', async () => {
    // Le choix de l'utilisateur portait sur une situation qui n'existe plus : entre-temps le
    // décompte est retombé à zéro et le bandeau s'est effacé. Un nouveau fil bloquant est une
    // nouvelle situation, et repart sur le défaut, replié — pas sur un choix fait pour l'autre.
    const doc = document;
    const current = pr(70);
    let blockingOnPage = blocking(1);
    const adapter = makeAdapter(() => current, () => blockingOnPage);
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    const banner = doc.querySelector('.cct-banner') as HTMLDetailsElement;
    expect(banner.open).toBe(false);
    banner.open = true; // l'utilisateur le déplie
    banner.dispatchEvent(new Event('toggle'));

    // Tout est résolu : plus de bandeau du tout.
    blockingOnPage = blocking(0);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);

    // Un nouveau fil bloquant apparaît sur la MÊME PR.
    blockingOnPage = blocking(1);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect((doc.querySelector('.cct-banner') as HTMLDetailsElement).open).toBe(false);
  });

  it('la révocation de bootstrap(document, testFactories()) rend AUSSI l’observation des éditeurs', async () => {
    // Elle n'en rendait qu'une : les éditeurs apparus ensuite recevaient encore un
    // contrôleur, et deux bootstrap() successifs en empilaient deux par éditeur.
    const doc = document;
    Object.defineProperty(doc, 'location', {
      value: new URL('https://github.com/acme/demo/pull/80'),
      configurable: true,
    });
    doc.body.innerHTML = '';

    // Le `Disposable` d'observeEditors était simplement jeté : la révocation ne rendait que
    // l'observation du bandeau. On l'observe directement plutôt qu'à travers une barre
    // d'outils, dont le rendu dépend d'un DOM de PR complet sans rapport avec ce constat.
    const disposeEditors = vi.fn();
    let onEditor: ((editor: unknown) => void) | null = null;
    const observeEditors = vi
      .spyOn(GithubClientAdapter.prototype, 'observeEditors')
      .mockImplementation((cb: (editor: never) => void) => {
        onEditor = cb as (editor: unknown) => void;
        return { dispose: disposeEditors };
      });
    const readRepoConfig = vi.spyOn(GithubClientAdapter.prototype, 'getRepoConfig');

    const dispose = await bootstrap(doc, testFactories());
    expect(observeEditors).toHaveBeenCalled();
    expect(disposeEditors).not.toHaveBeenCalled();

    dispose();
    expect(disposeEditors).toHaveBeenCalledTimes(1); // l'observation des éditeurs est rendue

    // Et un éditeur signalé malgré tout après coup ne déclenche plus rien : `attach()`
    // traverse plusieurs `await` avant d'installer, il doit renoncer dès le premier pas.
    await flushAll(); // laisse retomber le rendu de bandeau encore en vol, qui lit lui aussi la config
    readRepoConfig.mockClear();
    onEditor!({ element: doc.createElement('textarea'), context: { pr: null, zone: 'conversation' } });
    await flushAll();
    expect(readRepoConfig).not.toHaveBeenCalled();

    observeEditors.mockRestore();
    readRepoConfig.mockRestore();
  });
});

describe('Codex round 4 — la signature de reprise sonde les ÉLÉMENTS rendus, jamais leur corps (§9.4)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sonde getRenderedCommentElements(), jamais getRenderedComments()', async () => {
    const doc = document;
    const current = pr(29);
    let commentsCalls = 0;
    let elementsCalls = 0;
    const commentEl = doc.createElement('div');
    const adapter = makeAdapter(() => current, () => blocking(0), {
      getRenderedComments: () => {
        commentsCalls++; // ne DOIT être appelé que par le rendu : bodyText coûte un clone par commentaire
        return [{ element: commentEl, bodyText: 'issue: x' }];
      },
      getRenderedCommentElements: () => {
        elementsCalls++;
        return [commentEl];
      },
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    for (let i = 0; i < 5; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll();
    }

    expect(elementsCalls).toBeGreaterThan(0);
    // getRenderedComments() n'est appelée QUE par le rendu réel (décoration des badges,
    // renderPrChrome), jamais par la signature de reprise (contentSignatureOf) — ici la PR
    // ne change jamais de signature après le premier rendu, donc aucun second rendu réel.
    expect(commentsCalls).toBe(1);
  });
});

describe('Codex #38 — sondage périodique de la configuration effective sur un onglet inerte (§8.1.2)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('une modification de configuration est adoptée dans l’intervalle de sondage, SANS aucune mutation DOM', async () => {
    const doc = document;
    const current = pr(30);
    let configText = '{}'; // défauts : mode assist
    const adapter = makeAdapter(() => current, () => blocking(1));
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    // Horloge du RÉSOLVEUR, indépendante de celle passée à observePrChromeNavigation : c'est elle qui gouverne l'expiration du cache de
    // configuration (§8.1.2), pas la fenêtre de rattrapage de la barre.
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);
    const POLL_MS = 30;

    observe(adapter, resolver, doc, undefined, undefined, POLL_MS);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1); // mode assist : le bandeau signale le fil

    // La configuration du dépôt bascule sur `off`, et le cache expire — mais AUCUNE mutation
    // DOM n'est produite ici : la page reste par ailleurs parfaitement inerte (pas de
    // nouveau commentaire, pas de navigation, pas de changement d'état de fil). Seul le
    // sondage périodique, indépendant du MutationObserver, peut faire remarquer ce
    // changement à cette observation.
    configText = JSON.stringify({ mode: 'off' });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)

    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0); // §7 : mode off, plus rien d'affiché
  });

  it('des réveils périodiques répétés sans changement de configuration ne produisent ni rendu ni écriture DOM', async () => {
    const doc = document;
    const current = pr(31);
    let getThreadsCalls = 0;
    // Décompte NON nul : bannerHasContent() (ui/banner.ts) tait le bandeau sur un décompte
    // à zéro — ce n'est pas ce que ce test couvre (un rendu qui n'a rien à montrer), qui
    // porte sur un rendu déjà affiché qu'aucun réveil sans changement ne doit reconstruire.
    const adapter = makeAdapter(() => current, () => blocking(1), {
      getThreads: async () => {
        getThreadsCalls++;
        return [];
      },
    });
    adapter.getRepoConfig = async () => ({ status: 'found', text: '{}' });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);
    const POLL_MS = 20;

    observe(adapter, resolver, doc, undefined, undefined, POLL_MS);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    const callsOnceShown = getThreadsCalls;
    const bannerAfterFirstRender = doc.querySelector('.cct-banner');

    // Bien au-delà de l'ancien plafond de tentatives : plusieurs intervalles de sondage
    // s'écoulent, l'horloge du résolveur n'avance PAS (le cache de configuration reste
    // valide, rien n'a changé) et la page reste inerte — aucune mutation DOM, aucune
    // navigation.
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 8));
    await flushAll();

    // Ni relecture des fils (donc pas de second `renderPrChrome`), ni second bandeau — le
    // sondage périodique n'a produit aucune écriture dans la page tant que la configuration
    // qu'il a lue n'a pas changé.
    expect(getThreadsCalls).toBe(callsOnceShown);
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    expect(doc.querySelector('.cct-banner')).toBe(bannerAfterFirstRender); // même élément, jamais reconstruit
  });

  it('un champ qui ne change aucun verdict (langue) change le rendu — sondé quand même', async () => {
    const doc = document;
    const current = pr(32);
    const adapter = makeAdapter(() => current, () => blocking(1));
    let configText = JSON.stringify({ language: 'en' });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);
    const POLL_MS = 30;

    observe(adapter, resolver, doc, undefined, undefined, POLL_MS);
    await flushAll();
    // « {count} unresolved blocking thread(s) » (en) — voir ui/strings.ts.
    expect(bannerTitles(doc)[0]).toContain('unresolved');

    // Seule la langue change — aucun verdict ne bouge — et AUCUNE mutation DOM n'a lieu : seul le sondage périodique peut faire remarquer ce
    // changement à un onglet par ailleurs inerte.
    configText = JSON.stringify({ language: 'fr' });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)

    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));
    await flushAll();

    // « {count} fil(s) bloquant(s) non résolu(s) » (fr). Comparer une empreinte du seul
    // verdict dans `pollConfig` (avant correctif) aurait laissé ce texte en anglais
    // indéfiniment : rien dans le domaine du verdict n'a changé.
    expect(bannerTitles(doc)[0]).toContain('non résolu');
  });

  it('un label retiré par un changement de configuration efface le badge déjà posé, sans aucune mutation DOM', async () => {
    const doc = document;
    const current = pr(33);
    const commentEl = doc.createElement('div');
    doc.body.appendChild(commentEl); // decorateComment()/clearBadges() interrogent le document
    let configText = '{}'; // défauts : label "issue" actif
    const adapter = makeAdapter(() => current, () => blocking(0), {
      getRenderedComments: () => [{ element: commentEl, bodyText: 'issue: quelque chose ne va pas' }],
    });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);
    const POLL_MS = 30;

    observe(adapter, resolver, doc, undefined, undefined, POLL_MS);
    await flushAll();
    expect(commentEl.querySelector('.cct-badge')).not.toBeNull(); // badge "issue" posé

    // Le label est retiré de la configuration — decorateComment() compare sa propre
    // signature de rendu (ui/badges.ts) et retire le badge devenu obsolète, mais seulement
    // s'il est effectivement RAPPELÉ : sans le sondage périodique de cette PR, `run()` ne se
    // déclenche jamais sur un onglet par ailleurs inerte, et decorateComment() ne serait
    // jamais rappelé pour constater le changement. Aucune mutation DOM n'a lieu ici — seul
    // le sondage périodique peut faire remarquer ce changement à un onglet inerte.
    configText = JSON.stringify({ labels: [{ id: 'issue', enabled: false }] });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)

    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));
    await flushAll();

    expect(commentEl.querySelector('.cct-badge')).toBeNull();
  });

  it('un changement d’état DÉGRADÉ sans changement de contenu de configuration est quand même sondé (revue Reefact, PR #39)', async () => {
    const doc = document;
    const current = pr(34);
    const adapter = makeAdapter(() => current, () => blocking(1));
    // Le fichier de dépôt est vide — la configuration effective ne dépend donc QUE du
    // plancher (mode et périmètre d'activation forcés ici), jamais de sa lisibilité : la
    // rendre injoignable ne change pas un seul champ de `EffectiveConfig`. Seul `degraded`
    // (§5.4, condition 4) bouge — exactement le cas que `renderConfigSignatureOf` doit
    // couvrir, à côté de `config`, pas seulement dedans.
    let repoUnreachable = false;
    adapter.getRepoConfig = async () => (repoUnreachable ? { status: 'unreachable' } : { status: 'found', text: '{}' });
    let resolverNow2 = 0;
    const resolver2 = new ClientConfigResolver(
      async () => ({ minimumMode: 'enforce', activation: { activatedAt: '2025-01-01T00:00:00Z' } }),
      () => resolverNow2
    );
    const POLL_MS2 = 30;
    const refreshes: (ResolvedClientConfig | null)[] = [];

    observe(adapter, resolver2, doc, undefined, (_pr, changed, resolved) => {
      if (!changed) refreshes.push(resolved);
    }, POLL_MS2);
    await flushAll();
    expect(refreshes).toHaveLength(0); // rien qu'une navigation jusqu'ici : pas de ré-résolution

    // Le dépôt devient injoignable, et AUCUNE mutation DOM n'a lieu — seul le sondage
    // périodique peut faire remarquer ce changement à un onglet par ailleurs inerte.
    repoUnreachable = true;
    resolverNow2 += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)

    await new Promise((resolve) => setTimeout(resolve, POLL_MS2 * 3));
    await flushAll();

    // Comparer seulement `renderConfigSignatureOf(resolved.config)` (avant correctif)
    // aurait vu une configuration parfaitement identique et conclu qu'il n'y avait rien à
    // signaler — un éditeur déjà ouvert serait resté armé sur `degraded: false`, alors que
    // le §5.4 exige de désarmer le blocage dès qu'une lecture est dégradée.
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.degraded).toBe(true);
  });

  it('la cadence du sondage se borne au TTL effectif une fois connu, pas seulement à configPollIntervalMs (revue Reefact, PR #39)', async () => {
    const doc = document;
    const current = pr(35);
    const adapter = makeAdapter(() => current, () => blocking(1));
    let repoConfigCalls = 0;
    // TTL d'entreprise très court — 1 s, la plus petite valeur non nulle admise (entier de
    // secondes, §8.1.2) — très en deçà du plafond `configPollIntervalMs` ci-dessous.
    adapter.getRepoConfig = async () => {
      repoConfigCalls++;
      return { status: 'found', text: JSON.stringify({ configCacheTtlSeconds: 1 }) };
    };
    const resolver = new ClientConfigResolver(async () => null);
    const CEILING_MS = 4000;
    // Plancher de test, minuscule à dessein : le plancher de PRODUCTION
    // (`CONFIG_POLL_MIN_INTERVAL_MS`, 5 s) masquerait ici l'effet du TTL d'1 s qu'on
    // cherche justement à observer — les deux plafonds répondent à des questions
    // différentes (voir le commentaire du paramètre sur `observePrChromeNavigation`).
    const MIN_MS = 20;

    observe(adapter, resolver, doc, undefined, undefined, CEILING_MS, MIN_MS);
    await flushAll();
    const callsAfterFirstRender = repoConfigCalls;
    expect(callsAfterFirstRender).toBeGreaterThanOrEqual(1);

    await new Promise((resolve) => setTimeout(resolve, 2200));
    await flushAll();

    // À une cadence bornée par le TTL effectif (~1 s), au moins deux réveils supplémentaires
    // ont eu lieu en 2,2 s. Bornée par le seul plafond de repli (4 s, avant correctif), aucun
    // n'aurait encore eu lieu — la fenêtre de divergence A/B dépasserait alors le TTL que
    // l'administration a choisi.
    expect(repoConfigCalls).toBeGreaterThanOrEqual(callsAfterFirstRender + 2);
  }, 10000);
});

describe('§5.5 — un commentaire MIS À JOUR retrouve ses badges (défaut signalé : badges disparus, préfixe réapparu en clair)', () => {
  // VRAI GithubClientAdapter, jamais un faux : le défaut tient précisément à ce que les
  // deux listes de cet adaptateur ne recouvrent PAS le même DOM — les fils rendus
  // (`[data-testid="review-thread"]`, `.js-resolvable-timeline-thread-container`) ne
  // contiennent aucun commentaire de la CONVERSATION, que ses corps de commentaire
  // (`[data-testid="comment-body"]`, `.comment-body`) couvrent pourtant. Un faux qui
  // exposerait les deux selon notre idée du DOM de GitHub testerait cette idée, pas le
  // rapport entre les deux sélecteurs réellement livrés.
  const fetchImpl = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

  function onPullRequest(): void {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/71'),
      configurable: true,
    });
  }

  /** Commentaire de premier niveau de l'onglet Conversation : un corps de commentaire, hors
   * de tout conteneur de fil de revue. Le corps rendu par GitHub enveloppe chaque ligne
   * Markdown dans un `<p>` — la seule forme que le masquage du préfixe accepte (ui/badges.ts,
   * `firstTextNode`), et donc la seule qui vérifie vraiment quelque chose ici. */
  function conversationComment(subject: string): Element {
    document.body.innerHTML =
      `<div class="js-comment"><div data-testid="comment-body"><p>nitpick (test): ${subject}</p><p>une discussion</p></div></div>`;
    return document.querySelector('[data-testid="comment-body"]')!;
  }

  afterEach(async () => {
    // `currentPr()` d'un VRAI adaptateur relit `document.location` à chaque appel : le
    // laisser pointer sur cette PR ferait revivre, à la prochaine mutation, tout observateur
    // dormant armé par un autre test sur ce document PARTAGÉ (voir l'en-tête de fichier).
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pulls'),
      configurable: true,
    });
    document.body.innerHTML = '';
    await flushAll();
  });

  it('la réécriture du corps par la plateforme fait reposer les badges et le masquage du préfixe', async () => {
    onPullRequest();
    const body = conversationComment('un sujet de test');
    // Un corps de commentaire rendu : ce rendu a donc « montré quelque chose » quoi qu'il
    // arrive, et seule la signature de NOTRE sortie peut encore remarquer la mise à jour du
    // commentaire.
    const adapter = new GithubClientAdapter({ documentRef: document, fetchImpl });

    observe(adapter, new ClientConfigResolver(async () => null), document);
    await flushAll();
    expect(body.querySelector('.cct-badge')).not.toBeNull();
    expect(body.querySelector('.cct-hidden-prefix')).not.toBeNull();

    // L'auteur met son commentaire à jour : GitHub réécrit le corps RENDU, ce qui emporte
    // nos badges et notre masquage. Rien d'autre ne bouge — même nombre de commentaires,
    // toujours aucun fil de revue : avant correctif, ni la signature du contenu de la
    // plateforme ni `ownOutputSignatureOf` ne changeaient, `run()` sortait, et ce
    // commentaire restait DÉFINITIVEMENT sans badge, préfixe structuré affiché en clair.
    body.innerHTML = '<p>nitpick (test): un sujet corrigé</p><p>une discussion</p>';
    await flushAll();

    expect(body.querySelector('.cct-badge')).not.toBeNull();
    expect(body.querySelector('.cct-hidden-prefix')?.textContent).toBe('nitpick (test): ');
    // Le sujet corrigé reste visible : seul le préfixe est masqué.
    expect(body.querySelector('p')?.textContent).toContain('un sujet corrigé');
  });

  it('et cela vaut aussi passé la fenêtre d’hydratation, sur une PR où les badges sont la seule chose affichée', async () => {
    onPullRequest();
    const body = conversationComment('un sujet de test');
    // Aucun fil de revue — les badges
    // des commentaires sont la SEULE chose que l'extension affiche sur cette PR. Avant
    // correctif, un tel rendu concluait « rien à montrer », et `observePrChromeNavigation`
    // cessait de rendre TOUT COURT une fois `RENDER_RETRY_WINDOW_MS` écoulée : la fenêtre
    // d'hydratation devenait une date de péremption pour la seule surface affichée.
    const adapter = new GithubClientAdapter({ documentRef: document, fetchImpl });
    const clock = makeClock();

    observe(adapter, new ClientConfigResolver(async () => null), document, clock.now);
    await flushAll();
    expect(body.querySelector('.cct-badge')).not.toBeNull();

    clock.advance(RENDER_RETRY_WINDOW_MS + 1);
    body.innerHTML = '<p>nitpick (test): un sujet corrigé</p><p>une discussion</p>';
    await flushAll();

    expect(body.querySelector('.cct-badge')).not.toBeNull();
    expect(body.querySelector('.cct-hidden-prefix')?.textContent).toBe('nitpick (test): ');

    // Une SECONDE mise à jour, et ce n'est pas une redite : le premier tour passé la fenêtre
    // peut avoir d'autres causes (la sonde du bouton de fusion, retirée depuis, en était une).
    // C'est ce deuxième tour, où plus rien ne bouge que le commentaire lui-même, qui vérifie
    // que la mise à jour EST la cause du rendu.
    body.innerHTML = '<p>nitpick (test): un sujet corrigé deux fois</p><p>une discussion</p>';
    await flushAll();

    expect(body.querySelector('.cct-badge')).not.toBeNull();
    expect(body.querySelector('.cct-hidden-prefix')?.textContent).toBe('nitpick (test): ');
    expect(body.querySelector('p')?.textContent).toContain('un sujet corrigé deux fois');
  });

  it('le masquage du préfixe SEUL défait — texte et badges intacts — est reposé (revue Reefact, PR #42)', async () => {
    onPullRequest();
    const body = conversationComment('un sujet de test');
    const adapter = new GithubClientAdapter({ documentRef: document, fetchImpl });

    observe(adapter, new ClientConfigResolver(async () => null), document);
    await flushAll();
    expect(body.querySelector('.cct-hidden-prefix')).not.toBeNull();
    const textBefore = body.textContent;

    // Réhydratation qui reconstruit le SEUL sous-arbre de texte natif, sans toucher aux
    // badges : le `<p>` retrouve son texte brut, donc plus de `.cct-hidden-prefix`, et les
    // badges restent en place à côté de lui. C'est le cas que `decorateComment` sait déjà
    // réparer (entretien inconditionnel du masquage, revue Reefact PR #40) mais que rien ne
    // lui donnait l'occasion de voir.
    //
    // Les nœuds de texte sont remplacés UN À UN plutôt que par un `innerHTML` du paragraphe :
    // depuis que les badges partagent la ligne du sujet (§5.5), ils vivent DANS ce paragraphe,
    // et l'écraser en entier les emporterait — le texte des badges quitterait `textContent`,
    // le digest le verrait, et ce test ne testerait plus l'angle mort qu'il vise.
    const paragraph = body.querySelector('p')!;
    for (const node of [...paragraph.childNodes]) {
      if (!(node.nodeType === 1 && (node as Element).classList.contains('cct-badge'))) node.remove();
    }
    paragraph.append(document.createTextNode('nitpick (test): un sujet de test'));
    // Les deux prémisses de ce test, vérifiées et non supposées — sans elles il ne testerait
    // plus ce qu'il annonce : `display: none` est une propriété de RENDU, `textContent`
    // rapporte le texte masqué comme n'importe quel autre, et le digest de texte est donc
    // rigoureusement aveugle à ce défaut.
    expect(body.textContent).toBe(textBefore);
    expect(body.querySelector('.cct-badge')).not.toBeNull();

    await flushAll();

    expect(body.querySelector('.cct-hidden-prefix')?.textContent).toBe('nitpick (test): ');
    expect(body.querySelector('.cct-badge')).not.toBeNull(); // les badges n'ont pas été perdus au passage
  });

  it('la mise en avant du SUJET seule défaite — préfixe, texte et badges intacts — est reposée (§5.5)', async () => {
    // Même angle mort, un nœud plus loin : `.cct-subject` n'AJOUTE aucun texte, il enveloppe
    // celui de l'auteur. Le défaire laisse `textContent` rigoureusement identique, et laisse
    // aussi `.cct-hidden-prefix` en place — donc la carte du seul préfixe, telle qu'elle
    // existait, n'y voyait rien. Le sujet perdait son gras jusqu'au rechargement de la page.
    onPullRequest();
    const body = conversationComment('un sujet de test');
    const adapter = new GithubClientAdapter({ documentRef: document, fetchImpl });

    observe(adapter, new ClientConfigResolver(async () => null), document);
    await flushAll();
    const subject = body.querySelector('.cct-subject');
    expect(subject).not.toBeNull();
    const textBefore = body.textContent;

    // Le wrapper SEUL est défait, ses enfants rendus au paragraphe à leur place exacte.
    const parent = subject!.parentNode!;
    while (subject!.firstChild) parent.insertBefore(subject!.firstChild, subject!);
    subject!.remove();

    // Les trois prémisses de ce test, vérifiées et non supposées.
    expect(body.textContent).toBe(textBefore);
    expect(body.querySelector('.cct-hidden-prefix')).not.toBeNull();
    expect(body.querySelector('.cct-badge')).not.toBeNull();

    await flushAll();

    expect(body.querySelector('.cct-subject')?.textContent).toBe('un sujet de test');
  });

  // Invariant dont dépend tout ce qui précède, dans LES DEUX adaptateurs : la sonde bon
  // marché employée par `ownOutputSignatureOf` doit désigner EXACTEMENT les corps que le
  // rendu décore (`getRenderedComments`). Deux listes qui divergeraient feraient surveiller
  // des nœuds où rien n'est écrit — la signature resterait stable pendant que les badges
  // disparaissent, c'est-à-dire le défaut d'origine, à nouveau, sans qu'aucun des deux tests
  // ci-dessus ne le voie. Azure DevOps n'a jamais été vérifié en direct dans ce dépôt
  // (§9.4) : c'est une raison de plus de contrôler au moins l'accord des deux sondes.
  it('la sonde d’éléments et la lecture décorante désignent les mêmes corps (GitHub et Azure DevOps)', () => {
    onPullRequest();
    document.body.innerHTML =
      '<div data-testid="comment-body"><p>issue: un sujet de test</p></div>' +
      '<div data-testid="review-thread"><div class="comment-body"><p>nitpick: un autre sujet</p></div></div>' +
      // Forme MESURÉE sur les captures Azure DevOps (packages/adapters/azdo/CAPTURES.md) : le corps
      // d'un commentaire est un `.markdown-content` DANS son `.repos-discussion-comment` ; un
      // `.markdown-content` isolé est la description de la PR, que l'adaptateur écarte.
      '<div class="repos-discussion-comment"><div class="markdown-content"><p>issue: un sujet Azure</p></div></div>';

    const github = new GithubClientAdapter({ documentRef: document, fetchImpl });
    expect(github.getRenderedCommentElements()).toEqual(github.getRenderedComments().map((c) => c.element));
    expect(github.getRenderedCommentElements().length).toBeGreaterThan(0);

    const azdo = new AzdoClientAdapter({ documentRef: document });
    expect(azdo.getRenderedCommentElements()).toEqual(azdo.getRenderedComments().map((c) => c.element));
    expect(azdo.getRenderedCommentElements().length).toBeGreaterThan(0);
  });
});

describe('#124 — une navigation est UNE visite pour le journal', () => {
  // Le rapport du 2026-11-04 : `pr-created-at` journalisé `count: 2` pour une seule navigation,
  // à 1 ms d'écart. `run()` demandait `currentPr()` — qui lit la date de création — pour savoir
  // si la PR avait changé, AVANT que `onPrChange` ne déclare la nouvelle visite : la sonde
  // journalisait dans la visite précédente, puis à nouveau dans la nouvelle.
  it('la sonde qui détecte la navigation ne journalise pas : une seule ligne, dans la nouvelle visite', async () => {
    const chain = { name: 'pr-created-at', candidates: ['[id^="pullrequest-"] relative-time'] };
    const writes: string[] = [];
    const log = new SelectorLog(null, (c) => writes.push(c.name));
    let current: PrRef | null = pr(90);
    // La page n'est pas encore celle de la PR : la date est introuvable à chaque appel.
    const adapter = makeAdapter(() => {
      log.degraded(chain);
      return current;
    });
    observePrChromeNavigation(
      adapter,
      new ClientConfigResolver(async () => null),
      document,
      Date.now,
      (_pr, changed) => {
        if (changed) log.newVisit();
      },
      0,
      undefined,
      (fn) => log.quietly(fn)
    );
    await flushAll();
    expect(writes).toEqual(['pr-created-at']);
    // Neutralise l'observateur : la page ne montre plus de PR.
    current = null;
    document.body.appendChild(document.createElement('div'));
    await flushAll();
  });
});
