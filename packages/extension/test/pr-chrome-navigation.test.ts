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
//      cache — bien avant que le contenu réel (fils, statut publié) n'ait le temps
//      d'arriver. Remplacé par une fenêtre de TEMPS.
// D3 — une fois qu'un premier rendu avait montré quelque chose (ex. la vue locale), plus
//      rien ne retentait sur la même PR : le résumé publié du composant B, arrivé après
//      coup, n'était jamais adopté (CA-03, §6.5).
//
// Revue automatisée de la PR (Codex, 2026-08-24) — cinq constats confirmés, tous des
// conséquences directes du fait que D3 rend possible un DEUXIÈME rendu sur la même PR,
// ce qu'aucun chemin de code n'avait jamais eu à affronter avant :
//   - la signature de reprise ne couvrait que state/count/fingerprint, pas mode/coreVersion
//     — pourtant affichés (`banner.judged`) ;
//   - un premier rendu où le résumé publié précède le reste de la page (bouton, fils,
//     commentaires) se figeait sans jamais les attraper ensuite ;
//   - un badge posé par decorateComment() sur un commentaire est lu par getThreads()/
//     getRenderedComments() au tour SUIVANT, corrompant le corps qu'analyze() reçoit ;
//   - un grisage posé pendant que le mode est enforce/warn survivait à un passage à off ;
//   - clearStaleBanner remettait `display: ''` sur TOUT fil rendu, y compris ceux que la
//     plateforme masque elle-même (réduit, virtualisé) — jamais seulement ceux du filtre.
//
// Convention de ce fichier : chaque `observePrChromeNavigation`/`bootstrap()` arme un
// MutationObserver vivant, JAMAIS disposé (comme en production), sur le `document` GLOBAL
// happy-dom partagé par tout le fichier — `afterEach` ne fait que vider `document.body`, il
// ne désarme aucun observateur. Un observateur qui n'atteint jamais un état durablement
// dormant (fenêtre de rattrapage jamais expirée, résumé publié jamais stabilisé) resterait
// réactif aux mutations des tests SUIVANTS et pourrait leur retirer leur bandeau via
// `clearStaleBanner()`. Chaque test qui n'atteint pas cet état naturellement (navigation
// vers `pr → null`, ou signature de résumé publié stable) le neutralise explicitement avant
// sa fin (voir les commentaires « Neutralise »/« Cette PR ne s'hydrate jamais » ci-dessous).
// Un test ajouté qui laisserait un observateur indéfiniment réactif casserait cette garantie
// SANS qu'aucune assertion ne le signale à l'endroit fautif — le symptôme apparaîtrait dans
// un test ultérieur, sans rapport apparent.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { commentBodyText, type PlatformAdapter, type SubmitControl } from '@cct/adapter-shared';
import { defaultConfig, type PrRef, type PublishedSummary, type ThreadInfo } from '@cct/core';
import { ClientConfigResolver } from '../src/config-resolver.js';
import { decorateComment } from '../src/ui/badges.js';
import { applyLabelFilter, clearLabelFilter } from '../src/ui/thread-filter.js';
import {
  applyCompletionState,
  bootstrap,
  observePrChromeNavigation,
  prKeyFor,
  publishedSignatureOf,
  RENDER_RETRY_THROTTLE_MS,
  RENDER_RETRY_WINDOW_MS,
} from '../src/content-internal.js';

function pr(number: number): PrRef {
  return { platform: 'github', createdAt: '2026-01-01T00:00:00Z', host: 'github.com', scope: ['acme', 'demo'], number };
}

function published(unresolvedBlockingCount: number): PublishedSummary {
  return {
    state: 'success',
    isDraft: false,
    exempted: false,
    mode: 'assist',
    coreVersion: '1.0.0',
    configFingerprint: 'deadbeef',
    activatedAt: null,
    unresolvedBlockingCount,
    nonCompliantCommentCount: 0,
    warningCount: 0,
  };
}

function publishedSummary(overrides: Partial<PublishedSummary>): PublishedSummary {
  return { ...published(0), ...overrides };
}

/** Ligne cc/1 valide (§6.3.1) — mêmes clés que `encodeSummary` (core/src/summary.ts),
 * écrite en dur ici pour ne pas dépendre d'un `ComplianceResult` complet. */
function summaryLine(unresolvedBlockingCount: number): string {
  return `cc/1 state=success draft=0 exempt=0 mode=assist activated=- core=1.0.0 cfg=deadbeef t=${unresolvedBlockingCount} c=0 w=0`;
}

/** Adaptateur factice : `currentPr()` — non porté par `PlatformAdapter`, lu par cast comme
 * dans content-internal.ts — reflète la PR « affichée » par la page à un instant donné, au
 * gré des mutations simulées ci-dessous. */
function makeAdapter(
  getCurrent: () => PrRef | null,
  getPublished: () => PublishedSummary | null = () => null,
  opts: {
    getThreads?: () => Promise<ThreadInfo[]>;
    getCompletionControl?: () => SubmitControl | null;
    getRenderedThreadElements?: () => { id: string; element: Element }[];
    getRenderedComments?: () => { element: Element; bodyText: string }[];
    getBannerMount?: () => Element | null;
  } = {}
): PlatformAdapter & {
  currentPr(): PrRef | null;
  getRenderedThreadElements?: () => { id: string; element: Element }[];
  getRenderedComments?: () => { element: Element; bodyText: string }[];
  getBannerMount?: () => Element | null;
} {
  return {
    matches: () => true,
    platformProfile: () => ({ id: 'github', suggestionInfoString: null }),
    getRepoConfig: async () => ({ status: 'absent' }),
    getOrgConfig: async () => ({ status: 'absent' }),
    observeEditors: () => ({ dispose: () => {} }),
    getSubmitControls: () => [],
    readValue: () => '',
    writeValue: () => {},
    getThreads: opts.getThreads ?? (async () => []),
    getCompletionControl: opts.getCompletionControl ?? (() => null),
    getCurrentUser: async () => ({ id: 'u', login: 'u', isServiceAccount: false }),
    readPublishedResult: getPublished,
    currentPr: getCurrent,
    getRenderedThreadElements: opts.getRenderedThreadElements,
    getRenderedComments: opts.getRenderedComments,
    getBannerMount: opts.getBannerMount,
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
  now?: Parameters<typeof observePrChromeNavigation>[3]
): () => void {
  const dispose = observePrChromeNavigation(adapter, resolver, doc, now);
  openObservations.push(dispose);
  return dispose;
}

afterEach(() => {
  for (const dispose of openObservations.splice(0)) dispose();
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

  it('publishedSignatureOf compare par valeur, pas par identité d’objet (§8.1.3 règle 2)', () => {
    const adapter = makeAdapter(() => pr(1), () => published(3));
    expect(publishedSignatureOf(adapter)).toBe(publishedSignatureOf(adapter)); // deux lectures, même valeur
    expect(publishedSignatureOf(makeAdapter(() => pr(1), () => published(4)))).not.toBe(
      publishedSignatureOf(makeAdapter(() => pr(1), () => published(3)))
    );
    expect(publishedSignatureOf(makeAdapter(() => pr(1), () => null))).toBeNull();
  });

  it('publishedSignatureOf réagit à mode et coreVersion — tous deux affichés (banner.judged, revue Codex)', () => {
    // §5.5 : la ligne « jugée par mode X, core Y » (ui/banner.ts, banner.judged) est
    // affichée pour CHAQUE résumé publié. Un check qui se termine à nouveau avec le même
    // décompte et le même state, mais un core ou un mode différent (mise à jour du
    // composant B, ou reconfiguration du mode en cours de session), doit rester détecté —
    // sinon la ligne affichée reste celle du tout premier résumé, indéfiniment.
    const base = publishedSummary({ state: 'success', unresolvedBlockingCount: 1, mode: 'assist', coreVersion: '1.0.0' });
    const differentMode = { ...base, mode: 'enforce' as const };
    const differentCore = { ...base, coreVersion: '1.1.0' };
    expect(publishedSignatureOf(makeAdapter(() => pr(1), () => differentMode))).not.toBe(
      publishedSignatureOf(makeAdapter(() => pr(1), () => base))
    );
    expect(publishedSignatureOf(makeAdapter(() => pr(1), () => differentCore))).not.toBe(
      publishedSignatureOf(makeAdapter(() => pr(1), () => base))
    );
  });

  it('rend le bandeau dès le chargement quand une PR est déjà affichée', async () => {
    const doc = document;
    let current: PrRef | null = pr(1);
    const adapter = makeAdapter(() => current, () => published(current!.number));
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
  });

  it('navigation vers une PR différente : le bandeau se ré-affiche sans rechargement, sans doublon', async () => {
    const doc = document;
    let current: PrRef | null = pr(1);
    const adapter = makeAdapter(() => current, () => published(current!.number));
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
      () => (current ? published(current.number) : null)
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
    const adapter = makeAdapter(() => current, () => (current ? published(current.number) : null));
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

describe('D1 — bootstrap() choisit l’adaptateur par hôte, pas par présence d’une PR (§2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('GithubClientAdapter : matchesHost accepte une page github.com sans PR, matches() reste exigeant', () => {
    const adapter = new GithubClientAdapter();
    const pulls = new URL('https://github.com/acme/demo/pulls');
    const onPr = new URL('https://github.com/acme/demo/pull/42');
    expect(adapter.matchesHost(pulls)).toBe(true);
    expect(adapter.matches(pulls)).toBe(false);
    expect(adapter.matchesHost(onPr)).toBe(true);
    expect(adapter.matches(onPr)).toBe(true);
    expect(adapter.matchesHost(new URL('https://example.com/'))).toBe(false);
  });

  it('AzdoClientAdapter : idem, y compris sur *.visualstudio.com', () => {
    const adapter = new AzdoClientAdapter();
    const list = new URL('https://dev.azure.com/acme/demo/_git/repo/pullrequests');
    const onPr = new URL('https://dev.azure.com/acme/demo/_git/repo/pullrequest/7');
    const vs = new URL('https://acme.visualstudio.com/demo/_git/repo/pullrequests');
    expect(adapter.matchesHost(list)).toBe(true);
    expect(adapter.matches(list)).toBe(false);
    expect(adapter.matchesHost(onPr)).toBe(true);
    expect(adapter.matches(onPr)).toBe(true);
    expect(adapter.matchesHost(vs)).toBe(true);
    expect(adapter.matches(vs)).toBe(false);
  });

  it('la barre apparaît après une navigation SPA vers une PR atteinte depuis une page non-PR, sans second appel à bootstrap()', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('stubbed : pas de réseau en test')));
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pulls'),
      configurable: true,
    });

    openObservations.push(await bootstrap(document));
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
    const check = document.createElement('div');
    check.setAttribute('data-testid', 'check-run-item');
    check.textContent = summaryLine(2);
    document.body.appendChild(check); // la mutation qui signale la navigation SPA (Turbo/React, §A.3)
    await flushAll();

    expect(document.querySelectorAll('.cct-banner')).toHaveLength(1);
    expect(bannerTitles(document)[0]).toContain('2');

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
    const adapter = makeAdapter(() => current, () => (hydrated ? published(current.number) : null));
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

  it('une fois la barre affichée, les mutations suivantes sans changement du résumé publié ne la re-rendent pas', async () => {
    const doc = document;
    const current = pr(13);
    let getThreadsCalls = 0;
    const adapter = makeAdapter(() => current, () => published(current.number), {
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
});

describe('D3 — le résumé publié arrivé après coup est adopté, même une fois la barre déjà affichée (§5.5, §6.5, CA-03)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('décompte, grisage, infobulle et filtre actif se corrigent tous quand le résumé publié apparaît puis change', async () => {
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
    let currentPublished: PublishedSummary | null = null;
    const control: SubmitControl = { element: doc.createElement('button'), kind: 'complete-pr' };
    const adapter = makeAdapter(() => current, () => currentPublished, {
      getThreads: async () => [thread, praised],
      getCompletionControl: () => control,
      getRenderedThreadElements: () => [
        { id: 't1', element: renderedThreadEl },
        { id: 't2', element: praisedThreadEl },
      ],
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();

    // Vue locale (pas encore de résumé publié) : le fil bloquant local suffit à afficher
    // la barre ; le bouton n'est pas grisé.
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
    expect(control.element.hasAttribute('aria-disabled')).toBe(false);

    // Filtre actif sur un label différent de celui du fil bloquant : ce fil est masqué.
    const chip = filterChip(doc, 'praise');
    expect(chip).not.toBeNull();
    chip!.dispatchEvent(new Event('click'));
    expect(renderedThreadEl.style.display).toBe('none');
    expect(praisedThreadEl.style.display).toBe('');

    // Le check se termine APRÈS ce premier rendu, en échec : sans D3, `showedSomething`
    // resterait bloqué sur le premier constat (la vue locale) et cette lecture n'aurait
    // jamais lieu.
    currentPublished = publishedSummary({ state: 'failure', unresolvedBlockingCount: 3 });
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(bannerTitles(doc)[0]).toContain('3'); // décompte publié adopté, pas la vue locale
    expect(control.element.getAttribute('aria-disabled')).toBe('true');
    expect(control.element.classList.contains('cct-merge-blocked')).toBe(true);
    expect(control.element.hasAttribute('title')).toBe(true);
    // La barre de puces est reconstruite, mais la SÉLECTION elle-même (§5.5, revue Codex
    // round 4) survit à un rendu répété sur la MÊME PR — jamais réinitialisée à « tous »
    // tant que le contexte de PR ne change pas.
    expect(activeFilter(doc)).toBe('praise');
    expect(renderedThreadEl.style.display).toBe('none');

    // Le check redevient vert (dernier fil résolu, nouveau commit) : le grisage se
    // retire, ainsi que l'infobulle posée ci-dessus — jamais laissée mensongère.
    currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 0 });
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(control.element.hasAttribute('aria-disabled')).toBe(false);
    expect(control.element.classList.contains('cct-merge-blocked')).toBe(false);
    expect(control.element.hasAttribute('title')).toBe(false);
  });

  it('un second changement du résumé publié pendant un rendu en vol n’écrit jamais un résultat périmé', async () => {
    // Revue adversariale (session du 2026-08-24) : `isCurrent()` ne protège que contre un
    // changement de PR, pas contre un second changement du résumé publié survenant sur la
    // MÊME PR pendant que le rendu déclenché par le premier changement est encore en vol.
    // Avant correctif, `published` était lu tout en haut de `renderPrChrome`, avant deux
    // `await` supplémentaires — le rendu pouvait donc écrire dans le DOM une valeur déjà
    // périmée au moment de l'écriture.
    const doc = document;
    const current = pr(17);
    let currentPublished: PublishedSummary | null = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    let releaseSecondRender: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseSecondRender = resolve;
    });
    let getThreadsCalls = 0;
    const adapter = makeAdapter(() => current, () => currentPublished, {
      getThreads: async () => {
        getThreadsCalls++;
        if (getThreadsCalls === 2) await gate; // bloque le rendu déclenché par le 1er changement
        return [];
      },
    });
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(bannerTitles(doc)[0]).toContain('1');

    // Premier changement : déclenche un rendu qui se bloque sur getThreads() (la porte).
    currentPublished = publishedSummary({ state: 'failure', unresolvedBlockingCount: 3 });
    doc.body.appendChild(doc.createElement('span'));
    await flush(); // laisse ce rendu démarrer et se bloquer
    expect(getThreadsCalls).toBe(2);

    // Second changement, PENDANT que ce rendu est encore en vol : coalescé (missedMutation),
    // pas un rendu concurrent. Décompte non nul de part et d'autre : ce test porte sur la
    // FRAÎCHEUR de la valeur écrite, pas sur le silence du bandeau à zéro (testé ailleurs).
    currentPublished = publishedSummary({ state: 'failure', unresolvedBlockingCount: 2 });
    doc.body.appendChild(doc.createElement('span'));
    await flush();

    // Le rendu en vol se termine : sans le correctif, il écrirait « 3 » (valeur lue tout en
    // haut de la fonction, au début de SON exécution) au lieu de « 2 » (valeur réelle au
    // moment où il écrit effectivement dans le DOM).
    releaseSecondRender!();
    await flushAll();

    expect(bannerTitles(doc)[0]).not.toContain('3'); // jamais la valeur périmée
    expect(bannerTitles(doc)[0]).toContain('2'); // la valeur réelle au moment de l'écriture
  });
});

describe('Codex #2 — retente tant que tout le contexte de la barre n’a pas été observé', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('un bouton de complétion apparu APRÈS le premier rendu reçoit quand même son grisage', async () => {
    // Cas signalé : le résumé publié est déjà dans le DOM au premier rendu, mais le
    // mergebox (§A.7) — donc le bouton de complétion — se peuple en différé. Avant ce
    // correctif, `hasSomethingToShow` valait déjà vrai grâce au seul résumé publié :
    // `showedSomething` se figeait sans jamais retenter pour le bouton.
    const doc = document;
    const current = pr(20);
    let control: SubmitControl | null = null; // absent au premier rendu
    const adapter = makeAdapter(
      () => current,
      () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 2 }), // publié dès le début
      { getCompletionControl: () => control }
    );
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1); // le bandeau, oui

    // Le bouton apparaît ensuite ; le résumé publié, lui, n'a pas changé.
    control = { element: doc.createElement('button'), kind: 'complete-pr' };
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(control.element.getAttribute('aria-disabled')).toBe('true');
    expect(control.element.classList.contains('cct-merge-blocked')).toBe(true);
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
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
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

  it('un .cct-badge imbriqué (pas enfant direct) n’est pas exclu à tort', () => {
    // decorateComment() ne pose jamais un badge autrement qu'en `afterbegin` — un
    // `.cct-badge` plus profond (citation, bloc de code d'un autre commentaire cité) est un
    // texte normal, pas notre propre badge.
    const el = document.createElement('div');
    el.innerHTML = '<blockquote><span class="cct-badge">🐛 issue</span></blockquote>issue: x';
    expect(commentBodyText(el)).toBe(el.textContent);
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
    decorateComment(bodyEl, 'issue: quelque chose ne va pas', defaultConfig(), profile);
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

describe('Codex #5 — un grisage antérieur ne survit pas au passage du mode à off (§7)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('le grisage posé pendant que le mode était actif est retiré dès que le mode passe à off', async () => {
    const doc = document;
    const current = pr(22);
    let configText = '{}'; // défauts : mode assist
    let currentPublished: PublishedSummary | null = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    const control: SubmitControl = { element: doc.createElement('button'), kind: 'complete-pr' };
    const adapter = makeAdapter(() => current, () => currentPublished, { getCompletionControl: () => control });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(control.element.getAttribute('aria-disabled')).toBe('true'); // grisé (mode assist, check en échec)

    // La configuration du dépôt bascule sur off ; le check se termine au même moment (dernier
    // fil résolu) — c'est ce second changement, visible dans la signature de reprise, qui
    // déclenche la relecture ; le passage à off lui-même n'est pas un signal de reprise (hors
    // périmètre de cette revue, indépendant du bug de la barre).
    configText = JSON.stringify({ mode: 'off' });
    currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 0 });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(control.element.hasAttribute('aria-disabled')).toBe(false);
    expect(control.element.classList.contains('cct-merge-blocked')).toBe(false);
    expect(control.element.hasAttribute('title')).toBe(false);
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
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'success', unresolvedBlockingCount: 1 }), {
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

describe('applyCompletionState — le titre n’est retiré que s’il a été posé par le §6.5', () => {
  it('ne touche jamais un title natif sur un bouton jamais grisé par l’extension', () => {
    const control: SubmitControl = { element: document.createElement('button'), kind: 'complete-pr' };
    control.element.setAttribute('title', 'Merge pull request'); // infobulle native de la plateforme
    applyCompletionState(control, published(0), 'en'); // state 'success' : jamais bloquant
    expect(control.element.getAttribute('title')).toBe('Merge pull request'); // intact
  });

  it('grise puis dégrise, en retirant le title qu’il a lui-même posé', () => {
    const control: SubmitControl = { element: document.createElement('button'), kind: 'complete-pr' };
    applyCompletionState(control, publishedSummary({ state: 'failure' }), 'en');
    expect(control.element.hasAttribute('title')).toBe(true);
    applyCompletionState(control, publishedSummary({ state: 'success' }), 'en');
    expect(control.element.hasAttribute('title')).toBe(false);
  });

  it('ne touche jamais un aria-disabled natif sur un bouton jamais grisé par l’extension (revue Codex, round 2)', () => {
    // Même défaut que le title, sur aria-disabled : rien ne garantissait qu'un
    // aria-disabled natif (branche protégée, revue requise…) survive à un dégrisage.
    const control: SubmitControl = { element: document.createElement('button'), kind: 'complete-pr' };
    control.element.setAttribute('aria-disabled', 'true'); // état natif de la plateforme
    applyCompletionState(control, published(0), 'en'); // state 'success' : jamais bloquant pour nous
    expect(control.element.getAttribute('aria-disabled')).toBe('true'); // intact
  });

  it('restaure le title NATIF après un cycle de grisage/dégrisage, ne le retire jamais (revue Codex, round 3)', () => {
    // Un title natif déjà présent (branche protégée, revue requise…) est ÉCRASÉ par notre
    // infobulle pendant le grisage : le retirer simplement au dégrisage l'aurait perdu pour
    // de bon, comme le title n'avait jamais existé.
    const control: SubmitControl = { element: document.createElement('button'), kind: 'complete-pr' };
    control.element.setAttribute('title', 'Merge pull request'); // infobulle native de la plateforme
    applyCompletionState(control, publishedSummary({ state: 'failure' }), 'en');
    expect(control.element.getAttribute('title')).not.toBe('Merge pull request'); // écrasé par la nôtre
    applyCompletionState(control, publishedSummary({ state: 'success' }), 'en');
    expect(control.element.getAttribute('title')).toBe('Merge pull request'); // restauré, pas retiré

    // Un second cycle échec→échec ne doit pas capturer NOTRE PROPRE infobulle comme si elle
    // était native : la valeur restaurée reste toujours celle de la plateforme.
    applyCompletionState(control, publishedSummary({ state: 'failure' }), 'en');
    applyCompletionState(control, publishedSummary({ state: 'failure' }), 'en');
    applyCompletionState(control, publishedSummary({ state: 'success' }), 'en');
    expect(control.element.getAttribute('title')).toBe('Merge pull request');
  });

  it('restaure l’aria-disabled NATIF après un cycle de grisage/dégrisage, ne le retire jamais (revue Codex, round 4)', () => {
    // Même défaut que le title (round 3), sur aria-disabled cette fois : un aria-disabled
    // natif PRÉEXISTANT porte la MÊME valeur ("true") que celle que nous posons nous-mêmes
    // pendant le grisage — indiscernable une fois écrit, donc capturé AVANT, comme le title.
    const control: SubmitControl = { element: document.createElement('button'), kind: 'complete-pr' };
    control.element.setAttribute('aria-disabled', 'true'); // état natif de la plateforme
    applyCompletionState(control, publishedSummary({ state: 'failure' }), 'en'); // nous grisons AUSSI
    applyCompletionState(control, publishedSummary({ state: 'success' }), 'en'); // nous dégrisons
    expect(control.element.getAttribute('aria-disabled')).toBe('true'); // toujours natif, pas retiré
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

describe('Codex round 2 #6 — cesse de sonder le bouton de complétion après la fenêtre d’hydratation (§9.4)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('un bouton jamais présent ne fait grossir SelectorLog.failures qu’à l’intérieur de la fenêtre, jamais après', async () => {
    // getCompletionControl() journalise une dégradation de sélecteur à chaque appel où il
    // ne trouve rien (§9.4) — un bouton absent est la norme sur une PR fermée ou sans
    // droit de fusion, pas une dégradation. L'inclure dans une signature recalculée à
    // chaque mutation, pour toute la durée de vie de l'onglet, ferait grossir ce journal
    // (et la télémétrie opt-in) sans borne.
    const doc = document;
    const current = pr(25);
    let completionCalls = 0;
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
      getCompletionControl: () => {
        completionCalls++;
        return null; // jamais de bouton sur cette PR
      },
    });
    const resolver = new ClientConfigResolver(async () => null);
    const clock = makeClock();

    observe(adapter, resolver, doc, clock.now);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1); // affichée dès le premier rendu
    const callsWithinWindow = completionCalls;
    expect(callsWithinWindow).toBeGreaterThan(0);

    // Hors fenêtre : au plus UNE relecture de transition (la mutation suivante voit encore
    // l'ancienne signature, sondée une dernière fois) — jamais une par mutation ensuite.
    clock.advance(RENDER_RETRY_WINDOW_MS + 1000);
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();
    expect(completionCalls).toBeLessThanOrEqual(callsWithinWindow + 1);

    const settled = completionCalls;
    for (let i = 0; i < 10; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll();
    }
    expect(completionCalls).toBe(settled); // vraiment plus rien, quel que soit le nombre de mutations
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
    const commentEl = doc.createElement('div');
    doc.body.appendChild(commentEl); // clearBadges() interroge le document entier, pas un élément détaché
    let currentPublished: PublishedSummary | null = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    const adapter = makeAdapter(() => current, () => currentPublished, {
      getRenderedComments: () => [{ element: commentEl, bodyText: 'issue: quelque chose ne va pas' }],
    });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);

    observe(adapter, resolver, doc);
    await flushAll();
    expect(commentEl.querySelector('.cct-badge')).not.toBeNull();

    configText = JSON.stringify({ mode: 'off' });
    currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 0 });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(commentEl.querySelector('.cct-badge')).toBeNull();
  });
});

describe('Codex round 4 — le filtre par label survit à un rendu répété sur la MÊME PR (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reste actif quand le résumé publié change, repart à zéro sur une nouvelle PR', async () => {
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
    let currentPublished: PublishedSummary | null = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    const adapter = makeAdapter(() => current, () => currentPublished, {
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

    // Rendu répété sur la MÊME PR (résumé publié changé, §5.5, D3) : avant ce correctif, la
    // barre reconstruite repartait toujours sur « tous », perdant la sélection.
    currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 0 });
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
    let currentPublished: PublishedSummary | null = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    const adapter = makeAdapter(() => current, () => currentPublished, {
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

    // La configuration du dépôt désactive 'praise' ; le compteur bloquant change aussi
    // (dernier fil résolu ailleurs) pour déclencher la relecture.
    configText = JSON.stringify({ labels: [{ id: 'praise', enabled: false }] });
    currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 0 });
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

    const adapter = makeAdapter(() => pr(40), () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 2 }), {
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
    const adapter = makeAdapter(() => pr(41), () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 2 }), {
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
    const adapter = makeAdapter(() => pr(42), () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
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
    const adapter = makeAdapter(() => pr(43), () => publishedSummary({ state: 'success', unresolvedBlockingCount: 0 }), {
      getThreads: async () => [thread],
      getRenderedThreadElements: () => [{ id: 't1', element: first }],
    });
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0); // une PR saine ne se décore pas
    expect(doc.querySelector('.cct-thread-filter')).not.toBeNull();
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

    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
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
    // changer au résumé publié ni aux fils.
    const doc = document;
    const current = pr(51);
    const header = doc.createElement('div');
    doc.body.appendChild(header);
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 2 }), {
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
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
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
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }));
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
    // bandeau, badges et grisage dans une page dont cette observation ne sait plus rien.
    const doc = document;
    const current = pr(60);
    let releaseThreads: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseThreads = resolve;
    });
    const control: SubmitControl = { element: doc.createElement('button'), kind: 'complete-pr' };
    const commentEl = doc.createElement('div');
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 2 }), {
      getThreads: async () => {
        await gate; // le rendu se bloque ici, avant toute écriture
        return [];
      },
      getCompletionControl: () => control,
      getRenderedComments: () => [{ element: commentEl, bodyText: 'issue: x' }],
    });

    const dispose = observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flush(); // laisse le rendu démarrer et se bloquer
    dispose();
    releaseThreads!();
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);
    expect(commentEl.querySelector('.cct-badge')).toBeNull(); // ni badge
    expect(control.element.hasAttribute('aria-disabled')).toBe(false); // ni grisage
  });

  it('un bandeau replié par l’utilisateur le reste quand un fil est édité', async () => {
    // Le bandeau est reconstruit à chaque rendu, et depuis que le texte des fils est
    // surveillé, une correction en place en déclenche un : réappliquer le défaut rouvrirait
    // ce que l'utilisateur vient de replier.
    const doc = document;
    const current = pr(61);
    const threadEl = doc.createElement('div');
    threadEl.textContent = 'issue: le retry ne borne pas le backoff';
    doc.body.appendChild(threadEl);
    let body = 'issue: le retry ne borne pas le backoff';
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
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
    expect(banner.open).toBe(true); // le merge est bloqué : déplié par défaut
    banner.open = false; // l'utilisateur le replie
    banner.dispatchEvent(new Event('toggle'));

    body = 'issue: le backoff doit être plafonné';
    threadEl.textContent = body; // édition en place → nouveau rendu
    await flushAll();

    const rebuilt = doc.querySelector('.cct-banner') as HTMLDetailsElement;
    expect(rebuilt.querySelector('.cct-banner-subject')?.textContent).toBe('le backoff doit être plafonné');
    expect(rebuilt.open).toBe(false); // toujours replié : son choix a survécu
  });

  it('mais le défaut revient quand le caractère bloquant change', async () => {
    // Son choix portait sur une situation qui n'existe plus : un merge qui se met à bloquer
    // n'est plus celle sur laquelle il s'était prononcé.
    const doc = document;
    const current = pr(62);
    let currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 2, mode: 'warn' });
    const adapter = makeAdapter(() => current, () => currentPublished);
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    const banner = doc.querySelector('.cct-banner') as HTMLDetailsElement;
    expect(banner.open).toBe(false); // informatif (warn) : replié par défaut
    banner.open = true; // l'utilisateur le déplie
    banner.dispatchEvent(new Event('toggle'));

    currentPublished = publishedSummary({ state: 'failure', unresolvedBlockingCount: 2, mode: 'enforce' });
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect((doc.querySelector('.cct-banner') as HTMLDetailsElement).open).toBe(true); // le défaut reprend
  });
});

describe('Codex round 4 — la signature de reprise sonde le COMPTE de commentaires, jamais leur corps (§9.4)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('utilise getRenderedCommentCount() quand l’adaptateur l’expose, jamais getRenderedComments()', async () => {
    const doc = document;
    const current = pr(29);
    let commentsCalls = 0;
    let countCalls = 0;
    const commentEl = doc.createElement('div');
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'success', unresolvedBlockingCount: 0 }), {
      getRenderedComments: () => {
        commentsCalls++; // ne DOIT jamais être appelé ici : bodyText coûte un clone par commentaire
        return [{ element: commentEl, bodyText: 'issue: x' }];
      },
    }) as PlatformAdapter & { currentPr(): PrRef | null; getRenderedCommentCount?: () => number };
    adapter.getRenderedCommentCount = () => {
      countCalls++;
      return 1;
    };
    const resolver = new ClientConfigResolver(async () => null);

    observe(adapter, resolver, doc);
    await flushAll();
    for (let i = 0; i < 5; i++) {
      doc.body.appendChild(doc.createElement('span'));
      await flushAll();
    }

    expect(countCalls).toBeGreaterThan(0);
    // getRenderedComments() n'est appelée QUE par le rendu réel (décoration des badges,
    // renderPrChrome), jamais par la signature de reprise (chromeSignatureOf) — ici la PR
    // ne change jamais de signature après le premier rendu, donc aucun second rendu réel.
    expect(commentsCalls).toBe(1);
  });
});
