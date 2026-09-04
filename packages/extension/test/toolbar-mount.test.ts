// @vitest-environment happy-dom
// §5.1 « barre d'outils AU-DESSUS de la zone de saisie » et §5.3 « pastille en dessous » sont
// des affirmations de MISE EN PAGE. Les deux se posaient comme frères immédiats du champ, ce
// qui les met au-dessus et en dessous seulement si le parent direct EMPILE ses enfants.
//
// MESURÉ sur `https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes`
// (composeur de réponse ouvert, 2026-09-04), `getComputedStyle` de la chaîne d'ancêtres :
//
//   TEXTAREA  prc-Textarea-TextArea                     display: block
//   SPAN      MarkdownInput-module__textArea            display: inline-flex   ← le parent direct
//   DIV       InlineAutocomplete-module__container      display: block         ← le premier qui empile
//   DIV       MarkdownInput-module__inputWrapper        display: flex / row
//   DIV                                                 display: contents
//   DIV       AddCommentEditor-module__Conversation…    display: flex / column
//
// Le parent direct étant une rangée, la barre s'affichait À CÔTÉ du champ — ses dix labels
// repliés sur quatre rangées dans une colonne étroite — et la pastille en seconde colonne.
// Les tests portent donc sur la POSITION des éléments dans l'arbre, seule chose que happy-dom
// puisse trancher : il sait de quel élément un nœud est enfant, jamais où il tombe à l'écran
// (cf. `check:subject-line`, qui existe pour l'autre moitié de la question).
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { EditorController } from '../src/editor-controller.js';
import { stackingMountFor } from '../src/ui/stacking.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 48,
};

/** Le composeur de la vue `…/changes`, avec les `display` mesurés portés en style inline —
 * happy-dom les rend par `getComputedStyle`, ce que le premier test de ce fichier suppose. */
const COMPOSER = `
  <div class="MarkdownEditor-module__container" style="display:flex;flex-direction:column">
    <div style="display:contents">
      <div class="AddCommentEditor-module__ConversationCommentBox" style="display:flex;flex-direction:column">
        <div style="display:contents">
          <div class="MarkdownInput-module__inputWrapper" style="display:flex;flex-direction:row">
            <div class="InlineAutocomplete-module__container" style="display:block">
              <span class="MarkdownInput-module__textArea" style="display:inline-flex;flex-direction:row">
                <textarea id="champ"></textarea>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

describe('stackingMountFor — où poser ce qui doit tomber au-dessus', () => {
  it('un parent qui empile déjà est retenu tel quel : le comportement d’avant', () => {
    document.body.innerHTML = '<div id="hote"><textarea id="champ"></textarea></div>';
    const mount = stackingMountFor(document.getElementById('champ')!)!;
    expect(mount.container.id).toBe('hote');
    expect((mount.anchor as HTMLElement).id).toBe('champ');
  });

  it('un parent en rangée est traversé jusqu’au premier ancêtre qui empile', () => {
    document.body.innerHTML = COMPOSER;
    const mount = stackingMountFor(document.getElementById('champ')!)!;
    expect(mount.container.className).toBe('InlineAutocomplete-module__container');
    expect((mount.anchor as HTMLElement).tagName).toBe('SPAN'); // l'enfant qui contient le champ
  });

  // `display: contents` n'a pas de boîte : y insérer ne déciderait de rien.
  it('un ancêtre en `contents` ne compte pas pour un conteneur', () => {
    document.body.innerHTML = `
      <div id="empile" style="display:block">
        <div style="display:contents">
          <span style="display:inline-flex"><textarea id="champ"></textarea></span>
        </div>
      </div>`;
    const mount = stackingMountFor(document.getElementById('champ')!)!;
    expect((mount.container as HTMLElement).id).toBe('empile');
  });

  it('sans ancêtre qui empile, rien n’est proposé — l’appelant garde son repli', () => {
    document.body.innerHTML = `
      <span style="display:inline-flex"><span style="display:inline-flex"><textarea id="champ"></textarea></span></span>`;
    expect(stackingMountFor(document.getElementById('champ')!, 2)).toBeNull();
  });
});

function attachOn(root: string): { toolbar: Element; feedback: Element; champ: HTMLTextAreaElement } {
  document.body.innerHTML = root;
  const champ = document.getElementById('champ') as HTMLTextAreaElement;
  const submit = document.createElement('button');
  submit.type = 'submit';
  champ.parentElement!.appendChild(submit);
  const editor: EditorHandle = {
    id: 'e1',
    element: champ,
    context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
  };
  const adapter: Partial<PlatformAdapter> = {
    platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
    getSubmitControls: (): SubmitControl[] => [{ element: submit, kind: 'submit' }],
    readValue: () => champ.value,
    writeValue: (_e, text, caret) => writeToTextField(champ, text, caret),
  };
  const config = defaultConfig();
  config.activation.activatedAt = '2026-09-01T00:00:00Z';
  new EditorController({
    adapter: adapter as PlatformAdapter,
    editor,
    resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
    published: null,
    lang: 'fr',
    currentUserLogin: 'alice',
  }).attach();
  return {
    toolbar: document.querySelector('.cct-toolbar')!,
    feedback: document.querySelector('.cct-feedback')!,
    champ,
  };
}

describe('§5.1 / §5.3 — barre et pastille dans le composeur de la nouvelle vue', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('la barre se pose dans le conteneur qui empile, jamais dans la rangée du champ', () => {
    const { toolbar, champ } = attachOn(COMPOSER);
    expect(toolbar.parentElement!.className).toBe('InlineAutocomplete-module__container');
    expect(champ.parentElement!.contains(toolbar)).toBe(false); // pas dans le <span> en rangée
    // Au-DESSUS : elle précède l'élément qui porte le champ.
    expect(toolbar.nextElementSibling).toBe(champ.parentElement);
  });

  it('la pastille se pose sous le champ, dans le même conteneur', () => {
    const { feedback, champ } = attachOn(COMPOSER);
    expect(feedback.parentElement!.className).toBe('InlineAutocomplete-module__container');
    expect(feedback.previousElementSibling).toBe(champ.parentElement);
  });

  it('sur un composeur dont le parent empile, rien ne change', () => {
    const { toolbar, feedback, champ } = attachOn('<div id="hote" style="display:block"><textarea id="champ"></textarea></div>');
    expect(toolbar.nextElementSibling).toBe(champ);
    expect(feedback.previousElementSibling).toBe(champ);
  });
});
