// Charger une page capturée dans l'adaptateur GitHub, comme le font les tests sur pages réelles
// (classique, Files changed, Overview). Partagé pour que les trois fichiers ne divergent pas.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorHandle } from '@cct/adapter-shared';
import { GithubClientAdapter } from '../../src/index.js';

export const PAGES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pages');

export interface LoadedPage {
  adapter: GithubClientAdapter;
  doc: Document;
  editors: EditorHandle[];
}

/** Une page capturée, à l'URL où elle a été prise. `DOMParser` plutôt que le document de
 * l'environnement : un document analysé ne charge ni script ni feuille de style. */
export function load(file: string, path: string): LoadedPage {
  const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(`https://github.com${path}`), configurable: true });
  const adapter = new GithubClientAdapter({ documentRef: doc });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  return { adapter, doc, editors };
}

/** L'éditeur qui porte ce champ — il DOIT avoir été observé. */
export function editorOf(page: LoadedPage, field: Element | null): EditorHandle {
  const editor = page.editors.find((e) => e.element === field);
  if (!editor) throw new Error('champ non observé');
  return editor;
}

/** Le libellé des contrôles d'envoi, espaces resserrés. */
export function submitLabels(page: LoadedPage, editor: EditorHandle): string[] {
  return page.adapter.getSubmitControls(editor).map((c) => (c.element.textContent ?? '').trim().replace(/\s+/g, ' '));
}

// Analyser une page de 3 Mo prend quelques secondes : une seule fois par fichier.
export const T = 30_000;
