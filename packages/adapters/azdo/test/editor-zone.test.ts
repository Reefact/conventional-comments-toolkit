// @vitest-environment happy-dom
// CA-11 — Azure DevOps : un champ que le repli de zone classe sans l'avoir reconnu laisse une ligne
// au journal (§4.1, §9.4, #168).
//
// Le repli de `#contextOf()` donne une zone à tout champ qu'aucune règle n'a situé. Il a un cas
// nominal, le nouveau commentaire général, reconnu désormais par sa marque (`selectors.generalComposer`). Ce fichier
// vérifie les deux côtés sur les pages capturées : aucune ne journalise la chaîne, et les pages où
// le repli est atteint la journalisent dès que la marque disparaît — sans que la zone change.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SelectorLog, type EditorHandle, type SelectorEvidence } from '@cct/adapter-shared';
import { AzdoClientAdapter } from '../src/index.js';
import { selectors } from '../src/selectors.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const path = (f: string) => `/sylva-cct-test/cct-test/_git/cct-test/pullrequest/1${f.includes('-files-') ? '?_a=files' : ''}`;

function load(file: string, alter?: (doc: Document) => void) {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://dev.azure.com${path(file)}`), configurable: true });
  alter?.(doc);
  const lines = new Map<string, SelectorEvidence>();
  const log = new SelectorLog(null, (chain, evidence) => lines.set(chain.name, evidence));
  const adapter = new AzdoClientAdapter({ documentRef: doc, log });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return { editors, lines };
}

// Analyser une page capturée prend jusqu'à quelques secondes.
const T = 30_000;

describe('§4.1, §9.4 — Azure DevOps : le repli de zone sur les pages capturées', () => {
  it('la chaîne déclare à quoi elle sert', () => {
    expect(selectors.generalComposer.name).toBe('general-composer');
    expect(selectors.generalComposer.problem).toBe('editor-zone');
  });

  it.each(readdirSync(PAGES).filter((f) => f.endsWith('.html')))('%s : rien de journalisé', (file) => {
    expect([...load(file).lines.keys()]).not.toContain('general-composer');
  }, T);

  it.each(['01-overview-nouveau-commentaire.html', '01-overview-nouveau-commentaire-rempli.html', '01-overview-nouveau-commentaire-pr2.html'])('%s : sans sa marque, le champ est journalisé et garde sa zone', (file) => {
    const before = load(file);
    const fallback = before.editors.filter((e) => e.context.zone === 'conversation' && e.context.action === 'compose');
    expect(fallback.length).toBeGreaterThan(0);

    const after = load(file, (doc) => {
      for (const el of doc.querySelectorAll('table.activity-feed-list')) el.removeAttribute('class');
    });
    const evidence = after.lines.get('general-composer');
    expect(evidence, 'ligne au journal').toBeDefined();
    expect(evidence!.subject?.tag).toBe(fallback[0]!.element.tagName.toLowerCase());
    expect(evidence!.trace?.map((t) => t.candidate)).toEqual(selectors.generalComposer.candidates);
    // La zone ne change pas : seul le journal en dit plus.
    expect(after.editors.map((e) => e.context.zone)).toEqual(before.editors.map((e) => e.context.zone));
  }, T);
});
