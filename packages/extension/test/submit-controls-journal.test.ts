// @vitest-environment happy-dom
// CA-11 — un éditeur sans AUCUN contrôle d'envoi laisse une ligne au journal local (§9.4, #168).
//
// Une liste vide de `getSubmitControls()` voulait dire « rien à arrêter » : le garde du clic
// laissait passer, sous `enforce` un commentaire non conforme partait, et rien n'en restait. Ce
// fichier vérifie, pour les TROIS plateformes, les deux côtés de la même question :
//   - le contrôleur partagé journalise une liste vide, une seule fois, et la marque rattrapée si
//     les boutons arrivent ensuite ;
//   - sur les pages capturées, une page saine n'écrit rien, et la même page privée de ses boutons
//     d'envoi écrit la ligne — avec la chaîne de SA plateforme, et le champ dans le relevé. Cette
//     moitié-là vit dans un fichier par plateforme (`submit-controls-journal-<plateforme>.test.ts`,
//     `helpers/submit-journal.ts`).

import { beforeEach, describe, expect, it } from 'vitest';
import type { PrRef } from '@cct/core';
import { NEUTRAL_EDITOR_CHROME, type EditorHandle, type PlatformAdapter, type SubmitControl } from '@cct/adapter-shared';
import { FAKE_SUBMIT_CHAIN, submitLookup } from './helpers/submit-lookup.js';
import { controllerFor, recordingLog } from './helpers/submit-journal.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

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

  it('deux éditeurs sur la même chaîne : l’éditeur sain ne rattrape pas la ligne de l’autre (revue Codex, PR #172)', () => {
    const broken = setup();
    // Un second éditeur, sain, qui journalise dans le MÊME journal, sur la MÊME chaîne.
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const healthyAdapter: Partial<PlatformAdapter> = {
      platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
      getEditorChrome: () => NEUTRAL_EDITOR_CHROME,
      getSubmitControls: () => submitLookup([{ element: document.createElement('button'), kind: 'submit' }]),
      submitKeystrokes: () => ({ field: [], control: [] }),
      readValue: () => textarea.value,
      writeValue: () => {},
    };
    const healthy = controllerFor(
      healthyAdapter as PlatformAdapter,
      { id: 'e2', element: textarea, context: broken.controller.deps.editor.context },
      broken.log
    );
    broken.controller.refresh();
    healthy.refresh();
    expect(broken.lines).toHaveLength(1);
    expect(broken.recovered).toEqual([]);
    // L'éditeur fautif trouve enfin ses boutons : là seulement, la ligne est rattrapée.
    broken.setControls([{ element: document.createElement('button'), kind: 'submit' }]);
    broken.controller.refresh();
    expect(broken.recovered).toEqual([FAKE_SUBMIT_CHAIN.name]);
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
