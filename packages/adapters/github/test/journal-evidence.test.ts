// @vitest-environment happy-dom
// LE RELEVÉ D'UNE LIGNE DU JOURNAL SUR DE VRAIES PAGES (§9.4).
//
// Deux entrées reçues le 2026-10-30 ne disaient que « cette chaîne n'a rien trouvé » :
// `editors` ne s'est compris qu'en rouvrant une capture, `merge-button` pas du tout — sa sonde
// est retirée depuis, avec le grisage du bouton de fusion (§2). Ces tests rejouent la situation
// qui reste sur les pages capturées (`real-pages.test.ts`) et vérifient que le
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
