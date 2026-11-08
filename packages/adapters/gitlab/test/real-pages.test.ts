// @vitest-environment happy-dom
// L'ADAPTATEUR GITLAB SUR DE VRAIES PAGES (§4.1, §4.3, §5.5, §6.5, §9.2.3, §9.4, annexe C).
//
// Chaque test charge une page capturée sur gitlab.com le 2026-11-08 (projet de test personnel,
// extension Conventional Comments désactivée, page réduite dans le navigateur — CAPTURES.md), à
// l'URL où elle a été prise, et affirme ce que l'adaptateur doit y trouver.
//
// Un DOM statique ne dit pas tout, et la limite doit être écrite : la valeur d'une <textarea>,
// l'état coché d'une case ne sont pas dans la page capturée ; aucune feuille de style n'y est,
// donc aucune géométrie. Ces tests jugent la STRUCTURE — ce que les chaînes trouvent et ce que
// l'adaptateur en tire —, et rien d'autre. Que happy-dom réponde comme Chromium sur ces chaînes
// est vérifié à part, candidat par candidat (`check:captured-selectors`).

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorHandle } from '@cct/adapter-shared';
import { GitlabClientAdapter } from '../src/index.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const MR1 = '/Reefact/testing-conventional-comments/-/merge_requests/1';
const MR2 = '/Reefact/testing-conventional-comments/-/merge_requests/2';

interface LoadedPage {
  adapter: GitlabClientAdapter;
  doc: Document;
  editors: EditorHandle[];
}

/** Une page capturée, à l'URL où elle a été prise. `DOMParser` plutôt que le document de
 * l'environnement : un document analysé ne charge ni script ni feuille de style. */
function load(file: string, path: string): LoadedPage {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://gitlab.com${path}`), configurable: true });
  const adapter = new GitlabClientAdapter({ documentRef: doc });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return { adapter, doc, editors };
}

/** L'éditeur observé dont le champ porte ce `data-testid` (ou ce `name`). */
function editorBy(page: LoadedPage, key: string): EditorHandle {
  const editor = page.editors.find(
    (e) => e.element.getAttribute('data-testid') === key || e.element.getAttribute('name') === key
  );
  if (!editor) throw new Error(`champ « ${key} » non observé`);
  return editor;
}

/** Le libellé des contrôles d'envoi, espaces resserrés. */
function submitLabels(page: LoadedPage, editor: EditorHandle): string[] {
  return page.adapter.getSubmitControls(editor).map((c) => (c.element.textContent ?? '').trim().replace(/\s+/g, ' '));
}

/** Aucun contrôle qui ANNULE n'est jamais rendu comme contrôle d'envoi (skill plateforme, étape 4) :
 * l'intercepter enfermerait l'auteur d'un commentaire non conforme. */
function expectNoCancelAmongSubmits(page: LoadedPage): void {
  for (const editor of page.editors) {
    for (const control of page.adapter.getSubmitControls(editor)) {
      expect(control.element.getAttribute('data-testid') ?? '').not.toMatch(/cancel|discard/i);
      expect((control.element.textContent ?? '').trim()).not.toMatch(/^(Cancel|Discard review|Continue review)$/);
    }
  }
}

const loggedChains = (page: LoadedPage) => page.adapter.log.failures.map((f) => f.chain);

// Analyser une page de quelques centaines de Ko prend un moment : une seule fois par fichier.
const T = 30_000;

describe('§4.1, §9.2.3 — Overview : nouveau commentaire général (capture 01)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('01-overview-nouveau-commentaire.html', MR1);
  }, T);

  it('observe le champ général, en zone conversation, avec ses trois boutons', () => {
    const editor = editorBy(page, 'comment-field');
    // Sur GitLab, le champ général peut ouvrir un fil résoluble (« Start thread », §C.6) : il porte un
    // état bloquant — décision du propriétaire, à l'inverse de GitHub.
    expect(editor.context).toMatchObject({ zone: 'conversation', action: 'compose', canCarryBlockingState: true });
    expect(submitLabels(page, editor)).toEqual(['Comment', 'Start review', 'Close merge request']);
  });

  it('lit la merge request, sa date de création et la personne connectée dans la page', async () => {
    expect(page.adapter.currentPr()).toEqual({
      platform: 'gitlab',
      host: 'gitlab.com',
      scope: ['Reefact', 'testing-conventional-comments'],
      number: 1,
      createdAt: '2026-11-08T18:24:04Z',
    });
    expect((await page.adapter.getCurrentUser()).login).toBe('Reefact');
  });

  it("trouve le bouton de fusion d'une merge request ouverte, et ne journalise rien (§6.5, §9.4)", () => {
    expect(page.adapter.getCompletionControl()?.kind).toBe('complete-pr');
    expect(loggedChains(page)).toEqual([]);
  });

  it('ancre le bandeau sous le titre, et déclare la forme mesurée du corps rendu (§5.5)', () => {
    expect(page.adapter.getBannerMount()?.classList.contains('detail-page-header')).toBe(true);
    expect(page.adapter.renderedBodyShape()).toEqual({ paragraphTags: ['P'], lineBreakTag: 'BR' });
  });

  it("n'a pas d'étage 0, et lit la configuration du dépôt comme injoignable (§C.4, §C.6)", async () => {
    expect(page.adapter.platformProfile()).toEqual({ id: 'gitlab', suggestionInfoString: null });
    expect((await page.adapter.getRepoConfig(page.adapter.currentPr()!)).status).toBe('unreachable');
  });
});

describe('§C.6 — Les chemins d’envoi du formulaire principal', () => {
  it('champ rempli : « … and close merge request » est un second chemin d’envoi (01-…-rempli)', () => {
    const page = load('01-overview-nouveau-commentaire-rempli.html', MR1);
    expect(submitLabels(page, editorBy(page, 'comment-field'))).toEqual([
      'Comment',
      'Start review',
      'Comment and close merge request',
    ]);
  }, T);

  it('« Start thread » : mêmes boutons, autres libellés (01-…-type-fil)', () => {
    const page = load('01-overview-nouveau-commentaire-type-fil.html', MR1);
    expect(submitLabels(page, editorBy(page, 'comment-field'))).toEqual([
      'Start thread',
      'Start review',
      'Start thread and close merge request',
    ]);
  }, T);

  it('note interne : mêmes boutons, autres libellés (01-…-note-interne)', () => {
    const page = load('01-overview-nouveau-commentaire-note-interne.html', MR1);
    expect(submitLabels(page, editorBy(page, 'comment-field'))).toEqual([
      'Add internal note',
      'Start review',
      'Add internal note and close merge request',
    ]);
  }, T);

  it('plein écran : le même champ, les mêmes boutons (01-…-plein-ecran)', () => {
    const page = load('01-overview-nouveau-commentaire-plein-ecran.html', MR1);
    expect(submitLabels(page, editorBy(page, 'comment-field'))).toEqual(['Comment', 'Start review', 'Close merge request']);
  }, T);
});

describe('§C.2 — Texte enrichi : ni observé, ni lu, ni écrit', () => {
  for (const [file, path] of [
    ['01-overview-nouveau-commentaire-texte-riche.html', MR1],
    ['04-changes-commentaire-ligne-texte-riche.html', `${MR1}/diffs`],
    ['05-changes-reponse-fil-ligne-texte-riche.html', `${MR1}/diffs`],
  ] as const) {
    it(`aucun champ observé, alors que l'éditeur ProseMirror est là (${file})`, () => {
      const page = load(file, path);
      expect(page.doc.querySelector('div[contenteditable="true"].ProseMirror')).not.toBeNull();
      expect(page.editors).toEqual([]);
    }, T);
  }

  it("n'observe aucun des deux champs d'une page en texte enrichi (06-overview-…-texte-riche : édition et champ général)", () => {
    const page = load('06-overview-modification-commentaire-texte-riche.html', MR1);
    // Les deux champs de cette page sont en texte enrichi : aucun n'est observé.
    expect(page.editors).toEqual([]);
  }, T);
});

describe('§4.1 — Zone d’un champ de fil : réponse, puis modification, sinon nouveau fil', () => {
  it('réponse dans un fil général de l’Overview (02)', () => {
    const page = load('02-overview-reponse-fil.html', MR1);
    const reply = editorBy(page, 'reply-field');
    expect(reply.context).toMatchObject({
      zone: 'reply',
      action: 'compose',
      threadId: 'note_4188016816',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, reply)).toEqual(['Start a review', 'Add comment now']);
    // Le champ général reste observé à côté — une chaîne qui n'aurait rendu que lui masquait celui-ci.
    expect(editorBy(page, 'comment-field').context.zone).toBe('conversation');
    expectNoCancelAmongSubmits(page);
  }, T);

  for (const [file, label] of [
    ['04-changes-commentaire-ligne.html', 'Rapid Diffs'],
    ['04-changes-classique-commentaire-ligne.html', 'vue classique'],
  ] as const) {
    it(`nouveau fil sur une ligne de diff — ${label} (${file})`, () => {
      const page = load(file, `${MR1}/diffs`);
      const editor = editorBy(page, 'reply-field');
      expect(editor.context).toMatchObject({ zone: 'thread-root', action: 'compose', canCarryBlockingState: true });
      expect(editor.context.threadId).toBeUndefined();
      expect(submitLabels(page, editor)).toEqual(['Start a review', 'Add comment now']);
      expectNoCancelAmongSubmits(page);
    }, T);
  }

  it('nouveau fil sur une ligne de diff — seconde merge request (04-…-mr2)', () => {
    const page = load('04-changes-commentaire-ligne-mr2.html', `${MR2}/diffs`);
    expect(editorBy(page, 'reply-field').context).toMatchObject({ zone: 'thread-root', action: 'compose' });
    expect(page.adapter.currentPr()).toMatchObject({ number: 2, createdAt: '2026-11-08T18:24:06Z' });
  }, T);

  for (const [file, label] of [
    ['05-changes-reponse-fil-ligne.html', 'Rapid Diffs — la réponse est AUSSI dans le conteneur de la note'],
    ['05-changes-classique-reponse-fil-ligne.html', 'vue classique'],
  ] as const) {
    it(`réponse dans un fil de ligne — ${label} (${file})`, () => {
      const page = load(file, `${MR1}/diffs`);
      expect(editorBy(page, 'reply-field').context).toMatchObject({
        zone: 'reply',
        action: 'compose',
        threadId: 'note_4188016850',
        canCarryBlockingState: false,
      });
      expectNoCancelAmongSubmits(page);
    }, T);
  }

  for (const [file, path, noteId] of [
    ['06-overview-modification-commentaire.html', MR1, 'note_4188016816'],
    ['06-changes-modification-commentaire.html', `${MR1}/diffs`, 'note_4188016850'],
    ['06-changes-classique-modification-commentaire.html', `${MR1}/diffs`, 'note_4188016850'],
  ] as const) {
    it(`modification de la racine d'un fil (${file})`, () => {
      const page = load(file, path);
      const editor = editorBy(page, 'reply-field');
      expect(editor.context).toMatchObject({
        zone: 'thread-root',
        action: 'edit',
        commentId: noteId,
        threadId: noteId,
        canCarryBlockingState: true,
      });
      expect(submitLabels(page, editor)).toEqual(['Save comment']);
      expectNoCancelAmongSubmits(page);
    }, T);
  }
});

describe('§4.1, §C.6 — Revue soumise en lot (captures 07)', () => {
  it('le corps de revue est en zone review-body, avec « Submit review » (07-…-corps-revue)', () => {
    const page = load('07-overview-corps-revue.html', MR1);
    const body = editorBy(page, 'review[note]');
    expect(body.context).toMatchObject({ zone: 'review-body', action: 'compose', canCarryBlockingState: false });
    expect(submitLabels(page, body)).toEqual(['Submit review']);
    // Revue en cours : le formulaire principal change de chemins d'envoi.
    expect(submitLabels(page, editorBy(page, 'comment-field'))).toEqual([
      'Add to review',
      'Add comment now',
      'Close merge request',
    ]);
    expectNoCancelAmongSubmits(page);
  }, T);

  it('panneau ouvert, résumé non déplié : seul le champ général est observé (07-…-panneau-revue)', () => {
    const page = load('07-overview-panneau-revue.html', MR1);
    expect(page.editors.map((e) => e.context.zone)).toEqual(['conversation']);
  }, T);
});

describe('§6.5, §9.4 — Bouton de fusion : son absence est la norme hors de l’Overview ouverte', () => {
  it('merge request fermée : pas de contrôle de complétion, rien de journalisé (08)', () => {
    const page = load('08-overview-mr-fermee.html', MR2);
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(loggedChains(page)).toEqual([]);
    expect(submitLabels(page, editorBy(page, 'comment-field'))).toEqual(['Comment', 'Start review', 'Reopen merge request']);
  }, T);

  it('onglet Changes : pas de bouton de fusion, rien de journalisé (04)', () => {
    const page = load('04-changes-commentaire-ligne.html', `${MR1}/diffs`);
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(loggedChains(page)).toEqual([]);
  }, T);

  it("une note SYSTÈME (« closed ») n'est ni un commentaire ni un fil (08)", async () => {
    const page = load('08-overview-mr-fermee.html', MR2);
    expect(page.doc.querySelector('li.system-note')).not.toBeNull();
    expect(page.adapter.getRenderedCommentElements()).toEqual([]);
    expect(await page.adapter.getThreads()).toEqual([]);
  }, T);
});

describe('§5.5, §9.2.3 — Fils et commentaires publiés (captures 03)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('03-overview-commentaires-discussion.html', MR1);
  }, T);

  it('lit six fils, tous ouverts, identifiés par leur première note', async () => {
    const threads = await page.adapter.getThreads();
    expect(threads.map((t) => t.id)).toEqual([
      'note_4188016816',
      'note_4188016830',
      'note_4188016850',
      'note_4188237859',
      'note_4188237870',
      'note_4188237931',
    ]);
    expect(threads.every((t) => t.resolution === 'unresolved')).toBe(true);
    expect(threads[0]!.root.author.login).toBe('Reefact');
    expect(threads[0]!.root.body.trim()).toBe('issue: total() ignore les prix négatifs.');
  });

  it('rend sept corps de commentaires — réponse comprise —, ni la description ni un aperçu vide', () => {
    const bodies = page.adapter.getRenderedComments().map((c) => c.bodyText.trim().split('\n')[0]);
    expect(bodies).toHaveLength(7);
    expect(bodies).toContain('ack: corrigé dans le prochain commit');
    expect(bodies).toContain('issue (blocking): total() ignore les prix négatifs');
  });

  it('garde, dans un corps rendu, la ligne de préfixe APRÈS du code cité (§3.1)', () => {
    const quoted = page.adapter
      .getRenderedComments()
      .find((c) => c.bodyText.includes('question: faut-il filtrer les libellés vides'));
    expect(quoted?.element.firstElementChild?.classList.contains('markdown-code-block')).toBe(true);
  });

  it('les fils de Rapid Diffs se lisent aussi, sans lien d’horodatage (03-changes)', async () => {
    const changes = load('03-changes-commentaires-discussion.html', `${MR1}/diffs`);
    expect((await changes.adapter.getThreads()).map((t) => [t.id, t.resolution])).toEqual([
      ['note_4188016850', 'unresolved'],
      ['note_4188237931', 'unresolved'],
    ]);
  }, T);
});

describe('§C.5 — Fil résolu', () => {
  it('Overview : le fil replié est lu résolu, sous l’identifiant de sa première note (03-overview-fil-resolu)', async () => {
    const page = load('03-overview-fil-resolu.html', MR1);
    const threads = await page.adapter.getThreads();
    expect(threads.filter((t) => t.resolution === 'resolved').map((t) => t.id)).toEqual(['note_4188016850']);
    expect(threads.filter((t) => t.resolution === 'unresolved')).toHaveLength(5);
    expect(loggedChains(page)).toEqual([]);
  }, T);

  it('Rapid Diffs : un fil résolu n’est pas dans la page — il n’est pas lu, ni compté résolu (03-changes-fil-resolu)', async () => {
    const page = load('03-changes-fil-resolu.html', `${MR1}/diffs`);
    const threads = await page.adapter.getThreads();
    expect(threads.map((t) => t.id)).toEqual(['note_4188237931']);
    expect(threads.every((t) => t.resolution !== 'resolved')).toBe(true);
  }, T);
});

describe('§5.5 — Aperçu (capture 09)', () => {
  it("rend l'aperçu affiché comme un corps, et lui seul parmi les porteurs d'aperçu", () => {
    const page = load('09-overview-apercu.html', MR1);
    const previews = page.adapter
      .getRenderedComments()
      .filter((c) => c.element.closest('.md-preview-holder') !== null);
    expect(previews.map((c) => c.bodyText.trim())).toEqual([
      'suggestion (non-blocking): brouillon de capture, ne pas envoyer',
    ]);
  }, T);
});
