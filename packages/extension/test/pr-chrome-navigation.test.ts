// @vitest-environment happy-dom
// Non-régression : la barre (bandeau, §5.5) doit se ré-afficher après une navigation SPA
// vers une PR différente — signalé par un utilisateur obligé de recharger la page pour la
// voir apparaître. Avant ce correctif, `renderPrChrome` n'était invoqué qu'une seule fois,
// au chargement du script de contenu (`bootstrap()`) ; une navigation Turbo/React vers une
// autre PR (ou vers la première PR, depuis une page où aucune PR n'était encore visible)
// ne relance jamais le script, donc le bandeau restait absent ou périmé jusqu'à un
// rechargement complet.

import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '@cct/adapter-shared';
import type { PrRef, PublishedSummary } from '@cct/core';
import { ClientConfigResolver } from '../src/config-resolver.js';
import { observePrChromeNavigation, prKeyFor } from '../src/content-internal.js';

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

/** Adaptateur factice : `currentPr()` — non porté par `PlatformAdapter`, lu par cast comme
 * dans content-internal.ts — reflète la PR « affichée » par la page à un instant donné, au
 * gré des mutations simulées ci-dessous. */
function makeAdapter(getCurrent: () => PrRef | null): PlatformAdapter & { currentPr(): PrRef | null } {
  return {
    matches: () => true,
    platformProfile: () => ({ id: 'github', suggestionInfoString: null, slashPrefixes: [] }),
    getRepoConfig: async () => ({ status: 'absent' }),
    getOrgConfig: async () => ({ status: 'absent' }),
    observeEditors: () => ({ dispose: () => {} }),
    getSubmitControls: () => [],
    readValue: () => '',
    writeValue: () => {},
    getThreads: async () => [],
    getCompletionControl: () => null,
    getCurrentUser: async () => ({ id: 'u', login: 'u', isServiceAccount: false }),
    readPublishedResult: () => {
      const current = getCurrent();
      return current ? published(current.number) : null;
    },
    currentPr: getCurrent,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushAll(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await flush();
}

function bannerTitles(doc: Document): string[] {
  return [...doc.querySelectorAll('.cct-banner strong')].map((el) => el.textContent ?? '');
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
    const adapter = makeAdapter(() => current);
    const resolver = new ClientConfigResolver(async () => null);

    observePrChromeNavigation(adapter, resolver, doc);
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);
  });

  it('navigation vers une PR différente : le bandeau se ré-affiche sans rechargement, sans doublon', async () => {
    const doc = document;
    let current: PrRef | null = pr(1);
    const adapter = makeAdapter(() => current);
    const resolver = new ClientConfigResolver(async () => null);

    observePrChromeNavigation(adapter, resolver, doc);
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
    const adapter = makeAdapter(() => current);
    const resolver = new ClientConfigResolver(async () => null);

    observePrChromeNavigation(adapter, resolver, doc);
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
    const adapter = makeAdapter(() => current);
    const resolver = new ClientConfigResolver(async () => null);

    observePrChromeNavigation(adapter, resolver, doc);
    await flushAll();
    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(1);

    current = null;
    doc.body.appendChild(doc.createElement('span'));
    await flushAll();

    expect(doc.querySelectorAll('.cct-banner')).toHaveLength(0);
  });
});
