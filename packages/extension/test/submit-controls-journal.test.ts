// @vitest-environment happy-dom
// CA-11 — un éditeur sans AUCUN contrôle d'envoi laisse une ligne au journal local (§9.4, #168).
//
// Une liste vide de `getSubmitControls()` voulait dire « rien à arrêter » : le garde du clic
// laissait passer, sous `enforce` un commentaire non conforme partait, et rien n'en restait. Ce
// fichier vérifie, pour les TROIS plateformes, les deux côtés de la même question :
//   - le contrôleur partagé journalise une liste vide, une seule fois, et la marque rattrapée si
//     les boutons arrivent ensuite ;
//   - sur les pages capturées, une page saine n'écrit rien, et la même page privée de ses boutons
//     d'envoi écrit la ligne — avec la chaîne de SA plateforme, et le champ dans le relevé.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import {
  NEUTRAL_EDITOR_CHROME,
  SelectorLog,
  type EditorHandle,
  type PlatformAdapter,
  type SelectorChain,
  type SelectorEvidence,
  type SubmitControl,
} from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { GitlabClientAdapter } from '@cct/adapter-gitlab';
import { EditorController } from '../src/editor-controller.js';
import { FAKE_SUBMIT_CHAIN, submitLookup } from './helpers/submit-lookup.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

/** Un journal qui garde ce qu'il remet à ses deux rappels locaux : les lignes et leurs relevés,
 * les rattrapages. */
function recordingLog() {
  const lines: { chain: SelectorChain; evidence: SelectorEvidence }[] = [];
  const recovered: string[] = [];
  const log = new SelectorLog(
    null,
    (chain, evidence) => lines.push({ chain, evidence }),
    (chain) => recovered.push(chain.name)
  );
  return { log, lines, recovered };
}

function controllerFor(adapter: PlatformAdapter, editor: EditorHandle, log: SelectorLog): EditorController {
  const config = defaultConfig();
  config.mode = 'enforce';
  config.activation.activatedAt = '2026-09-01T00:00:00Z';
  return new EditorController({
    adapter,
    editor,
    resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
    published: null,
    lang: 'fr',
    currentUserLogin: 'alice',
    log,
  });
}

describe('CA-11, §9.4 — le contrôleur partagé journalise un éditeur sans contrôle d’envoi', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  function setup() {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const editor: EditorHandle = {
      id: 'e1',
      element: textarea,
      context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
    };
    let controls: SubmitControl[] = [];
    const adapter: Partial<PlatformAdapter> = {
      platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
      getEditorChrome: () => NEUTRAL_EDITOR_CHROME,
      getSubmitControls: () => ({ ...submitLookup(controls), evidence: () => ({ facts: { seen: 'yes' } }) }),
      submitKeystrokes: () => ({ field: [], control: [] }),
      readValue: () => textarea.value,
      writeValue: () => {},
    };
    const recording = recordingLog();
    const controller = controllerFor(adapter as PlatformAdapter, editor, recording.log);
    return {
      ...recording,
      controller,
      textarea,
      setControls: (next: SubmitControl[]) => {
        controls = next;
      },
    };
  }

  it('aucun contrôle : UNE ligne, sur la chaîne que l’adaptateur a cherchée, avec SON relevé', () => {
    const { controller, lines, log } = setup();
    controller.refresh();
    controller.refresh();
    expect(lines.map((l) => l.chain.name)).toEqual([FAKE_SUBMIT_CHAIN.name]);
    expect(lines[0]!.evidence.facts).toEqual({ seen: 'yes' });
    expect(log.failures.map((f) => f.chain)).toEqual([FAKE_SUBMIT_CHAIN.name]);
  });

  it('des contrôles trouvés : aucune ligne', () => {
    const { controller, lines, setControls } = setup();
    setControls([{ element: document.createElement('button'), kind: 'submit' }]);
    controller.refresh();
    expect(lines).toEqual([]);
  });

  it('des contrôles trouvés APRÈS une absence : la ligne est marquée rattrapée', () => {
    const { controller, lines, recovered, setControls } = setup();
    controller.refresh();
    setControls([{ element: document.createElement('button'), kind: 'submit' }]);
    controller.refresh();
    expect(lines).toHaveLength(1);
    expect(recovered).toEqual([FAKE_SUBMIT_CHAIN.name]);
  });

  it('un champ retiré de la page n’écrit rien : `dispose()` ne trouve rien autour d’un élément détaché', () => {
    const { controller, lines, textarea } = setup();
    textarea.remove();
    controller.dispose();
    expect(lines).toEqual([]);
  });

  it('le garde du clic interroge aussi : un clic suffit à écrire la ligne', () => {
    const { controller, lines } = setup();
    controller.attach();
    lines.length = 0;
    // `attach()` a déjà journalisé (via `refresh()`) — la déduplication garde UNE ligne par
    // chaîne et par visite : on vérifie que le clic passe par le même chemin, sur un journal
    // dont on oublie ce qu'il a vu.
    controller.deps.log!.forgetSeen();
    document.body.click();
    expect(lines.map((l) => l.chain.name)).toEqual([FAKE_SUBMIT_CHAIN.name]);
  });
});

// ————— Sur les pages capturées des trois plateformes —————

const ADAPTERS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');

interface Platform {
  id: 'github' | 'azdo' | 'gitlab';
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

const captures = PLATFORMS.flatMap((platform) =>
  readdirSync(join(ADAPTERS, platform.id, 'test', 'fixtures', 'pages'))
    .filter((f) => f.endsWith('.html'))
    .map((file) => [platform.id, file, platform] as const)
);

// Analyser une page capturée prend jusqu'à quelques secondes.
const T = 30_000;

describe('CA-11, §9.4 — pages capturées : une page saine n’écrit rien, la même sans boutons écrit', () => {
  const composers = new Map<string, number>();

  // Sinon ce test ne vérifierait rien : une plateforme dont aucune capture n'aurait de composeur
  // observé passerait sans qu'aucune assertion ait porté sur elle.
  afterAll(() => {
    for (const platform of PLATFORMS) expect(composers.get(platform.id) ?? 0, platform.id).toBeGreaterThan(3);
  });

  it.each(captures)('%s — %s', (id, file, platform) => {
    const page = load(platform, file);
    composers.set(id, (composers.get(id) ?? 0) + page.editors.length);
    // Saine : chaque composeur a ses boutons, et le contrôleur n'écrit rien.
    for (const editor of page.editors) {
      expect(page.adapter.getSubmitControls(editor).searched.problem).toBe('submit-control');
      controllerFor(page.adapter, editor, page.log).refresh();
    }
    expect(page.lines.map((l) => l.chain.name)).toEqual([]);

    // Privée des boutons d'envoi d'UN composeur — page rechargée pour chacun, deux composeurs
    // pouvant partager un conteneur : la ligne part, sur la chaîne de la plateforme, et son relevé
    // nomme le champ.
    page.editors.forEach((_, i) => {
      const fresh = load(platform, file);
      const editor = fresh.editors[i]!;
      const lookup = fresh.adapter.getSubmitControls(editor);
      for (const control of lookup.controls) control.element.remove();
      controllerFor(fresh.adapter, editor, fresh.log).refresh();
      const where = `${editor.context.zone}/${editor.context.action}`;
      expect(fresh.lines.map((l) => l.chain.name), where).toEqual([lookup.searched.name]);
      expect(fresh.lines[0]!.evidence.subject?.tag, where).toBe(editor.element.tagName.toLowerCase());
      expect(fresh.lines[0]!.evidence.trace?.length, where).toBeGreaterThan(0);
    });
  }, 4 * T);
});
