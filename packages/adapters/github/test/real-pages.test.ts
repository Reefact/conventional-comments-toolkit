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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorHandle } from '@cct/adapter-shared';
import { GithubClientAdapter } from '../src/index.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');

interface LoadedPage {
  adapter: GithubClientAdapter;
  doc: Document;
  editors: EditorHandle[];
}

/** Une page capturée, à l'URL où elle a été prise. `DOMParser` plutôt que le document de
 * l'environnement : un document analysé ne charge ni script ni feuille de style. */
function load(file: string, path: string): LoadedPage {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://github.com${path}`), configurable: true });
  const adapter = new GithubClientAdapter({ documentRef: doc });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return { adapter, doc, editors };
}

/** L'éditeur qui porte ce champ — il DOIT avoir été observé. */
function editorOf(page: LoadedPage, field: Element | null): EditorHandle {
  const editor = page.editors.find((e) => e.element === field);
  if (!editor) throw new Error('champ non observé');
  return editor;
}

/** Le libellé des contrôles d'envoi, espaces resserrés. */
function submitLabels(page: LoadedPage, editor: EditorHandle): string[] {
  return page.adapter.getSubmitControls(editor).map((c) => (c.element.textContent ?? '').trim().replace(/\s+/g, ' '));
}

// Analyser une page de 3 Mo prend quelques secondes : une seule fois par fichier.
const T = 30_000;

describe('§4.1, §9.2.3 — Conversation : nouveau commentaire (capture 01)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331');
  }, T);

  it('observe le champ de nouveau commentaire, en zone conversation', () => {
    const editor = editorOf(page, page.doc.getElementById('new_comment_field'));
    expect(editor.context).toMatchObject({ zone: 'conversation', action: 'compose', canCarryBlockingState: false });
    expect(submitLabels(page, editor)).toEqual(['Comment']);
  });

  it("n'observe PAS la description de la PR, ouverte en édition sur cette capture (§4.1)", () => {
    expect(page.doc.getElementById('issue-6074440789-body')).not.toBeNull();
    expect(page.editors.map((e) => e.element.id)).not.toContain('issue-6074440789-body');
  });

  it('lit la PR, sa date de création et la personne connectée dans la page', async () => {
    expect(page.adapter.currentPr()).toMatchObject({
      platform: 'github',
      host: 'github.com',
      scope: ['Reefact', 'just-dummies'],
      number: 331,
    });
    expect(page.adapter.currentPr()?.createdAt).not.toBe('');
    expect((await page.adapter.getCurrentUser()).login).toBe('Reefact');
  });

  it("trouve le bouton de fusion d'une PR ouverte, et ne journalise rien (§6.5, §9.4)", () => {
    // Avant le 2026-10-29, aucun candidat ne trouvait ce bouton Primer React : le §6.5 ne
    // grisait plus rien sur github.com.
    const control = page.adapter.getCompletionControl();
    expect(control?.kind).toBe('complete-pr');
    expect(control?.element.textContent?.trim()).toBe('Rebase and merge');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  });

  it("lit l'état que chaque fil déclare, et ne journalise pas les fils repliés (§9.2.3, §9.4)", async () => {
    const threads = await page.adapter.getThreads();
    expect(threads).toHaveLength(13);
    // Lus `unknown` jusque-là, donc comptés non résolus — dont deux `issue (blocking)` résolus.
    expect(threads.filter((t) => t.resolution === 'unknown')).toEqual([]);
    expect(threads.filter((t) => t.resolution === 'unresolved')).toHaveLength(1);
    const byAnchor = (a: string) => threads.find((t) => t.root.permalink.endsWith(a));
    // Recoupés avec la vue Files changed de la même PR (capture 05).
    expect(byAnchor('#discussion_r4398202547')?.resolution).toBe('resolved');
    expect(byAnchor('#discussion_r4397911246')?.resolution).toBe('unresolved');
    expect(byAnchor('#discussion_r4398521306')?.root.body).toMatch(/^\s*issue \(blocking\)/);
    expect(byAnchor('#discussion_r4398521306')?.resolution).toBe('resolved');
    // Huit fils repliés, sans corps ni auteur dans la page : rien de pourri.
    expect(threads.filter((t) => t.root.body === '')).toHaveLength(8);
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('comment-body');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('comment-author');
  });
});

describe('§9.4 — ce qui reste journalisé sur une PR ouverte (capture 01, altérée)', () => {
  // Les deux sondes ne font taire le journal que lorsqu'elles matchent : si GitHub les renomme,
  // l'absence redevient une entrée — du bruit, jamais du silence. Chaque test altère sa propre
  // copie de la page.
  it('un bouton de fusion devenu introuvable sur une PR ouverte est journalisé', () => {
    const page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331');
    page.doc.querySelector('[data-testid="mergebox-partial"] button[data-variant="primary"]')!.remove();
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.log.failures.map((f) => f.chain)).toContain('merge-button');
  }, T);

  it('un fil sans corps ni auteur, qui ne se déclare pas replié, est journalisé', async () => {
    const page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331');
    for (const el of page.doc.querySelectorAll('[data-deferred-content-url]')) el.removeAttribute('data-deferred-content-url');
    await page.adapter.getThreads();
    expect(page.adapter.log.failures.map((f) => f.chain)).toEqual(expect.arrayContaining(['comment-body', 'comment-author']));
  }, T);
});

describe('§4.1 — Conversation : réponse dans un fil (capture 02)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('02-conversation-reponse-fil.html', '/Reefact/just-dummies/pull/331');
  }, T);

  it('classe la réponse ouverte en zone reply, rattachée à son fil', () => {
    const field = page.doc.querySelector('.js-inline-comment-form-container.open textarea');
    const editor = editorOf(page, field);
    expect(editor.context).toMatchObject({
      zone: 'reply',
      action: 'compose',
      threadId: 'discussion_r4397911246',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, editor)).toEqual(['Comment']);
  });
});

describe('§5.5, §6.5 — PR fusionnée, commentaires préfixés (capture 03)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('03-pr-fusionnee-commentaires-prefixes.html', '/Reefact/just-dummies/pull/294');
  }, T);

  it('rend les commentaires publiés, préfixes compris, et jamais la description de la PR', () => {
    const subjects = page.adapter.getRenderedComments().map((c) => c.bodyText.trim().split('\n')[0]);
    expect(subjects).toContain('chore (blocking): PR title and description need accurate English.');
    expect(subjects).toContain('praise: The SonarCloud triage is now clearly documented.');
    const description = page.doc.querySelector('[id^="pullrequest-"].js-comment .comment-body');
    expect(description).not.toBeNull();
    expect(page.adapter.getRenderedComments().map((c) => c.element)).not.toContain(description);
  });

  it("n'expose aucun bouton de fusion sur une PR fusionnée, et ne le journalise pas : c'est la norme (§9.4)", () => {
    // L'inverse était attendu ici. Une entrée par PR fusionnée visitée enfouissait la seule qui
    // comptait : le bouton d'une PR ouverte, introuvable depuis que GitHub l'a migré.
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  });
});

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

describe('§4.1, §4.3 — Conversation : modification d\'un commentaire général (capture 06)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('06-conversation-modification-commentaire.html', '/Reefact/just-dummies/pull/292');
  }, T);

  it('reconnaît une ÉDITION en zone conversation, qui ne porte pas d\'état bloquant', () => {
    const editor = editorOf(page, page.doc.getElementById('issuecomment-6442405642-body'));
    expect(editor.context).toMatchObject({
      zone: 'conversation',
      action: 'edit',
      commentId: 'issuecomment-6442405642',
      threadId: 'issuecomment-6442405642',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, editor)).toEqual(['Update comment']);
  });

  it('laisse le champ de nouveau commentaire en composition', () => {
    const editor = editorOf(page, page.doc.getElementById('new_comment_field'));
    expect(editor.context).toMatchObject({ zone: 'conversation', action: 'compose' });
  });

  it('lit ses deux fils repliés comme résolus, sans rien journaliser (§9.2.3, §9.4)', async () => {
    // La forme exacte du journal relevé le 2026-10-29 sur une PR fusionnée de ce dépôt :
    // `comment-body` et `comment-author` à la même milliseconde, `merge-button` juste avant.
    const threads = await page.adapter.getThreads();
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(threads.map((t) => t.resolution)).toEqual(['resolved', 'resolved']);
    const logged = page.adapter.log.failures.map((f) => f.chain);
    expect(logged.filter((c) => ['merge-button', 'comment-body', 'comment-author'].includes(c))).toEqual([]);
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
    ['01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331', '2026-10-28T07:18:01Z'],
    ['02-conversation-reponse-fil.html', '/Reefact/just-dummies/pull/331', '2026-10-28T07:18:01Z'],
    ['03-pr-fusionnee-commentaires-prefixes.html', '/Reefact/just-dummies/pull/294', '2026-10-27T13:28:00Z'],
    ['04-files-commentaire-ligne.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    ['05-files-reponse-fil-ligne.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    ['06-conversation-modification-commentaire.html', '/Reefact/just-dummies/pull/292', '2026-10-27T12:15:37Z'],
    ['06-files-modification-commentaire.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
    ['07-review-changes.html', '/Reefact/just-dummies/pull/331/changes', '2026-10-28T07:18:01.000Z'],
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

