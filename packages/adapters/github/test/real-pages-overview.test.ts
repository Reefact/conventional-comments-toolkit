// @vitest-environment happy-dom
// VUE OVERVIEW — l'adaptateur GitHub sur les captures de la page Overview des pull requests
// (préversion publique du 2026-11-05, #131).
//
// Captures prises le 2026-11-09 par une session Claude in Chrome, extension Conventional Comments
// désactivée, sur `Reefact/just-dummies` : PR 548 ouverte (`?overview=true`) et PR 547 fusionnée,
// réduites dans le navigateur (skill `plateforme`). Sur la PR 548, six commentaires de test publiés
// pour l'occasion : trois généraux (C1 sans discussion, C2 bloquant avec discussion, C3 dont la
// ligne de préfixe suit un bloc de code), un fil sur la ligne 7 (L1) et sa réponse (R1), une
// suggestion native sur la ligne 13 (L2).
//
// Avant ce correctif, l'adaptateur classait le nouveau commentaire en `thread-root` sans AUCUN
// bouton d'envoi — rien n'était intercepté sous `enforce` —, la réponse en `thread-root`,
// l'édition d'un commentaire général en composition sans bouton, et ne rendait les badges que des
// commentaires de fil.

import { describe, expect, it } from 'vitest';
import { githubView } from '../src/view.js';
import { editorOf, load, submitLabels, T } from './helpers/real-pages.js';

const PR548 = '/Reefact/just-dummies/pull/548';
const PR547 = '/Reefact/just-dummies/pull/547';
const PR530 = '/Reefact/just-dummies/pull/530';

/** L'éditeur dont le champ contient ce texte — un champ d'édition est prérempli, mais la valeur
 * d'une `<textarea>` n'est pas dans le HTML capturé : on le désigne par son contexte. */
function editorWhere(page: ReturnType<typeof load>, pred: (ctx: Record<string, unknown>) => boolean) {
  const found = page.editors.filter((e) => pred(e.context as unknown as Record<string, unknown>));
  expect(found).toHaveLength(1);
  return found[0]!;
}

const isNewComment = (c: Record<string, unknown>) => c.zone === 'conversation' && c.action === 'compose';

describe('#131 — la vue se lit dans la page, pas dans l’URL', () => {
  it.each([
    ['01-overview-nouveau-commentaire.html', PR548, 'overview'],
    ['08-overview-pr-fusionnee.html', PR547, 'overview'],
    ['03-conversation-commentaires-prefixes-pr-ouverte.html', PR548, 'classic'],
    ['04-files-commentaire-ligne-pr-ouverte.html', `${PR548}/changes`, 'other'],
  ])('%s → %s', (file, path, view) => {
    expect(githubView(load(file, path).doc)).toBe(view);
  }, T);
});

describe('§4.1, §5.4 — Overview : nouveau commentaire général (capture 01)', () => {
  it('le classe en zone conversation, et intercepte « Comment » et « Close pull request »', () => {
    const page = load('01-overview-nouveau-commentaire.html', PR548);
    const editor = editorOf(page, page.doc.querySelector('form[aria-label="Add comment form"] textarea'));
    expect(editor.context).toMatchObject({ zone: 'conversation', action: 'compose', canCarryBlockingState: false });
    expect(submitLabels(page, editor)).toEqual(['Close pull request', 'Comment']);
  }, T);

  it('champ rempli : « Close with comment » publie le commentaire, il est intercepté aussi', () => {
    const page = load('01-overview-nouveau-commentaire-rempli.html', PR548);
    const editor = editorOf(page, page.doc.querySelector('form[aria-label="Add comment form"] textarea'));
    expect(submitLabels(page, editor)).toEqual(['Close with comment', 'Comment']);
  }, T);

  it("checks en cours : pas de bouton de fusion, et ce n'est pas une rupture (§6.5, §9.4)", () => {
    const page = load('01-overview-nouveau-commentaire.html', PR548);
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  }, T);
});

describe('§4.1, §5.4 — Overview : réponse dans un fil (capture 02)', () => {
  it('la classe en zone reply, rattachée à la racine du fil — pas à la revue', () => {
    const page = load('02-overview-reponse-fil.html', PR548);
    const editor = editorWhere(page, (c) => c.zone === 'reply');
    expect(editor.context).toMatchObject({
      action: 'compose',
      threadId: 'discussion_r4512962375',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, editor)).toEqual(['Resolve', 'Start a review', 'Reply']);
  }, T);

  it('champ rempli : « Reply and resolve » publie, il est intercepté ; « Cancel » jamais', () => {
    const page = load('02-overview-reponse-fil-rempli.html', PR548);
    const editor = editorWhere(page, (c) => c.zone === 'reply');
    expect(submitLabels(page, editor)).toEqual(['Reply and resolve', 'Start a review', 'Reply']);
  }, T);
});

describe('§5.5, §6.5 — Overview : commentaires publiés (capture 03)', () => {
  it('rend les commentaires GÉNÉRAUX comme ceux des fils, et jamais la description', () => {
    const page = load('03-overview-commentaires-prefixes.html', PR548);
    const bodies = page.adapter.getRenderedComments().map((c) => c.bodyText);
    for (const start of [
      'note: [cct test] a prefixed comment without discussion',
      'issue (blocking): [cct test] total() accepts negative quantities',
      'issue (blocking): [cct test] quantity is never validated',
      'done: [cct test] validated in the next commit',
      'suggestion: [cct test] guard the division explicitly',
    ]) {
      expect(bodies.some((b) => b.trimStart().startsWith(start))).toBe(true);
    }
    // C3 : le préfixe suit un bloc de code cité, il n'est pas en tête du corps.
    expect(bodies.some((b) => b.includes('question: [cct test] should an empty list return 0?'))).toBe(true);
    expect(bodies.some((b) => b.includes('Will be closed without merging'))).toBe(false);
  }, T);

  it('lit les deux fils de ligne — corps, auteur, permalien — sans rien journaliser', async () => {
    const page = load('03-overview-commentaires-prefixes.html', PR548);
    const threads = await page.adapter.getThreads();
    expect(threads.map((t) => t.root.body.split('\n')[0])).toEqual([
      'suggestion: [cct test] guard the division explicitly',
      'issue (blocking): [cct test] quantity is never validated',
    ]);
    expect(threads.every((t) => t.root.author.login === 'Reefact')).toBe(true);
    // L'Overview écrit le fragment comme la vue classique (`#discussion_r…`), pas comme Files
    // changed (`#r…`) : MESURÉ sur cette capture.
    expect(threads.map((t) => t.root.permalink.split('#')[1])).toEqual([
      'discussion_r4512976188',
      'discussion_r4512962375',
    ]);
    const chains = page.adapter.log.failures.map((f) => f.chain);
    expect(chains).not.toContain('comment-body');
    expect(chains).not.toContain('comment-author');
    expect(chains).not.toContain('thread-anchor');
  }, T);

  it('trouve « Rebase and merge » dans la rangée « ready-to-merge » (#127)', () => {
    const page = load('03-overview-commentaires-prefixes.html', PR548);
    const control = page.adapter.getCompletionControl();
    expect(control?.kind).toBe('complete-pr');
    expect(control?.element.textContent?.trim()).toBe('Rebase and merge');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  }, T);
});

describe('§4.3 — Overview : modifications (captures 06)', () => {
  it("l'édition d'un commentaire GÉNÉRAL : zone conversation, son identifiant, « Update comment »", () => {
    const page = load('06-overview-modification-commentaire.html', PR548);
    const editor = editorWhere(page, (c) => c.action === 'edit');
    expect(editor.context).toMatchObject({
      zone: 'conversation',
      commentId: 'issuecomment-6740594800',
      threadId: 'issuecomment-6740594800',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, editor)).toEqual(['Update comment']);
  }, T);

  it("l'édition de la RACINE d'un fil reste thread-root (§4.1)", () => {
    const page = load('06-overview-modification-commentaire-fil-racine.html', PR548);
    const editor = editorWhere(page, (c) => c.action === 'edit');
    expect(editor.context).toMatchObject({
      zone: 'thread-root',
      threadId: 'discussion_r4512962375',
      commentId: 'discussion_r4512962375',
      canCarryBlockingState: true,
    });
    expect(submitLabels(page, editor)).toEqual(['Update']);
  }, T);

  it("l'édition d'une RÉPONSE : zone reply, son identifiant et celui du fil", () => {
    const page = load('06-overview-modification-commentaire-fil-reponse.html', PR548);
    const editor = editorWhere(page, (c) => c.action === 'edit');
    expect(editor.context).toMatchObject({
      zone: 'reply',
      threadId: 'discussion_r4512962375',
      commentId: 'discussion_r4512966217',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, editor)).toEqual(['Update']);
  }, T);
});

describe('§4.1, §5.4 — Overview : panneau de revue (capture 07)', () => {
  it('classe le corps de revue en review-body, et intercepte « Submit review »', () => {
    const page = load('07-overview-panneau-revue.html', PR548);
    const editor = editorWhere(page, (c) => c.zone === 'review-body');
    expect(submitLabels(page, editor).map((l) => l.split(' ')[0] + ' ' + l.split(' ')[1])).toEqual(['Submit review']);
  }, T);
});

describe('§6.5, §9.4 — Overview : PR fusionnée (capture 08)', () => {
  it("le seul bouton du nouveau commentaire, « Comment », est intercepté — premier, mais primary", () => {
    const page = load('08-overview-pr-fusionnee.html', PR547);
    const editor = editorWhere(page, isNewComment);
    expect(submitLabels(page, editor)).toEqual(['Comment']);
  }, T);

  it("pas de bouton de fusion, et ce n'est pas une rupture", () => {
    const page = load('08-overview-pr-fusionnee.html', PR547);
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  }, T);
});

describe('§5.5 — Overview : aperçu d’une modification (capture 09)', () => {
  it("rend l'aperçu pour les badges, comme un commentaire publié", () => {
    const page = load('09-overview-apercu.html', PR548);
    const preview = page.doc.querySelector('[class*="previewViewerWrapper__"] .markdown-body');
    expect(preview).not.toBeNull();
    const rendered = page.adapter.getRenderedComments().map((c) => c.element);
    expect(rendered).toContain(preview);
    expect(page.adapter.getRenderedCommentElements()).toContain(preview);
  }, T);
});

describe('§4.1, §5.5 — Overview : corps de revue soumis en lot (captures de la PR 530)', () => {
  // L'audit croisé des deux vues sur onze PR réelles (2026-11-09) : 0 badge sur 18 corps de revue
  // préfixés dans l'Overview, 18 sur 18 dans la vue classique. Aucune capture de la première série
  // ne contenait de revue publiée avec un corps.
  const REVIEWED = 'reviewed: the rare-seed sweep now reports failures from every step';
  const NOTE = 'note: The documentation review remains open pending the inline finding.';

  it('rend les corps de revue pour les badges, comme la vue classique', () => {
    const page = load('03-overview-corps-de-revue-publies.html', PR530);
    const firstLines = page.adapter.getRenderedComments().map((c) => c.bodyText.trim().split('\n')[0]);
    expect(firstLines).toContain(REVIEWED);
    expect(firstLines).toContain(NOTE);
  }, T);

  it('la vue classique de la même PR, référence de cette comparaison', () => {
    const page = load('03-conversation-corps-de-revue-publies.html', PR530); // CLASSIQUE
    const firstLines = page.adapter.getRenderedComments().map((c) => c.bodyText.trim().split('\n')[0]);
    expect(firstLines).toContain(REVIEWED);
    expect(firstLines).toContain(NOTE);
  }, T);

  it("l'édition d'un corps de revue : zone review-body, son identifiant, « Update review »", () => {
    const page = load('06-overview-modification-corps-de-revue.html', PR530);
    const editor = editorWhere(page, (c) => c.action === 'edit');
    expect(editor.context).toMatchObject({
      zone: 'review-body',
      commentId: 'pullrequestreview-5788962752',
      canCarryBlockingState: false,
    });
    expect(submitLabels(page, editor)).toEqual(['Update review']);
  }, T);
});
