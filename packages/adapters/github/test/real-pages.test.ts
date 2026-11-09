// @vitest-environment happy-dom
// L'ADAPTATEUR GITHUB SUR DE VRAIES PAGES (§4.1, §4.3, §5.4, §9.2.3, §9.4).
//
// Les autres tests de ce paquet bâtissent leur DOM à la main, à partir de relevés consignés :
// ils disent ce que l'adaptateur fait d'une structure qu'on CROIT être celle de GitHub. Ceux-ci
// chargent des pages capturées sur github.com le 2026-10-28 par l'utilisateur, extension
// désactivée (DevTools → Elements → `<html>` → Copy outerHTML), sur des PR du dépôt
// `Reefact/just-dummies`. Seuls les jetons de session y ont été remplacés par `REDACTED`.
//
// Leur premier passage a montré ce qu'aucun DOM fait main ne pouvait montrer : sur la vue des
// fichiers modifiés, les candidats en `-module__` ne matchaient plus rien (selectors.ts, « Les
// classes de modules CSS ont perdu leur préfixe »). L'adaptateur n'y trouvait aucun bouton
// d'envoi — sous `enforce`, rien n'y était intercepté (§5.4) —, prenait l'édition d'un
// commentaire pour une composition, et le corps d'une revue pour un commentaire de ligne.
//
// Un DOM statique ne dit pas tout, et la limite doit être écrite. Le `value` d'un `<textarea>`
// n'est pas dans l'outerHTML, ni rien de ce que React tient en mémoire ; aucune feuille de
// style n'est chargée, donc aucune géométrie. Ces tests jugent la STRUCTURE — ce que les
// chaînes de sélecteurs trouvent —, et rien d'autre. Que happy-dom réponde comme un vrai
// navigateur sur ces chaînes a été vérifié une fois, candidat par candidat, contre Chromium
// sur les mêmes pages : mêmes comptes partout.

import { beforeAll, describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '../src/index.js';
import { editorOf, load, submitLabels, T, type LoadedPage } from './helpers/real-pages.js';

describe('§4.1, §5.4 — Files changed : commentaire sur une ligne (capture 04)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('04-files-commentaire-ligne.html', '/Reefact/just-dummies/pull/331/changes');
  }, T);

  it('classe le champ en racine de fil, qui peut porter un état bloquant', () => {
    expect(page.editors).toHaveLength(1);
    expect(page.editors[0]!.context).toMatchObject({ zone: 'thread-root', action: 'compose', canCarryBlockingState: true });
  });

  it("intercepte les deux boutons qui PUBLIENT, jamais celui qui annule", () => {
    expect(submitLabels(page, page.editors[0]!)).toEqual(['Comment', 'Start a review']);
  });
});

describe('§4.1, §5.4, §5.5 — Files changed : réponse dans un fil (capture 05)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('05-files-reponse-fil-ligne.html', '/Reefact/just-dummies/pull/331/changes');
  }, T);

  it('classe la réponse en zone reply, rattachée au permalien de la racine du fil', () => {
    expect(page.editors).toHaveLength(1);
    expect(page.editors[0]!.context).toMatchObject({
      zone: 'reply',
      action: 'compose',
      threadId: 'r4398202547',
      canCarryBlockingState: false,
    });
  });

  it("intercepte « Start a review » et « Reply », jamais « Cancel »", () => {
    expect(submitLabels(page, page.editors[0]!)).toEqual(['Start a review', 'Reply']);
  });

  it('lit le corps, l\'auteur et le permalien de chaque fil — sans rien journaliser', async () => {
    const threads = await page.adapter.getThreads();
    const first = threads.find((t) => t.root.permalink.endsWith('#r4397911246'));
    expect(first?.root.author.login).toBe('Reefact');
    expect(first?.root.body.startsWith('praise (test): Strengthening the two tes')).toBe(true);
    expect(first?.resolution).toBe('unknown');
    expect(threads.find((t) => t.root.permalink.endsWith('#r4398202547'))?.resolution).toBe('resolved');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('comment-body');
  });

  it('rend les corps des fils pour les badges (§5.5)', () => {
    const subjects = page.adapter.getRenderedComments().map((c) => c.bodyText.trim().split('\n')[0]);
    expect(subjects.some((s) => s?.startsWith('praise (test):'))).toBe(true);
  });
});

describe('§4.3 — Files changed : modification d\'une réponse (capture 06)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('06-files-modification-commentaire.html', '/Reefact/just-dummies/pull/331/changes');
  }, T);

  it('reconnaît une ÉDITION, avec l\'identifiant du commentaire et celui du fil', () => {
    expect(page.editors).toHaveLength(1);
    expect(page.editors[0]!.context).toMatchObject({
      zone: 'reply',
      action: 'edit',
      commentId: 'r4398354759',
      threadId: 'r4398202547',
      canCarryBlockingState: false,
    });
  });

  it('intercepte « Update », jamais « Cancel »', () => {
    expect(submitLabels(page, page.editors[0]!)).toEqual(['Update']);
  });
});

describe('§4.1, §5.4 — Files changed : panneau de revue (capture 07)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('07-review-changes.html', '/Reefact/just-dummies/pull/331/changes');
  }, T);

  it('classe le corps de revue en zone review-body, qui ne porte pas d\'état bloquant', () => {
    expect(page.editors).toHaveLength(1);
    expect(page.editors[0]!.context).toMatchObject({ zone: 'review-body', action: 'compose', canCarryBlockingState: false });
  });

  it('intercepte « Submit review », jamais « Cancel »', () => {
    const controls = page.adapter.getSubmitControls(page.editors[0]!);
    expect(controls).toHaveLength(1);
    expect(controls[0]!.element.textContent).toMatch(/^Submit review/);
  });
});

describe('§6.2.3 — la date de création de la PR, sur chaque capture (#84)', () => {
  // La première date de la page n'est PAS la création : l'en-tête d'une PR fusionnée porte la
  // date de FUSION, et la même PR #331 se lisait 07:18 ou 09:17 selon la page.
  const CASES: [string, string, string][] = [
    ['01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331', '2026-10-28T07:18:01Z'], // CLASSIQUE
    ['02-conversation-reponse-fil.html', '/Reefact/just-dummies/pull/331', '2026-10-28T07:18:01Z'], // CLASSIQUE
    ['03-conversation-pr-fusionnee-commentaires-prefixes.html', '/Reefact/just-dummies/pull/294', '2026-10-27T13:28:00Z'], // CLASSIQUE
    ['03-conversation-commentaires-prefixes-pr-ouverte.html', '/Reefact/just-dummies/pull/548', '2026-11-09T12:07:12Z'], // CLASSIQUE
    ['04-files-commentaire-ligne.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    ['04-files-commentaire-ligne-pr-ouverte.html', '/Reefact/just-dummies/pull/548/changes', '2026-11-09T12:07:12.000Z'],
    ['05-files-reponse-fil-ligne.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    ['06-conversation-modification-commentaire.html', '/Reefact/just-dummies/pull/292', '2026-10-27T12:15:37Z'], // CLASSIQUE
    ['06-files-modification-commentaire.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    ['07-review-changes.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    // L'Overview ne porte pas la description en `[id^="pullrequest-"]` : la date vient des données
    // embarquées, qui désignent bien la PR de l'URL (création de 547 : 2026-11-07T20:22:48Z,
    // lue par l'API publique de GitHub le 2026-11-09 pour recouper).
    ['03-overview-commentaires-prefixes.html', '/Reefact/just-dummies/pull/548', '2026-11-09T12:07:12.000Z'],
    ['08-overview-pr-fusionnee.html', '/Reefact/just-dummies/pull/547', '2026-11-07T20:22:48.000Z'],
  ];

  it.each(CASES)('%s : la date de la description, ou à défaut celle des données embarquées', (file, path, expected) => {
    const page = load(file, path);
    expect(page.adapter.currentPr()?.createdAt).toBe(expected);
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('pr-created-at');
  }, T);

  it("ignore des données embarquées qui décrivent une AUTRE PR : date inconnue, et journalisée", () => {
    // La capture 04 est la #331 ; chargée à l'adresse d'une autre PR, ses données ne la décrivent
    // plus. Une date inconnue fait renoncer au blocage (`resolveInScope`) — jamais une date fausse.
    const page = load('04-files-commentaire-ligne.html', '/Reefact/just-dummies/pull/999/changes');
    expect(page.adapter.currentPr()?.createdAt).toBe('');
    expect(page.adapter.log.failures.map((f) => f.chain)).toContain('pr-created-at');
  }, T);

  it("ignore des données embarquées d'un AUTRE dépôt, même au même numéro de PR (revue, PR #86)", () => {
    const page = load('04-files-commentaire-ligne.html', '/acme/other-repo/pull/331/changes');
    expect(page.adapter.currentPr()?.createdAt).toBe('');
    expect(page.adapter.log.failures.map((f) => f.chain)).toContain('pr-created-at');
  }, T);

  it('reconnaît le dépôt sans tenir compte de la casse, comme GitHub sert la page', () => {
    const page = load('04-files-commentaire-ligne.html', '/reefact/JUST-DUMMIES/pull/331/changes');
    expect(page.adapter.currentPr()?.createdAt).toBe('2026-10-28T07:18:01.000Z');
  }, T);

  it("ne prend jamais la date d'un en-tête, qui peut être celle de la FUSION (revue, PR #86)", () => {
    // Deux dispositions d'en-tête que la chaîne acceptait encore, chacune portant une date de
    // fusion, sans description de PR ni données embarquées : la date reste inconnue, et
    // journalisée — jamais celle de l'en-tête.
    for (const header of [
      '<div class="gh-header-meta">Reefact merged 9 commits <relative-time datetime="2026-10-28T09:17:04Z"></relative-time></div>',
      '<div data-testid="pr-header">Reefact merged 9 commits <relative-time datetime="2026-10-28T09:17:04Z"></relative-time></div>',
    ]) {
      const doc = new DOMParser().parseFromString(`<html><body>${header}</body></html>`, 'text/html');
      Object.defineProperty(doc, 'location', {
        value: new URL('https://github.com/Reefact/just-dummies/pull/331'),
        configurable: true,
      });
      const adapter = new GithubClientAdapter({ documentRef: doc });
      expect(adapter.currentPr()?.createdAt).toBe('');
      expect(adapter.log.failures.map((f) => f.chain)).toContain('pr-created-at');
    }
  });
});


describe('§6.5, §9.4 — Files changed : PR ouverte (capture 04, PR 548) — #103', () => {
  it("n'y cherche pas de bouton de fusion : l'onglet n'en a pas, ce n'est pas une rupture", () => {
    const page = load('04-files-commentaire-ligne-pr-ouverte.html', '/Reefact/just-dummies/pull/548/changes');
    expect(page.doc.querySelector('[data-testid="mergebox-partial"], [data-testid="for-you-item-row"]')).toBeNull();
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  }, T);
});

describe('§9.4 — hors PR, un champ inconnu ne se journalise pas (#115)', () => {
  // Le rapport du 2026-10-31 : la page de profil, et son champ masqué « Add a bio » (relevé du
  // rapport : `textarea[aria-label="Add a bio"]` dans `form[action="/users/Reefact"]`).
  const PROFILE = '<html><body><form action="/users/Reefact"><textarea aria-label="Add a bio" hidden></textarea></form></body></html>';

  function journalAt(path: string): string[] {
    const doc = new DOMParser().parseFromString(PROFILE, 'text/html');
    Object.defineProperty(doc, 'location', { value: new URL(`https://github.com${path}`), configurable: true });
    const adapter = new GithubClientAdapter({ documentRef: doc });
    adapter.observeEditors(() => {}).dispose();
    return adapter.log.failures.map((f) => f.chain);
  }

  it('sur la page de profil, rien', () => {
    expect(journalAt('/Reefact')).not.toContain('editors');
  });

  it('le même champ sur une PR reste journalisé : la sonde y garde tout son sens', () => {
    expect(journalAt('/Reefact/just-dummies/pull/548')).toContain('editors');
  });
});
