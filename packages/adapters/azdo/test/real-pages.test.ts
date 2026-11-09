// @vitest-environment happy-dom
// L'ADAPTATEUR AZURE DEVOPS SUR DE VRAIES PAGES (§4.1, §4.3, §5.5, §6.5, §9.2.3, §9.4, annexe B).
//
// Chaque test charge une page capturée sur dev.azure.com le 2026-11-09 (organisation de test
// personnelle, extension Conventional Comments désactivée, page réduite dans le navigateur —
// CAPTURES.md), à l'URL où elle a été prise, et affirme ce que l'adaptateur doit y trouver. Les
// identifiants de fil attendus sont ceux que l'API a rendus à la création des commentaires de
// test, et les dates de création des PR, celles de l'API à la milliseconde.
//
// Un DOM statique ne dit pas tout : la valeur d'une <textarea> n'est pas dans la page capturée,
// aucune feuille de style n'y est. Ces tests jugent la STRUCTURE. Que happy-dom réponde comme
// Chromium sur ces chaînes est vérifié à part (`check:captured-selectors`).

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorHandle } from '@cct/adapter-shared';
import { AzdoClientAdapter } from '../src/index.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const PR = (n: number, view?: 'files') =>
  `/sylva-cct-test/cct-test/_git/cct-test/pullrequest/${n}${view ? '?_a=files' : ''}`;

interface LoadedPage {
  adapter: AzdoClientAdapter;
  doc: Document;
  editors: EditorHandle[];
}

/** Une page capturée, à l'URL où elle a été prise. `DOMParser` : ni script ni feuille de style. */
function load(file: string, path: string): LoadedPage {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://dev.azure.com${path}`), configurable: true });
  const adapter = new AzdoClientAdapter({ documentRef: doc });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return { adapter, doc, editors };
}

const only = (page: LoadedPage): EditorHandle => {
  expect(page.editors).toHaveLength(1);
  return page.editors[0]!;
};
const submits = (page: LoadedPage, editor: EditorHandle) =>
  page.adapter.getSubmitControls(editor).map((c) => [(c.element.textContent ?? '').trim(), c.kind]);
const loggedChains = (page: LoadedPage) => page.adapter.log.failures.map((f) => f.chain);
const firstLine = (text: string) => text.split('\n').find((l) => l.trim() !== '')?.trim();

const T = 30_000;
const PR1_CREATED = '2026-11-09T20:49:08.770Z';
const PR2_CREATED = '2026-11-09T20:49:09.564Z';

describe('§4.3, skill plateforme — aucune page ne fait d’un bouton qui annule un bouton d’envoi', () => {
  it.each(readdirSync(PAGES).filter((f) => f.endsWith('.html')))('%s', (file) => {
    const page = load(file, PR(1, file.includes('-files-') ? 'files' : undefined));
    for (const editor of page.editors) {
      for (const control of page.adapter.getSubmitControls(editor)) {
        expect((control.element.textContent ?? '').trim()).not.toBe('Cancel');
      }
    }
  }, T);
});

describe('§4.1, §9.2.3 — Overview : nouveau commentaire général (capture 01)', () => {
  it('replié, le champ est un <input> de façade : aucun éditeur observé', () => {
    expect(load('01-overview-nouveau-commentaire-replie.html', PR(1)).editors).toEqual([]);
  }, T);

  it('ouvert, un seul champ — pas sa jumelle cachée —, en zone conversation, qui porte un état bloquant', () => {
    const page = load('01-overview-nouveau-commentaire.html', PR(1));
    const editor = only(page);
    expect(editor.element.classList.contains('bolt-textfield-auto-adjust-hidden')).toBe(false);
    expect(editor.context).toMatchObject({ zone: 'conversation', action: 'compose', canCarryBlockingState: true, inScope: true });
    expect(submits(page, editor)).toEqual([['Comment', 'submit']]);
  }, T);

  it('rempli, le même bouton d’envoi', () => {
    const page = load('01-overview-nouveau-commentaire-rempli.html', PR(1));
    expect(submits(page, only(page))).toEqual([['Comment', 'submit']]);
  }, T);

  it('lit la PR dans l’URL, et la personne connectée sur la pastille du champ replié', async () => {
    const page = load('01-overview-nouveau-commentaire-replie.html', PR(1));
    expect(page.adapter.currentPr()).toMatchObject({
      platform: 'azdo',
      host: 'dev.azure.com',
      scope: ['sylva-cct-test', 'cct-test', 'cct-test'],
      number: 1,
    });
    expect(await page.adapter.getCurrentUser()).toEqual({ id: 'display:sylvain aurat', login: 'Sylvain Aurat', isServiceAccount: false });
  }, T);
});

describe('§B.1 — seule la forme d’URL capturée est reconnue (décision du propriétaire, 2026-11-09)', () => {
  // `{org}.visualstudio.com/…` et `/tfs/{collection}/…` ne sont dans aucune capture : la page n'y
  // est pas tenue pour une PR, plutôt que d'y appliquer des sélecteurs que personne n'y a mesurés.
  it.each([
    'https://myorg.visualstudio.com/MyProject/_git/MyRepo/pullrequest/123',
    // Même forme de chemin que dev.azure.com : seul l'hôte la distingue.
    'https://myorg.visualstudio.com/DefaultCollection/MyProject/_git/MyRepo/pullrequest/9',
    'https://tfs.example.corp/tfs/DefaultCollection/Proj/_git/Repo/pullrequest/5',
  ])('%s : pas de PR', (url) => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    Object.defineProperty(doc, 'location', { value: new URL(url), configurable: true });
    expect(new AzdoClientAdapter({ documentRef: doc }).currentPr()).toBeNull();
  });
});

describe('§4.1 — Overview : réponse dans un fil (capture 02)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('02-overview-reponse-fil.html', PR(1));
  }, T);

  it('zone reply, et ses deux boutons d’envoi : Reply & resolve publie ET résout (§B.6)', () => {
    const editor = only(page);
    expect(editor.context).toMatchObject({ zone: 'reply', action: 'compose', canCarryBlockingState: false });
    expect(submits(page, editor)).toEqual([
      ['Reply & resolve', 'submit-and-resolve'],
      ['Reply', 'submit'],
    ]);
  });

  it('le fil dont la réponse est ouverte a perdu son identifiant natif : repli sur la date de sa racine', () => {
    // Le porteur `threadId-2` est le champ replié, remplacé par l'éditeur (CAPTURES.md).
    expect(only(page).context.threadId).toBe('dom-thread-2026-11-09T21:02:34.590Z');
  });
});

describe('§5.5, §9.2.3 — Overview : commentaires publiés (capture 03)', () => {
  let page: LoadedPage;
  beforeAll(() => {
    page = load('03-overview-commentaires-prefixes.html', PR(1));
  }, T);

  it('rend les cinq fils de la PR 1, sous leurs identifiants natifs', async () => {
    const threads = await page.adapter.getThreads();
    expect(threads.map((t) => t.id)).toEqual(['5', '4', '3', '2', '1']);
    expect(threads.every((t) => t.canCarryBlockingState && t.resolution === 'unresolved')).toBe(true);
    expect(page.adapter.getRenderedThreadElements().map((t) => t.id)).toEqual(['5', '4', '3', '2', '1']);
  });

  it('lit racines et réponses, auteur, date et numéro dans le fil', async () => {
    const issue = (await page.adapter.getThreads()).find((t) => t.id === '2')!;
    expect(firstLine(issue.root.body)).toMatch(/^issue \(blocking\): test comment/);
    expect(issue.root.body).toContain('an empty string is not a missing name');
    expect(issue.root).toMatchObject({ id: '2/1', createdAt: '2026-11-09T21:02:34.590Z', author: { login: 'Sylvain Aurat' } });
    expect(issue.replies.map((r) => [r.id, firstLine(r.body)?.slice(0, 5)])).toEqual([['2/2', 'done:']]);
  });

  it('la ligne de préfixe d’un commentaire à code cité n’est pas « Copy to clipboard » (§3.4.1)', async () => {
    const quoted = (await page.adapter.getThreads()).find((t) => t.id === '3')!;
    expect(quoted.root.body).not.toContain('Copy to clipboard');
    expect(quoted.root.body).toMatch(/^\s*```\s*\nreturn 'Hello, ' \+ name;\n```\s*\n\s*suggestion: test comment/);
  });

  it('les corps décorés sont ceux des commentaires — pas la description de la PR', () => {
    const bodies = page.adapter.getRenderedComments().map((c) => c.bodyText);
    expect(bodies).toHaveLength(7);
    expect(bodies.some((b) => b.includes('Test pull request for Conventional Comments'))).toBe(false);
  });

  it('bandeau sous l’en-tête, filtre avant le premier fil, bouton Complete', () => {
    expect(page.adapter.getBannerMount()?.classList.contains('repos-pr-header')).toBe(true);
    expect(page.adapter.getThreadFilterMount()).toBe(page.adapter.getRenderedThreadElements()[0]!.element);
    expect(page.adapter.getCompletionControl()?.element.textContent?.trim()).toBe('Complete');
  });

  it('la date de création est celle de la dernière ligne du fil d’activité', () => {
    expect(page.adapter.currentPr()?.createdAt).toBe(PR1_CREATED);
    expect(loggedChains(page)).toEqual([]);
  });

  it('une dernière ligne qui serait un FIL ne prête pas sa date à la PR — une date inconnue, jamais une fausse', () => {
    // Cas FABRIQUÉ sur le vrai balisage de la capture, que nulle capture ne montre : la ligne de
    // création absente (filtre du fil d'activité, ou non encore rendue), et un fil de LIGNE en
    // dernière position — son en-tête de fichier porte lui aussi un `time.activity-card-time`
    // (21:02:35.377Z, le fil 5).
    const fabricated = load('03-overview-commentaires-prefixes.html', PR(1));
    const rows = [...fabricated.doc.querySelectorAll('tr.bolt-timeline-row')];
    const creation = rows[rows.length - 1]!;
    const lineThread = rows.find((r) => r.querySelector('.comment-file-header'))!;
    expect(lineThread.querySelector('time.activity-card-time')?.getAttribute('datetime')).toBe('2026-11-09T21:02:35.377Z');
    creation.parentElement!.appendChild(lineThread);
    creation.remove();
    lineThread.classList.add('bolt-timeline-last-row');
    expect(fabricated.adapter.currentPr()?.createdAt).toBe('');
  });

  it('forme du corps rendu MESURÉE : <p> et <br> (§5.5)', () => {
    expect(page.adapter.renderedBodyShape()).toEqual({ paragraphTags: ['P'], lineBreakTag: 'BR' });
  });
});

describe('§5.5, §B.5 — état des fils (03-overview-fils-resolus, 03-…-pr2)', () => {
  it('Active, Resolved, Won’t fix, Closed — lus sur le libellé de l’en-tête', async () => {
    const page = load('03-overview-fils-resolus.html', PR(1));
    const states = Object.fromEntries((await page.adapter.getThreads()).map((t) => [t.id, t.resolution]));
    expect(states).toEqual({ '8': 'unresolved', '5': 'unresolved', '4': 'resolved', '3': 'resolved', '2': 'unresolved', '1': 'resolved' });
  }, T);

  it('Pending non résolu ; byDesign, affiché « Unknown », résolu d’après le pied du fil', async () => {
    const page = load('03-overview-commentaires-prefixes-pr2.html', PR(2));
    const states = Object.fromEntries((await page.adapter.getThreads()).map((t) => [t.id, t.resolution]));
    expect(states).toEqual({ '7': 'unresolved', '6': 'resolved' });
    expect(page.adapter.currentPr()?.createdAt).toBe(PR2_CREATED);
  }, T);
});

describe('§5.5 — Files : fils de ligne (03-files)', () => {
  it('rend le fil de ligne, sans filtre dans le diff, et sans journaliser l’absence de date', async () => {
    const page = load('03-files-commentaires-prefixes.html', PR(1, 'files'));
    expect((await page.adapter.getThreads()).map((t) => [t.id, t.replies.length])).toEqual([['5', 1]]);
    expect(page.adapter.getThreadFilterMount()).toBeNull();
    expect(page.adapter.currentPr()?.createdAt).toBe('');
    expect(loggedChains(page)).toEqual([]);
  }, T);

  it('un commentaire portant un bloc de suggestion natif garde sa phrase pour première ligne', async () => {
    const page = load('03-files-suggestion-native.html', PR(1, 'files'));
    const suggestion = (await page.adapter.getThreads()).find((t) => t.id === '8')!;
    expect(firstLine(suggestion.root.body)).toBe('Test comment with a native suggestion block, prefer a strict check here.');
    expect(page.adapter.platformProfile()).toEqual({ id: 'azdo', suggestionInfoString: 'suggestion' });
  }, T);

  it.each([
    ['03-files-commentaires-prefixes-cote-a-cote.html', 3, '9'],
    ['03-files-commentaires-prefixes-plein-ecran.html', 1, '8'],
  ])('%s : le même fil dans un autre mode de diff', async (file, pr, id) => {
    const page = load(file, PR(pr, 'files'));
    expect((await page.adapter.getThreads()).map((t) => t.id)).toContain(id);
  }, T);
});

describe('§4.1 — Files : nouveau commentaire de ligne (capture 04)', () => {
  it.each(['04-files-commentaire-ligne.html', '04-files-commentaire-ligne-rempli.html', '04-files-commentaire-ligne-cote-a-cote.html'])(
    '%s : zone thread-root, un bouton Comment',
    (file) => {
      const page = load(file, PR(file.includes('cote-a-cote') ? 3 : 1, 'files'));
      const editor = only(page);
      expect(editor.context).toMatchObject({ zone: 'thread-root', action: 'compose', canCarryBlockingState: true });
      expect(editor.context.threadId).toBeUndefined();
      expect(submits(page, editor)).toEqual([['Comment', 'submit']]);
    },
    T
  );
});

describe('§4.1 — Files : réponse dans un fil de ligne (capture 05)', () => {
  it.each([
    ['05-files-reponse-fil-ligne.html', 1],
    ['05-files-reponse-fil-ligne-rempli.html', 1],
    ['05-files-reponse-fil-ligne-cote-a-cote.html', 3],
    ['05-files-reponse-fil-ligne-plein-ecran.html', 1],
  ])('%s : zone reply, Reply & resolve et Reply', (file, pr) => {
    const page = load(file, PR(pr, 'files'));
    const editor = only(page);
    expect(editor.context).toMatchObject({ zone: 'reply', action: 'compose', canCarryBlockingState: false });
    expect(submits(page, editor)).toEqual([
      ['Reply & resolve', 'submit-and-resolve'],
      ['Reply', 'submit'],
    ]);
  }, T);
});

describe('§4.1, §4.3 — modification (capture 06)', () => {
  it.each([
    ['06-files-modification-commentaire.html', 1, 'files', '8'],
    ['06-files-modification-commentaire-cote-a-cote.html', 3, 'files', '9'],
    ['06-overview-modification-commentaire.html', 1, undefined, '1'],
  ] as const)('%s : la racine reste thread-root, en action edit', (file, pr, view, threadId) => {
    const page = load(file, PR(pr, view));
    const editor = only(page);
    expect(editor.context).toMatchObject({ zone: 'thread-root', action: 'edit', threadId, canCarryBlockingState: true });
    expect(submits(page, editor)).toEqual([
      ['Update & resolve', 'submit-and-resolve'],
      ['Update', 'submit'],
    ]);
  }, T);

  it('une réponse modifiée est en zone reply, dans son fil', () => {
    const page = load('06-overview-modification-reponse.html', PR(1));
    expect(only(page).context).toMatchObject({ zone: 'reply', action: 'edit', threadId: '2', canCarryBlockingState: false });
  }, T);

  it('la racine en modification perd son libellé d’état : le pied du fil le supplée', async () => {
    const page = load('06-overview-modification-commentaire.html', PR(1));
    expect((await page.adapter.getThreads()).find((t) => t.id === '1')?.resolution).toBe('unresolved');
  }, T);
});

describe('§6.5, §9.4 — le bouton de complétion là où son absence est la norme', () => {
  it('PR abandonnée (08) : pas de contrôle — jamais Reactivate —, et rien de journalisé', () => {
    const page = load('08-overview-pr-abandonnee.html', PR(2));
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(page.adapter.currentPr()?.createdAt).toBe(PR2_CREATED);
    expect(loggedChains(page)).toEqual([]);
  }, T);

  it('plein écran : pas de contrôle, et rien de journalisé', () => {
    const page = load('03-files-commentaires-prefixes-plein-ecran.html', PR(1, 'files'));
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(loggedChains(page)).toEqual([]);
  }, T);

  it('ailleurs, une absence est une rupture, journalisée (§9.4, CA-11)', () => {
    const page = load('03-overview-commentaires-prefixes.html', PR(1));
    page.adapter.getBannerMount()!.querySelector('.repos-pr-header-complete-button')!.remove();
    expect(page.adapter.getCompletionControl()).toBeNull();
    expect(loggedChains(page)).toContain('complete-button');
  }, T);
});
