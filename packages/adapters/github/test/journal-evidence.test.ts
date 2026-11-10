// @vitest-environment happy-dom
// LE RELEVÉ D'UNE LIGNE DU JOURNAL SUR DE VRAIES PAGES (§9.4).
//
// Deux entrées reçues le 2026-10-30 ne disaient que « cette chaîne n'a rien trouvé » :
// `editors` ne s'est compris qu'en rouvrant une capture, `merge-button` pas du tout. Ces tests
// rejouent les deux situations sur les pages capturées (`real-pages.test.ts`) et vérifient que le
// relevé, À LUI SEUL, aurait suffi — et qu'il ne garde rien du contenu de la page.
//
// Les pages sont MODIFIÉES pour provoquer l'échec : un DOM capturé ne montre que ce qui
// marchait ce jour-là. Ce qui est éprouvé ici est donc ce que le relevé EXTRAIT d'une page
// réelle, pas qu'une rupture se produira sous cette forme.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SelectorLog, type SelectorChain, type SelectorEvidence } from '@cct/adapter-shared';
import { GithubClientAdapter } from '../src/index.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const T = 30_000;

interface Journaled {
  adapter: GithubClientAdapter;
  doc: Document;
  lines: { chain: string; evidence: SelectorEvidence }[];
  recovered: string[];
}

function load(file: string, path: string, prepare: (doc: Document) => void): Journaled {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://github.com${path}`), configurable: true });
  prepare(doc);
  const lines: Journaled['lines'] = [];
  const recovered: string[] = [];
  const log = new SelectorLog(
    null,
    (chain: SelectorChain, evidence: SelectorEvidence) => lines.push({ chain: chain.name, evidence }),
    (chain: SelectorChain) => recovered.push(chain.name)
  );
  return { adapter: new GithubClientAdapter({ documentRef: doc, log }), doc, lines, recovered };
}

const lineOf = (page: Journaled, chain: string) => page.lines.find((l) => l.chain === chain)?.evidence;

describe('§9.4 — `editors` : le relevé nomme le champ que la sonde ne connaît pas', () => {
  it('capture 06 : un champ de ticket non exclu serait décrit jusqu’à son dialogue — sans son texte', () => {
    // La situation du 2026-10-30, reconstituée : le champ du dialogue « Reference in new issue »
    // sous un nom que la sonde n'exclut pas.
    const page = load('06-conversation-modification-commentaire.html', '/Reefact/just-dummies/pull/292', (doc) =>
      doc.getElementById('convert-to-issue-body-6442405642')!.setAttribute('name', 'issue[description]')
    );
    page.adapter.observeEditors(() => {}).dispose();

    const evidence = lineOf(page, 'editors')!;
    expect(evidence.unmatched).toHaveLength(1);
    const [field] = evidence.unmatched!;
    expect(field).toMatchObject({
      tag: 'textarea',
      attrs: { id: 'convert-to-issue-body-#', name: 'issue[description]', 'aria-label': 'Issue body' },
    });
    expect(field!.ancestors).toContain('form[action="/comments/issues"]');
    expect(evidence.facts).toEqual({ prState: 'pullMerged', release: '3649ec8d4252' });
    // Le champ porte le texte du commentaire, et le titre voisin le porte en `value` : ni l'un
    // ni l'autre n'entre dans le relevé.
    expect(JSON.stringify(evidence)).not.toContain('Review terminée');
  }, T);
});

describe('§9.4 — `merge-button` : le relevé dit ce que la boîte de fusion contenait', () => {
  /** Capture 01, PR ouverte, un bouton de fusion que nos candidats ne reconnaissent pas : la forme
   * d'une boîte de fusion inconnue. Altéré sur `data-component`, ce qui DÉSIGNE le bouton — la
   * variante n'est que la recommandation de GitHub (`primary` ou `default`, PR 552, #103) : la
   * passer à `invisible` ne rend plus le bouton méconnaissable. */
  const withoutPrimary = (doc: Document) =>
    doc
      .querySelector('[data-testid="mergebox-partial"] [data-component="ButtonGroup"] button[data-component="Button"]')!
      .setAttribute('data-component', 'UnknownButton');

  it('capture 01 : l’ancêtre atteint, les boutons à la place, l’état de la PR', () => {
    const page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/1', withoutPrimary);
    expect(page.adapter.getCompletionControl()).toBeNull();

    const evidence = lineOf(page, 'merge-button')!;
    // Premier candidat : la boîte, le groupe et son premier item existent, le bouton reconnu non.
    expect(evidence.trace![0]!.steps).toEqual([1, 1, 1, 0]);
    // L'ancre est l'item atteint, et ses ancêtres nomment le groupe et la boîte de fusion.
    expect(evidence.anchor).toMatchObject({ tag: 'div' });
    expect(evidence.anchor!.ancestors).toEqual(
      expect.arrayContaining(['div[data-component="ButtonGroup"]', 'div[data-testid="mergebox-partial"]'])
    );
    // Le bouton se reconnaît à ses attributs d'interface ; son texte n'est jamais relevé
    // (revue Reefact, PR #110 : aucun texte, pas même un libellé de bouton).
    expect(evidence.nearby).toContainEqual(
      expect.objectContaining({ tag: 'button', attrs: expect.objectContaining({ 'data-component': 'UnknownButton' }) })
    );
    expect(JSON.stringify(evidence)).not.toContain('Rebase and merge');
    expect(evidence.facts).toEqual({ prState: 'pullOpened', release: '3649ec8d4252' });
    expect(evidence.msSinceVisit).toEqual(expect.any(Number));
  }, T);

  it('capture 01 : sondé avant que la boîte n’apparaisse, puis trouvé — la ligne le dit', () => {
    let mergebox: Element | null = null;
    const page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/1', (doc) => {
      mergebox = doc.querySelector('[data-testid="mergebox-partial"]');
      mergebox!.remove();
    });

    expect(page.adapter.getCompletionControl()).toBeNull();
    // Sans boîte du tout, la trace s'arrête au premier pas, et il n'y a pas d'ancêtre à décrire.
    expect(lineOf(page, 'merge-button')!.trace![0]!.steps[0]).toBe(0);
    expect(page.recovered).toEqual([]);

    // GitHub rend la boîte : le bouton est trouvé, et le rattrapage part.
    page.doc.querySelector('[class*="prc-PageHeader-PageHeader"]')!.after(mergebox!);
    expect(page.adapter.getCompletionControl()).not.toBeNull();
    expect(page.recovered).toEqual(['merge-button']);
  }, T);

  it('capture 01 intacte : bouton trouvé, rien de journalisé, rien de rattrapé', () => {
    const page = load('01-conversation-nouveau-commentaire.html', '/Reefact/just-dummies/pull/1', () => {});
    expect(page.adapter.getCompletionControl()).not.toBeNull();
    expect(page.lines).toEqual([]);
    expect(page.recovered).toEqual([]);
  }, T);
});
