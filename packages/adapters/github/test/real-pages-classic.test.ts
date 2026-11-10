// @vitest-environment happy-dom
// VUE CLASSIQUE — l'adaptateur GitHub sur les captures de la Conversation d'avant l'Overview
// (`test/fixtures/pages/*-conversation-*`). Même méthode que `real-pages.test.ts`, dont ces blocs
// ont été extraits pour que la vue classique se supprime d'un geste : ce fichier, ses captures, le
// bloc « VUE CLASSIQUE » de `selectors.ts` et `classic.ts`.

import { beforeAll, describe, expect, it } from 'vitest';
import { GithubClientAdapter } from '../src/index.js';
import { editorOf, load, submitLabels, T, type LoadedPage } from './helpers/real-pages.js';

describe('§4.1, §9.2.3 — Conversation : nouveau commentaire (capture 01)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/331');
  }, T);

  it('observe le champ de nouveau commentaire, en zone conversation', () => {
    const editor = editorOf(page, page.doc.getElementById('new_comment_field'));
    expect(editor.context).toMatchObject({ zone: 'conversation', action: 'compose', canCarryBlockingState: false });
    // *Close pull request* (*Close with comment* champ rempli) publie le commentaire : intercepté
    // aussi. Cette attente valait `['Comment']` — elle figeait le trou.
    expect(submitLabels(page, editor)).toEqual(['Close pull request', 'Comment']);
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

  // Les deux sondes ne font taire le journal que lorsqu'elles matchent : si GitHub les renomme,
  // l'absence redevient une entrée — du bruit, jamais du silence. Ces deux tests altèrent la
  // page déjà chargée, puis la restaurent, plutôt que d'en charger une copie : chaque chargement
  // de cette capture coûte ~200 Mo de tas, et deux de plus faisaient déborder le worker en CI.
  // Un adaptateur neuf sur le même document part d'un journal vide.
  it('journalise un bouton de fusion devenu introuvable sur une PR ouverte (§9.4)', () => {
    const button = page.doc.querySelector('[data-testid="mergebox-partial"] button[data-variant="primary"]')!;
    const [parent, next] = [button.parentNode!, button.nextSibling];
    button.remove();
    try {
      const adapter = new GithubClientAdapter({ documentRef: page.doc });
      expect(adapter.getCompletionControl()).toBeNull();
      expect(adapter.log.failures.map((f) => f.chain)).toContain('merge-button');
    } finally {
      parent.insertBefore(button, next);
    }
  });

  it('journalise un fil sans corps ni auteur qui ne se déclare pas replié (§9.4)', async () => {
    // « Se déclarer replié », c'est porter `data-deferred-content-url` OU un contenu encore à
    // charger (`div[hidden] > include-fragment`, #117) : la rupture simulée retire les deux.
    const deferred = [...page.doc.querySelectorAll('[data-deferred-content-url]')].map(
      (el) => [el, el.getAttribute('data-deferred-content-url')!] as const
    );
    const fragments = [...page.doc.querySelectorAll('review-thread-collapsible > div[hidden] > include-fragment')].map(
      (el) => [el, el.parentElement!, el.nextSibling] as const
    );
    for (const [el] of deferred) el.removeAttribute('data-deferred-content-url');
    for (const [el] of fragments) el.remove();
    try {
      const adapter = new GithubClientAdapter({ documentRef: page.doc });
      await adapter.getThreads();
      expect(adapter.log.failures.map((f) => f.chain)).toEqual(expect.arrayContaining(['comment-body', 'comment-author']));
    } finally {
      for (const [el, parent, next] of fragments) parent.insertBefore(el, next);
      for (const [el, url] of deferred) el.setAttribute('data-deferred-content-url', url);
    }
  });

  it("ne journalise pas un fil replié dont le chargement a commencé (#117)", async () => {
    // L'état du rapport du 2026-10-31 : l'attribut est parti avec le début du chargement, le
    // contenu est encore l'`include-fragment` masqué. Ni corps ni auteur à trouver.
    const deferred = [...page.doc.querySelectorAll('[data-deferred-content-url]')].map(
      (el) => [el, el.getAttribute('data-deferred-content-url')!] as const
    );
    expect(deferred.length).toBeGreaterThan(0);
    for (const [el] of deferred) el.removeAttribute('data-deferred-content-url');
    try {
      const adapter = new GithubClientAdapter({ documentRef: page.doc });
      await adapter.getThreads();
      const chains = adapter.log.failures.map((f) => f.chain);
      expect(chains).not.toContain('comment-body');
      expect(chains).not.toContain('comment-author');
    } finally {
      for (const [el, url] of deferred) el.setAttribute('data-deferred-content-url', url);
    }
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
    page = load('03-conversation-pr-fusionnee-commentaires-prefixes.html', '/Reefact/just-dummies/pull/294');
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

  it("ne prend pas le champ « Reference in new issue » pour un composeur pourri (§9.4)", () => {
    // Journal reçu le 2026-10-30 : une entrée `editors` sur une PR où rien n'avait pourri. Sur
    // cette capture, le seul champ que ni `editors` ni la sonde ne connaissaient était celui du
    // dialogue qui crée un ticket à partir d'un commentaire — hors de toute zone du §4.1.
    expect(page.doc.getElementById('convert-to-issue-body-6442405642')).not.toBeNull();
    expect(page.editors.map((e) => e.element.id)).not.toContain('convert-to-issue-body-6442405642');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('editors');
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
describe('§6.5, §9.4 — Conversation : PR ouverte, fusion possible ou non (capture 03, PR 548)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('03-conversation-commentaires-prefixes-pr-ouverte.html', '/Reefact/just-dummies/pull/548');
  }, T);

  it('trouve « Rebase and merge » quand la page dit « Ready to merge »', () => {
    const control = page.adapter.getCompletionControl();
    expect(control?.element.textContent?.trim()).toBe('Rebase and merge');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  });

  /** L'état du rapport du 2026-10-31 (#113), rejoué sur la capture : un check requis échoue, la
   * zone de fusion n'a plus de bouton, et l'icône de mergeabilité le dit (squelette
   * `diagnostic/2026-10-31-merge-button`, `skeletons/mvw7201i-4sm6c7.txt`). */
  function withoutButton(iconLabel: string, run: (adapter: GithubClientAdapter) => void): void {
    const group = page.doc.querySelector('[data-testid="mergebox-partial"] [data-component="ButtonGroup"]')!;
    const icon = page.doc.querySelector('[data-testid="mergeability-icon-wrapper"] svg')!;
    const [parent, next, label] = [group.parentNode!, group.nextSibling, icon.getAttribute('aria-label')!];
    group.remove();
    icon.setAttribute('aria-label', iconLabel);
    try {
      run(new GithubClientAdapter({ documentRef: page.doc }));
    } finally {
      icon.setAttribute('aria-label', label);
      parent.insertBefore(group, next);
    }
  }

  it("checks en échec : aucun bouton, et ce n'est pas une rupture (#113)", () => {
    withoutButton('Checks failing', (adapter) => {
      expect(adapter.getCompletionControl()).toBeNull();
      expect(adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
    });
  });

  it('un état NON mesuré reste journalisé : du bruit, jamais du silence', () => {
    withoutButton('Merging is blocked', (adapter) => {
      expect(adapter.getCompletionControl()).toBeNull();
      expect(adapter.log.failures.map((f) => f.chain)).toContain('merge-button');
    });
  });
});

describe('§6.5, §9.4 — Conversation : un check NON requis en échec, la PR reste fusionnable (PR 552) — #103', () => {
  // GitHub dit « Able to merge » et rend le même « Rebase and merge » en `data-variant="default"`,
  // plus en `primary`. Le premier candidat exigeait `primary` : le bouton n'était pas trouvé, donc
  // pas grisé, et `merge-button` était journalisé pour une chaîne qui n'avait rien de pourri.
  let page: LoadedPage;
  beforeAll(() => {
    page = load('03-conversation-cc1-en-echec.html', '/Reefact/just-dummies/pull/552');
  }, T);

  it('la capture montre bien ce cas : icône « Able to merge », bouton en variante default', () => {
    expect(page.doc.querySelector('[data-testid="mergeability-icon-wrapper"] svg')?.getAttribute('aria-label')).toBe('Able to merge');
    const groupButtons = page.doc.querySelectorAll('[data-testid="mergebox-partial"] [data-component="ButtonGroup"] button');
    expect([...groupButtons].map((b) => b.getAttribute('data-variant'))).toEqual(['default']);
  });

  it('trouve « Rebase and merge », et ne journalise rien', () => {
    const control = page.adapter.getCompletionControl();
    expect(control?.kind).toBe('complete-pr');
    expect(control?.element.textContent?.trim()).toBe('Rebase and merge');
    expect(page.adapter.log.failures.map((f) => f.chain)).not.toContain('merge-button');
  });
});
