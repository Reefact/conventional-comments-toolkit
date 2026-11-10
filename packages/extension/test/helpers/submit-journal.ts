// Le journal d'un éditeur sans contrôle d'envoi (§9.4, CA-11, #168), sur les pages capturées.
//
// Une fonction plutôt qu'un fichier de test : chaque plateforme a son fichier
// (`submit-controls-journal-<plateforme>.test.ts`), donc son worker. Les 84 captures des trois
// plateformes dans un seul worker en épuisaient la mémoire — mesuré en CI sur Node 20, et en
// local avec le tas par défaut.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '@cct/core';
import {
  SelectorLog,
  type EditorHandle,
  type PlatformAdapter,
  type SelectorChain,
  type SelectorEvidence,
} from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { GitlabClientAdapter } from '@cct/adapter-gitlab';
import { EditorController } from '../../src/editor-controller.js';

/** Un journal qui garde ce qu'il remet à ses deux rappels locaux : les lignes et leurs relevés,
 * les rattrapages. */
export function recordingLog() {
  const lines: { chain: SelectorChain; evidence: SelectorEvidence }[] = [];
  const recovered: string[] = [];
  const log = new SelectorLog(
    null,
    (chain, evidence) => lines.push({ chain, evidence }),
    (chain) => recovered.push(chain.name)
  );
  return { log, lines, recovered };
}

export function controllerFor(adapter: PlatformAdapter, editor: EditorHandle, log: SelectorLog): EditorController {
  const config = defaultConfig();
  config.mode = 'enforce';
  return new EditorController({
    adapter,
    editor,
    resolved: { config, notices: [], degraded: false, degradedReason: null },
    published: null,
    lang: 'fr',
    currentUserLogin: 'alice',
    log,
  });
}

// ————— Sur les pages capturées —————

const ADAPTERS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'adapters');

export type PlatformId = 'github' | 'azdo' | 'gitlab';

interface Platform {
  id: PlatformId;
  origin: string;
  /** L'URL où la capture a été prise : c'est elle qui fait choisir la vue à l'adaptateur. */
  path: (file: string) => string;
  make: (doc: Document, log: SelectorLog) => PlatformAdapter;
}

const PLATFORMS: Platform[] = [
  {
    id: 'github',
    origin: 'https://github.com',
    path: (f) => `/Reefact/just-dummies/pull/548${f.includes('-files-') || f.includes('review-changes') ? '/changes' : ''}`,
    make: (doc, log) => new GithubClientAdapter({ documentRef: doc, log }),
  },
  {
    id: 'azdo',
    origin: 'https://dev.azure.com',
    path: (f) => `/sylva-cct-test/cct-test/_git/cct-test/pullrequest/1${f.includes('-files-') ? '?_a=files' : ''}`,
    make: (doc, log) => new AzdoClientAdapter({ documentRef: doc, log }),
  },
  {
    id: 'gitlab',
    origin: 'https://gitlab.com',
    path: (f) => `/Reefact/testing-conventional-comments/-/merge_requests/1${f.includes('-changes-') ? '/diffs' : ''}`,
    make: (doc, log) => new GitlabClientAdapter({ documentRef: doc, log }),
  },
];

function load(platform: Platform, file: string) {
  const html = readFileSync(join(ADAPTERS, platform.id, 'test', 'fixtures', 'pages', file), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(platform.origin + platform.path(file)), configurable: true });
  const recording = recordingLog();
  const adapter = platform.make(doc, recording.log);
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  // Ce que le chargement a journalisé d'autre ne concerne pas ce test.
  recording.lines.length = 0;
  recording.log.forgetSeen();
  return { ...recording, adapter, editors };
}

// Analyser une page capturée prend jusqu'à quelques secondes.
const T = 30_000;

export function describeOnCaptures(id: PlatformId): void {
  const platform = PLATFORMS.find((p) => p.id === id)!;
  const files = readdirSync(join(ADAPTERS, id, 'test', 'fixtures', 'pages')).filter((f) => f.endsWith('.html'));

  describe(`CA-11, §9.4 — ${id}, pages capturées : une page saine n’écrit rien, la même sans boutons écrit`, () => {
    let composers = 0;

    // Sinon ce test ne vérifierait rien : une plateforme dont aucune capture n'aurait de composeur
    // observé passerait sans qu'aucune assertion ait porté sur elle.
    afterAll(() => {
      expect(composers, id).toBeGreaterThan(3);
    });

    it.each(files)('%s', (file) => {
      const page = load(platform, file);
      composers += page.editors.length;
      // Saine : chaque composeur a ses boutons, et le contrôleur n'écrit rien.
      for (const editor of page.editors) {
        expect(page.adapter.getSubmitControls(editor).searched.problem).toBe('submit-control');
        controllerFor(page.adapter, editor, page.log).refresh();
      }
      expect(page.lines.map((l) => l.chain.name)).toEqual([]);

      // Privée des boutons d'envoi d'UN composeur à la fois : la ligne part, sur la chaîne de la
      // plateforme, et son relevé nomme le champ. Les boutons sont remis en place avant le
      // suivant — deux composeurs peuvent partager un conteneur. Recharger la page pour chacun
      // épuisait la mémoire d'un worker : ces pages pèsent jusqu'à 3 Mo.
      for (const editor of page.editors) {
        const lookup = page.adapter.getSubmitControls(editor);
        const removed = lookup.controls.map(({ element }) => ({
          element,
          parent: element.parentNode!,
          next: element.nextSibling,
        }));
        for (const { element } of removed) element.remove();
        page.lines.length = 0;
        page.log.forgetSeen();
        controllerFor(page.adapter, editor, page.log).refresh();
        const where = `${editor.context.zone}/${editor.context.action}`;
        expect(page.lines.map((l) => l.chain.name), where).toEqual([lookup.searched.name]);
        expect(page.lines[0]!.evidence.subject?.tag, where).toBe(editor.element.tagName.toLowerCase());
        expect(page.lines[0]!.evidence.trace?.length, where).toBeGreaterThan(0);
        // Dans l'ordre inverse : chaque élément retrouve le voisin devant lequel il était.
        for (const { element, parent, next } of removed.reverse()) parent.insertBefore(element, next);
      }
    }, T);
  });
}
