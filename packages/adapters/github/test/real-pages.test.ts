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

  it("n'expose aucun bouton de fusion sur une PR fusionnée, et le journalise (§9.4)", () => {
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.log.failures.map((f) => f.chain)).toContain('merge-button');
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
