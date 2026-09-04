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
import { defaultConfig, fingerprint, type PrRef, type PublishedSummary, type ThreadInfo } from '@cct/core';
import { ClientConfigResolver, type ResolvedClientConfig } from '../src/config-resolver.js';
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
// CONFIG_POLL_INTERVAL_MS n'est pas importée : les tests du sondage périodique lui
// substituent une valeur courte (voir `configPollIntervalMs`, dernier paramètre de
// `observePrChromeNavigation`) pour ne pas attendre les cinq minutes de production.

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

  it('publishedSignatureOf réagit aussi à configFingerprint et activatedAt — non affichés, mais lus par decideGuard() (revue Codex, PR #39)', () => {
    // Ni l'un ni l'autre ne change ce que le BANDEAU affiche, mais tous deux entrent dans
    // `decideGuard()` (l'écart d'empreinte du §8.1.3 règle 2, le périmètre d'activation du
    // §6.2.3) dont dépend le blocage des éditeurs déjà ouverts. Sans eux dans cette
    // signature, un check serveur qui fait avancer SEULEMENT `configFingerprint` — le
    // scénario même du §8.1.3 règle 2, l'extension ayant déjà adopté la config B avant que
    // le serveur ne la publie — laisse `chromeSig` inchangé si state/count/mode/coreVersion
    // ne bougent pas par ailleurs : `run()` ne re-rend jamais, `reconcile()` n'est donc
    // jamais rappelée, et l'écart d'empreinte qui aurait dû se résorber reste vrai
    // indéfiniment.
    const base = publishedSummary({
      state: 'success',
      unresolvedBlockingCount: 1,
      mode: 'assist',
      coreVersion: '1.0.0',
      configFingerprint: 'aaaa1111',
      activatedAt: '2020-01-01T00:00:00Z',
    });
    const differentFingerprint = { ...base, configFingerprint: 'bbbb2222' };
    const differentActivation = { ...base, activatedAt: '2021-01-01T00:00:00Z' };
    expect(publishedSignatureOf(makeAdapter(() => pr(1), () => differentFingerprint))).not.toBe(
      publishedSignatureOf(makeAdapter(() => pr(1), () => base))
    );
    expect(publishedSignatureOf(makeAdapter(() => pr(1), () => differentActivation))).not.toBe(
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
    const adapter: PlatformAdapter & { currentPr(): PrRef | null } = {
      matches: () => true,
      platformProfile: () => ({ id: 'github', suggestionInfoString: null }),
      getRepoConfig: async (requestedPr) => ({
        status: 'found',
        text: JSON.stringify({ mode: requestedPr.scope.join('/') === 'acme/demo' ? 'assist' : 'enforce' }),
      }),
      getOrgConfig: async () => ({ status: 'absent' }),
      observeEditors: () => ({ dispose: () => {} }),
      getSubmitControls: () => [],
      readValue: () => '',
      writeValue: () => {},
      // Rien à montrer (pas de résumé publié, aucun fil) : `observePrChromeNavigation` reste
      // dans sa fenêtre de rattrapage et retente à CHAQUE mutation tant qu'elle n'est pas
      // écoulée — c'est ce second essai, sur la MÊME PR, que le gate bloque.
      getThreads: async () => {
        getThreadsCalls++;
        if (getThreadsCalls === 2) await gate;
        return [];
      },
      getCompletionControl: () => null,
      getCurrentUser: async () => ({ id: 'u', login: 'u', isServiceAccount: false }),
      readPublishedResult: () => null,
      currentPr: () => current,
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

  it('commentBodyText exclut TOUS les badges — label ET chaque décoration, pas seulement le premier', () => {
    // decorateComment() pose désormais un badge de label suivi d'un badge par décoration
    // (§3.3, §5.5) : plusieurs enfants directs .cct-badge, pas un seul. Un querySelector()
    // simple n'en retirerait que le premier, laissant « blocking security » mêlé au corps
    // relu au tour suivant.
    const el = document.createElement('div');
    el.textContent = 'issue (blocking, security): fuite mémoire';
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    decorateComment(el, 'issue (blocking, security): fuite mémoire', defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge').length).toBe(3); // label + 2 décorations
    expect(commentBodyText(el)).toBe('issue (blocking, security): fuite mémoire');
  });

  it('decorateComment() : un badge par décoration, stylé selon `forces`/`known` (§3.3, §5.5)', () => {
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const el = document.createElement('div');
    // blocking : porteuse connue, bloquante. security : libre (allowFree, absente de
    // decorations.known par défaut). if-minor : porteuse connue, même `forces` que non-blocking.
    el.textContent = 'issue (blocking, security, if-minor): x';
    decorateComment(el, 'issue (blocking, security, if-minor): x', defaultConfig(), profile, 'en');

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
    decorateComment(el, 'issue (foo, blocking): x', cfg, profile, 'en');

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
    decorateComment(el, body, defaultConfig(), profile, 'en');
    const labelBefore = el.querySelector(':scope > .cct-badge-label');
    const decoBefore = [...el.querySelectorAll(':scope > .cct-badge-deco')];

    // Un objet de configuration FRAIS mais structurellement identique — la comparaison doit
    // porter sur ce que analyze() en tire, pas sur l'identité de l'objet JS.
    decorateComment(el, body, defaultConfig(), profile, 'en');

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
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const createElementSpy = vi.spyOn(document, 'createElement');
    decorateComment(el, body, defaultConfig(), profile, 'en');
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
    decorateComment(el, body, before, profile, 'en');
    const labelBefore = el.querySelector(':scope > .cct-badge-label')!;
    const securityBefore = [...el.querySelectorAll(':scope > .cct-badge-deco')][1]!;
    expect(securityBefore.className).toContain('cct-badge-deco-custom'); // encore libre

    const after = defaultConfig();
    after.decorations.known.push({ id: 'security', forces: 'blocking' });
    after.labels.find((l) => l.id === 'issue')!.color = '#123456';
    decorateComment(el, body, after, profile, 'en');

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
    decorateComment(el, body, defaultConfig(), profile, 'en');

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
    decorateComment(el, body, defaultConfig(), profile, 'en');

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
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const decoBadges = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoBadges).toHaveLength(13); // les 12 descriptives + blocking — aucun dépassement
    expect(decoBadges[12]!.textContent).toBe('blocking');
    expect(decoBadges[12]!.className).toContain('cct-badge-deco-blocking');

    // Avec des descriptives EN EXCÈS en plus de la porteuse, seules les descriptives débordent.
    const manyIds = Array.from({ length: 15 }, (_, i) => `d${i + 1}`);
    const body2 = `issue (${manyIds.join(', ')}, blocking): x`;
    const el2 = document.createElement('div');
    el2.textContent = body2;
    decorateComment(el2, body2, defaultConfig(), profile, 'en');

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
    decorateComment(elFr, body, defaultConfig(), profile, 'fr');
    const overflowFr = [...elFr.querySelectorAll(':scope > .cct-badge-deco')][12] as HTMLElement;
    expect(overflowFr.title).toBe('3 décoration(s) supplémentaire(s), non affichée(s)');

    const elEn = document.createElement('div');
    elEn.textContent = body;
    decorateComment(elEn, body, defaultConfig(), profile, 'en');
    const overflowEn = [...elEn.querySelectorAll(':scope > .cct-badge-deco')][12] as HTMLElement;
    expect(overflowEn.title).toBe('3 more decoration(s), not shown');

    // Un changement de langue SEUL, même config et même corps, doit rafraîchir l'infobulle —
    // la langue résolue entre dans la signature au même titre que le style ou la couleur.
    decorateComment(elFr, body, defaultConfig(), profile, 'en');
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
    decorateComment(el, body, defaultConfig(), profile, 'en');
    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(3); // label + 2 décorations

    // Simule une réhydratation qui emporte le badge « security », en laissant le label intact.
    [...el.querySelectorAll(':scope > .cct-badge-deco')][1]!.remove();
    expect(el.querySelectorAll(':scope > .cct-badge-deco')).toHaveLength(1);

    // Même corps, même configuration — seul le DOM a divergé de ce que ce rendu produirait.
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const decoAfter = [...el.querySelectorAll(':scope > .cct-badge-deco')];
    expect(decoAfter.map((b) => b.textContent)).toEqual(['blocking', 'security']); // réparé
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
    decorateComment(bodyEl, 'issue: quelque chose ne va pas', defaultConfig(), profile, 'en');
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

describe('§5.5 — révocation complète et pliage remis à neuf (revue Codex round 4, PR #26)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('un bandeau replié puis DISPARU repart sur son défaut quand un fil bloquant revient', async () => {
    // Le choix de l'utilisateur portait sur une situation qui n'existe plus : entre-temps le
    // décompte est retombé à zéro et le bandeau s'est effacé. Un nouveau fil bloquant est une
    // nouvelle, et mérite le défaut déplié — sans quoi il arriverait replié, inaperçu.
    const doc = document;
    const current = pr(70);
    let currentPublished = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    const adapter = makeAdapter(() => current, () => currentPublished);
    observe(adapter, new ClientConfigResolver(async () => null), doc);
    await flushAll();

    const banner = doc.querySelector('.cct-banner') as HTMLDetailsElement;
    expect(banner.open).toBe(true);
    banner.open = false; // l'utilisateur le replie
    banner.dispatchEvent(new Event('toggle'));

    // Tout est résolu : plus de bandeau du tout.
    currentPublished = publishedSummary({ state: 'success', unresolvedBlockingCount: 0 });
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);

    // Un nouveau fil bloquant apparaît sur la MÊME PR.
    currentPublished = publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 });
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect((doc.querySelector('.cct-banner') as HTMLDetailsElement).open).toBe(true);
  });

  it('la révocation de bootstrap() rend AUSSI l’observation des éditeurs', async () => {
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

    const dispose = await bootstrap(doc);
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

describe('Codex #38 — sondage périodique de la configuration effective sur un onglet inerte (§8.1.2)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('une modification de configuration est adoptée dans l’intervalle de sondage, SANS aucune mutation DOM', async () => {
    const doc = document;
    const current = pr(30);
    const control: SubmitControl = { element: doc.createElement('button'), kind: 'complete-pr' };
    let configText = '{}'; // défauts : mode assist
    const adapter = makeAdapter(
      () => current,
      () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }),
      { getCompletionControl: () => control }
    );
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    // Horloge du RÉSOLVEUR, indépendante de celle passée à observePrChromeNavigation (comme
    // au test Codex #5 ci-dessus) : c'est elle qui gouverne l'expiration du cache de
    // configuration (§8.1.2), pas la fenêtre de rattrapage de la barre.
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);
    const POLL_MS = 30;

    observe(adapter, resolver, doc, undefined, undefined, POLL_MS);
    await flushAll();
    expect(control.element.getAttribute('aria-disabled')).toBe('true'); // grisé (mode assist, check en échec)

    // La configuration du dépôt bascule sur `off`, et le cache expire — mais AUCUNE mutation
    // DOM n'est produite ici : la page reste par ailleurs parfaitement inerte (pas de
    // nouveau commentaire, pas de navigation, pas de changement d'état de fil). Seul le
    // sondage périodique, indépendant du MutationObserver, peut faire remarquer ce
    // changement à cette observation.
    configText = JSON.stringify({ mode: 'off' });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)

    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));
    await flushAll();

    expect(control.element.hasAttribute('aria-disabled')).toBe(false);
    expect(control.element.classList.contains('cct-merge-blocked')).toBe(false);
  });

  it('des réveils périodiques répétés sans changement de configuration ne produisent ni rendu ni écriture DOM', async () => {
    const doc = document;
    const current = pr(31);
    let getThreadsCalls = 0;
    // Décompte NON nul : bannerHasContent() (ui/banner.ts) tait le bandeau sur un décompte
    // à zéro — ce n'est pas ce que ce test couvre (un rendu qui n'a rien à montrer), qui
    // porte sur un rendu déjà affiché qu'aucun réveil sans changement ne doit reconstruire.
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }), {
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

  it('un champ hors du domaine du verdict (langue) change le rendu sans changer le fingerprint — sondé quand même', async () => {
    // Prémisse vérifiée séparément, sans passer par le résolveur ni le DOM : `fingerprint()`
    // (core/, §9.2.2) exclut `language` de son domaine par construction — deux configurations
    // qui ne diffèrent QUE sur cette clé produisent la même empreinte.
    const enConfig = defaultConfig();
    enConfig.language = 'en';
    const frConfig = { ...enConfig, language: 'fr' };
    expect(fingerprint(enConfig)).toBe(fingerprint(frConfig));

    const doc = document;
    const current = pr(32);
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }));
    let configText = JSON.stringify({ language: 'en' });
    adapter.getRepoConfig = async () => ({ status: 'found', text: configText });
    let resolverNow = 0;
    const resolver = new ClientConfigResolver(async () => null, () => resolverNow);
    const POLL_MS = 30;

    observe(adapter, resolver, doc, undefined, undefined, POLL_MS);
    await flushAll();
    // « judged in {mode} by core/ {coreVersion} » (en) — voir ui/strings.ts.
    expect(doc.querySelector('.cct-banner-judged')?.textContent).toContain('judged');

    // Seule la langue change — le fingerprint(), lui, reste identique (prémisse ci-dessus) —
    // et AUCUNE mutation DOM n'a lieu : seul le sondage périodique peut faire remarquer ce
    // changement à un onglet par ailleurs inerte.
    configText = JSON.stringify({ language: 'fr' });
    resolverNow += 3601 * 1000; // dépasse le TTL du cache de configuration (§8.1.2)

    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));
    await flushAll();

    // « jugée en {mode} par core/ {coreVersion} » (fr). Comparer le seul `fingerprint()`
    // dans `pollConfig` (avant correctif) aurait laissé ce texte en anglais indéfiniment :
    // rien dans le domaine du verdict n'a changé.
    expect(doc.querySelector('.cct-banner-judged')?.textContent).toContain('jugée');
  });

  it('un label retiré par un changement de configuration efface le badge déjà posé, sans aucune mutation DOM', async () => {
    const doc = document;
    const current = pr(33);
    const commentEl = doc.createElement('div');
    doc.body.appendChild(commentEl); // decorateComment()/clearBadges() interrogent le document
    let configText = '{}'; // défauts : label "issue" actif
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'success', unresolvedBlockingCount: 0 }), {
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
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }));
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
    const adapter = makeAdapter(() => current, () => publishedSummary({ state: 'failure', unresolvedBlockingCount: 1 }));
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
    // Résumé publié présent dès le départ : ce rendu a donc « montré quelque chose » quoi
    // qu'il arrive, et seule la signature de NOTRE sortie peut encore remarquer la mise à
    // jour du commentaire.
    const check = document.createElement('div');
    check.setAttribute('data-testid', 'check-run-item');
    check.textContent = summaryLine(0);
    document.body.appendChild(check);
    const adapter = new GithubClientAdapter({ documentRef: document, fetchImpl });

    observe(adapter, new ClientConfigResolver(async () => null), document);
    await flushAll();
    expect(body.querySelector('.cct-badge')).not.toBeNull();
    expect(body.querySelector('.cct-hidden-prefix')).not.toBeNull();

    // L'auteur met son commentaire à jour : GitHub réécrit le corps RENDU, ce qui emporte
    // nos badges et notre masquage. Rien d'autre ne bouge — même nombre de commentaires,
    // même résumé publié, toujours aucun fil de revue : avant correctif, ni
    // `chromeSignatureOf` ni `ownOutputSignatureOf` ne changeaient, `run()` sortait, et ce
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
    // Composant B non déployé (§10) : aucune ligne cc/1, aucun fil de revue — les badges
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

    // Une SECONDE mise à jour, et ce n'est pas une redite : passé la fenêtre, la sonde du
    // bouton de complétion se fige (`chromeSignatureOf`, `probeCompletionControl`) — cette
    // transition-là, à elle seule, provoque un rendu au tout premier réveil qui suit
    // l'expiration, quelle que soit la cause. C'est ce deuxième tour, où plus rien ne bouge
    // que le commentaire lui-même, qui vérifie que la mise à jour EST la cause du rendu.
    body.innerHTML = '<p>nitpick (test): un sujet corrigé deux fois</p><p>une discussion</p>';
    await flushAll();

    expect(body.querySelector('.cct-badge')).not.toBeNull();
    expect(body.querySelector('.cct-hidden-prefix')?.textContent).toBe('nitpick (test): ');
    expect(body.querySelector('p')?.textContent).toContain('un sujet corrigé deux fois');
  });

  it('le masquage du préfixe SEUL défait — texte et badges intacts — est reposé (revue Reefact, PR #42)', async () => {
    onPullRequest();
    const body = conversationComment('un sujet de test');
    const check = document.createElement('div');
    check.setAttribute('data-testid', 'check-run-item');
    check.textContent = summaryLine(0);
    document.body.appendChild(check);
    const adapter = new GithubClientAdapter({ documentRef: document, fetchImpl });

    observe(adapter, new ClientConfigResolver(async () => null), document);
    await flushAll();
    expect(body.querySelector('.cct-hidden-prefix')).not.toBeNull();
    const textBefore = body.textContent;

    // Réhydratation qui reconstruit le SEUL sous-arbre de texte natif, sans toucher aux
    // badges : le `<p>` retrouve son texte brut, donc plus de `.cct-hidden-prefix`, et les
    // badges restent en enfants directs du corps, à côté. C'est le cas que `decorateComment`
    // sait déjà réparer (entretien inconditionnel du masquage, revue Reefact PR #40) mais
    // que rien ne lui donnait l'occasion de voir.
    body.querySelector('p')!.innerHTML = 'nitpick (test): un sujet de test';
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
      '<div class="markdown-content"><p>issue: un sujet Azure</p></div>';

    const github = new GithubClientAdapter({ documentRef: document, fetchImpl });
    expect(github.getRenderedCommentElements()).toEqual(github.getRenderedComments().map((c) => c.element));
    expect(github.getRenderedCommentElements()).toHaveLength(github.getRenderedCommentCount());
    expect(github.getRenderedCommentElements().length).toBeGreaterThan(0);

    const azdo = new AzdoClientAdapter({ documentRef: document });
    expect(azdo.getRenderedCommentElements()).toEqual(azdo.getRenderedComments().map((c) => c.element));
    expect(azdo.getRenderedCommentElements()).toHaveLength(azdo.getRenderedCommentCount());
    expect(azdo.getRenderedCommentElements().length).toBeGreaterThan(0);
  });
});
