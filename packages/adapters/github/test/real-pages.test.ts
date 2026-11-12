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
import { splitBody } from '@cct/core';
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
    const controls = page.adapter.getSubmitControls(page.editors[0]!).controls;
    expect(controls).toHaveLength(1);
    expect(controls[0]!.element.textContent).toMatch(/^Submit review/);
  });
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

describe('§3.4.1, §5.5 — un préfixe placé après un bloc de code cité (C3, captures 03 de la PR 548)', () => {
  // Le §3.4.1 nomme la forme comme courante : citer du code, puis écrire le préfixe dessous. Relu
  // depuis le corps RENDU, le bloc de code perdait ses délimiteurs, sa première ligne devenait la
  // ligne de préfixe, et le commentaire n'avait aucun badge — dans les deux vues.
  it.each([
    ['03-overview-commentaires-prefixes.html', 'Overview'],
    ['03-conversation-commentaires-prefixes-pr-ouverte.html', 'classique'], // CLASSIQUE
  ])('%s (%s) : la ligne de préfixe est celle qui suit le code', (file) => {
    const page = load(file, '/Reefact/just-dummies/pull/548');
    const c3 = page.adapter.getRenderedComments().find((c) => c.bodyText.includes('should an empty list return 0'));
    expect(c3).toBeDefined();
    expect(splitBody(c3!.bodyText).prefixLine).toBe('question: [cct test] should an empty list return 0?');
  }, T);
});

describe('§5.5 — le filtre de fils se place au niveau de la LISTE, hors des boîtes (captures 03, PR 548)', () => {
  // Il se plaçait avant le premier fil rendu : dans le bloc de la revue (classique), dans la boîte
  // même du premier fil (Overview). Remarque du propriétaire à la validation, 2026-11-09.
  it.each([
    ['03-overview-commentaires-prefixes.html', '[data-testid="timeline-item"]'],
    ['03-conversation-commentaires-prefixes-pr-ouverte.html', '.js-timeline-item'], // CLASSIQUE
  ])('%s : avant l’élément de chronologie qui contient le premier fil', (file, item) => {
    const page = load(file, '/Reefact/just-dummies/pull/548');
    const mount = page.adapter.getThreadFilterMount();
    const first = page.adapter.getRenderedThreadElements()[0]!.element;
    expect(mount?.matches(item)).toBe(true);
    expect(mount?.contains(first)).toBe(true);
    // Hors de toute boîte de fil ou de revue : aucun ancêtre n'est un élément de chronologie.
    expect(mount?.parentElement?.closest(item)).toBeNull();
  }, T);

  // Modes `Unresolved` et `Mine` de la section Comments : aucun élément de chronologie, le filtre
  // tombait dans la carte du premier fil, entre son diff et son commentaire (Reefact/deskmate#2,
  // remarque du propriétaire, 2026-11-12).
  it.each([
    ['03-overview-commentaires-prefixes-unresolved.html'],
    ['03-overview-commentaires-prefixes-mine.html'],
  ])('%s : avant la carte entière du premier fil, diff compris', (file) => {
    const page = load(file, '/Reefact/deskmate/pull/2');
    const mount = page.adapter.getThreadFilterMount();
    const first = page.adapter.getRenderedThreadElements()[0]!.element;
    expect(first.closest('[data-testid="timeline-item"]')).toBeNull();
    expect(mount?.tagName).toBe('ARTICLE');
    expect(mount?.contains(first)).toBe(true);
    // La carte porte l'en-tête de fichier et le diff, que le fil seul ne contient pas.
    expect(mount?.querySelector('table')).not.toBeNull();
    expect(first.querySelector('table')).toBeNull();
    expect(mount?.parentElement?.closest('article')).toBeNull();
  }, T);
});
