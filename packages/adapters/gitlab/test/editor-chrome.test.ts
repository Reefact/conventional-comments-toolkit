// @vitest-environment happy-dom
// §5.1, §9.2.3 — le CADRE du composeur GitLab (`getEditorChrome`).
//
// Le retrait intérieur (`cct-host`) se pose sur le conteneur que l'adaptateur désigne ; sans
// désignation, le code partagé remonte au plus quatre niveaux jusqu'à une bordure visible.
// Mesuré sur une instance Self-Managed : le cadre est au cinquième niveau au-dessus du champ, la
// recherche ne trouvait rien et les boutons touchaient la bordure. Les captures de gitlab.com
// n'en ont que quatre — d'où le second cas, qui reconstruit la profondeur MESURÉE.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SelectorLog, type EditorHandle } from '@cct/adapter-shared';
import { GitlabClientAdapter } from '../src/index.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const T = 30_000;

function load(file: string, alter?: (doc: Document) => void) {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  const diffs = file.includes('-changes-') ? '/diffs' : '';
  Object.defineProperty(doc, 'location', {
    value: new URL(`https://gitlab.com/Reefact/testing-conventional-comments/-/merge_requests/1${diffs}`),
    configurable: true,
  });
  alter?.(doc);
  const failures: string[] = [];
  const log = new SelectorLog(null, (chain) => failures.push(chain.name));
  const adapter = new GitlabClientAdapter({ documentRef: doc, log });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return { adapter, editors, failures };
}

/** Distance, en ancêtres, entre le champ et son cadre. */
function depth(editor: Element, frame: Element): number {
  let n = 0;
  for (let el: Element | null = editor; el && el !== frame; el = el.parentElement) n++;
  return n;
}

describe('§9.2.3 — getEditorChrome, adaptateur GitLab', () => {
  it.each(readdirSync(PAGES).filter((f) => f.endsWith('.html')))(
    '%s : chaque champ observé a pour cadre son `.md-area`, sans rien journaliser',
    (file) => {
      const { adapter, editors, failures } = load(file);
      for (const editor of editors) {
        const frame = adapter.getEditorChrome(editor).framedContainer;
        expect(frame, 'cadre désigné').not.toBeNull();
        expect(frame!.classList.contains('md-area')).toBe(true);
        expect(frame!.contains(editor.element)).toBe(true);
      }
      expect(failures).not.toContain('composer-frame');
    },
    T
  );

  // La forme MESURÉE sur une instance Self-Managed : un niveau de plus entre le champ et le cadre.
  // Le cadre reste désigné quelle que soit la profondeur — c'est ce que la règle géométrique, bornée
  // à quatre niveaux, ne faisait pas.
  it('un niveau de plus entre le champ et le cadre : le cadre reste désigné', () => {
    const file = '01-overview-nouveau-commentaire.html';
    const { adapter, editors } = load(file, (doc) => {
      const field = doc.querySelector('textarea[data-testid="comment-field"]')!;
      const dropzone = field.parentElement!;
      const extra = doc.createElement('div');
      extra.className = 'div-dropzone';
      dropzone.replaceWith(extra);
      extra.append(dropzone);
    });
    const editor = editors.find((e) => e.element.matches('[data-testid="comment-field"]'))!;
    const frame = adapter.getEditorChrome(editor).framedContainer;
    expect(frame?.classList.contains('md-area')).toBe(true);
    expect(depth(editor.element, frame!)).toBe(5);
  }, T);

  it('un cadre introuvable est journalisé, et la règle géométrique prend le relais', () => {
    const file = '01-overview-nouveau-commentaire.html';
    const { adapter, editors, failures } = load(file, (doc) => {
      for (const el of doc.querySelectorAll('.md-area')) el.classList.remove('md-area');
    });
    const editor = editors.find((e) => e.element.matches('[data-testid="comment-field"]'))!;
    const chrome = adapter.getEditorChrome(editor);
    expect(chrome.framedContainer).toBeNull();
    expect(failures).toContain('composer-frame');
  }, T);
});
