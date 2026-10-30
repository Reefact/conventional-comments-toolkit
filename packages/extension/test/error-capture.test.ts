// @vitest-environment happy-dom
//
// Les exceptions de l'extension, relevées AVEC ce que le code faisait (§9.4, CA-11).
//
// Un gestionnaire global ne voit que l'exception, après coup : un message et une pile. Le
// contexte — « pendant l'affichage de la page », « pendant la gestion d'un champ de commentaire »
// — n'existe qu'au point d'appel, d'où `guarded()` aux points d'entrée. Ces tests tiennent les
// deux étages ensemble : ce que `guarded` relève, ce que le filet attrape, et qu'une exception
// que les deux voient n'est comptée qu'une fois.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { NEUTRAL_EDITOR_CHROME, writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { captureErrors, guarded, listen, type CapturedError, type ErrorCapture } from '../src/error-capture.js';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';

let capture: ErrorCapture | null = null;
let recorded: CapturedError[] = [];

beforeEach(() => {
  recorded = [];
  capture = captureErrors(window, (error) => recorded.push(error));
});

afterEach(() => {
  capture?.stop();
  capture = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/** Ce que le navigateur fait d'une exception qu'aucun enrobage n'a relevée. */
const escapes = (error: unknown) =>
  window.dispatchEvent(new ErrorEvent('error', { error, message: String(error) }));

describe('§9.4 — `guarded` relève une exception avec son contexte, puis la relance', () => {
  it('synchrone : relevée avec son contexte, et la MÊME exception ressort', () => {
    const boom = new TypeError('x is undefined');
    const run = guarded('render', () => {
      throw boom;
    });

    expect(() => run()).toThrow(boom);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ message: 'TypeError: x is undefined', context: 'render' });
  });

  it('une promesse rejetée est relevée, puis rejetée de nouveau', async () => {
    const boom = new Error('config unreadable');
    const run = guarded('config', async () => {
      throw boom;
    });

    await expect(run()).rejects.toBe(boom);
    expect(recorded).toEqual([expect.objectContaining({ message: 'Error: config unreadable', context: 'config' })]);
  });

  it('une fonction qui réussit rend sa valeur, avec ses arguments et son receveur', () => {
    const target = {
      factor: 3,
      times: guarded('editor', function (this: { factor: number }, n: number) {
        return n * this.factor;
      }),
    };

    expect(target.times(4)).toBe(12);
    expect(recorded).toHaveLength(0);
  });

  it('sans relevé actif, la fonction se comporte comme avant — elle lève, rien ne plante de plus', () => {
    capture?.stop();
    capture = null;
    const run = guarded('render', () => {
      throw new Error('after stop');
    });

    expect(() => run()).toThrow('after stop');
    expect(recorded).toHaveLength(0);
  });
});

describe('§9.4 — deux étages, une seule ligne par exception', () => {
  it('une exception relevée par un enrobage puis revue par le filet n’est comptée qu’une fois', () => {
    const boom = new Error('seen twice');
    const run = guarded('editor', () => {
      throw boom;
    });
    try {
      run();
    } catch {
      // Ce que fait le navigateur ensuite : l'exception, relancée, atteint `window`.
      escapes(boom);
    }

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.context).toBe('editor'); // celle de l'enrobage, pas une ligne sans contexte
  });

  it('ce qui échappe à tout enrobage est relevé quand même, SANS contexte', () => {
    escapes(new Error('nobody wrapped me'));

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.context).toBeUndefined();
  });

  it('le même message levé pendant deux choses différentes fait deux lignes', () => {
    for (const context of ['render', 'config'] as const) {
      try {
        guarded(context, () => {
          throw new Error('same message');
        })();
      } catch {
        // relevée, relancée : seule la ligne relevée nous intéresse
      }
    }

    expect(recorded.map((e) => e.context)).toEqual(['render', 'config']);
  });

  it('le même message, au même contexte, n’écrit qu’une ligne — pas une par tour de boucle', () => {
    const run = guarded('render', () => {
      throw new Error('loop');
    });
    for (let i = 0; i < 20; i++) {
      try {
        run();
      } catch {
        // relancée à chaque fois, comme avant
      }
    }

    expect(recorded).toHaveLength(1);
  });
});

describe('§9.4 — `listen` pose un écouteur enrobé, et rend celui qu’il faut retirer', () => {
  it('une exception de l’écouteur est relevée avec son contexte', () => {
    const button = document.createElement('button');
    document.body.append(button);
    listen('render', button, 'click', () => {
      throw new Error('handler failed');
    });

    try {
      button.click();
    } catch {
      // happy-dom peut la relancer jusqu'ici ; un navigateur la signale à `window`
    }

    expect(recorded).toEqual([expect.objectContaining({ message: 'Error: handler failed', context: 'render' })]);
  });

  it('l’écouteur rendu se retire : il n’agit plus après removeEventListener', () => {
    const button = document.createElement('button');
    document.body.append(button);
    const calls = vi.fn();
    const wrapped = listen('editor', button, 'click', calls);

    button.click();
    button.removeEventListener('click', wrapped as EventListener);
    button.click();

    expect(calls).toHaveBeenCalledTimes(1);
  });
});

// Le CÂBLAGE : que les points d'entrée du contrôleur soient réellement enrobés. Un test de
// `guarded` seul passerait avec un contrôleur qui ne l'appelle nulle part.
describe('§9.4 — un champ de commentaire qui plante est relevé « pendant la gestion d’un champ »', () => {
  const pr: PrRef = {
    platform: 'github',
    createdAt: '2026-10-01T00:00:00Z',
    host: 'github.com',
    scope: ['acme', 'demo'],
    number: 42,
  };

  /** Un contrôleur attaché, dont la lecture du champ peut être cassée à volonté. */
  function attachedController() {
    const host = document.createElement('div');
    const textarea = document.createElement('textarea');
    const submit = document.createElement('button');
    submit.type = 'submit';
    host.append(textarea, submit);
    document.body.appendChild(host);

    let broken = false;
    const adapter: Partial<PlatformAdapter> = {
      platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
      getEditorChrome: () => ({ ...NEUTRAL_EDITOR_CHROME, framedContainer: host }),
      getSubmitControls: (): SubmitControl[] => [{ element: submit, kind: 'submit' }],
      readValue: () => {
        if (broken) throw new Error('field unreadable');
        return textarea.value;
      },
      writeValue: (_e, text, caret) => writeToTextField(textarea, text, caret),
    };
    const editor: EditorHandle = {
      id: 'e1',
      element: textarea,
      context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
    };
    const config = defaultConfig();
    config.mode = 'enforce';
    config.activation.activatedAt = '2026-09-01T00:00:00Z';
    const controller = new EditorController({
      adapter: adapter as PlatformAdapter,
      editor,
      resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
      published: null,
      lang: 'fr',
      currentUserLogin: 'alice',
    });
    controller.attach();
    return { textarea, submit, breakField: () => (broken = true) };
  }

  const swallow = (fn: () => void) => {
    try {
      fn();
    } catch {
      // un navigateur signale l'exception à `window` ; happy-dom peut la relancer ici
    }
  };

  it('le raccourci d’envoi (Ctrl+Entrée) : relevé avec le contexte `editor`', () => {
    const { textarea, breakField } = attachedController();
    breakField();

    swallow(() =>
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    );

    expect(recorded.map((e) => e.context)).toContain('editor');
    expect(recorded.find((e) => e.context === 'editor')!.message).toContain('field unreadable');
  });

  it('le clic sur le bouton d’envoi : relevé avec le contexte `editor`', () => {
    const { submit, breakField } = attachedController();
    breakField();

    swallow(() => submit.click());

    expect(recorded.map((e) => e.context)).toContain('editor');
  });

  it('la validation débattue pendant la frappe : relevée avec le contexte `editor`', () => {
    vi.useFakeTimers();
    const { textarea, breakField } = attachedController();
    breakField();

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    swallow(() => vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS + 10));

    expect(recorded.map((e) => e.context)).toContain('editor');
  });
});
