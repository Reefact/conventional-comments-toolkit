// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';
import { writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function setup(mode: 'enforce' | 'warn' = 'enforce') {
  const host = document.createElement('div');
  const textarea = document.createElement('textarea');
  const submit = document.createElement('button');
  submit.type = 'submit';
  host.append(textarea, submit);
  document.body.appendChild(host);

  const editor: EditorHandle = {
    id: 'e1',
    element: textarea,
    context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
  };

  const adapter: Partial<PlatformAdapter> = {
    platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion', slashPrefixes: [] }),
    getSubmitControls: (): SubmitControl[] => [{ element: submit, kind: 'submit' }],
    readValue: () => textarea.value,
    writeValue: (_e, text, caret) => writeToTextField(textarea, text, caret),
  };

  const config = defaultConfig();
  config.mode = mode;
  config.activation.activatedAt = '2026-09-01T00:00:00Z';

  const controller = new EditorController({
    adapter: adapter as PlatformAdapter,
    editor,
    resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
    published: null,
    lang: 'fr',
    currentUserLogin: 'alice',
  });
  return { controller, textarea, submit, host };
}

describe('§9.3 — écriture programmatique (setter natif + input)', () => {
  it('déclenche un événement input qui remonte', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const handler = vi.fn();
    textarea.addEventListener('input', handler);
    writeToTextField(textarea, 'issue: x', 8);
    expect(textarea.value).toBe('issue: x');
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('§5 — contrôleur d’éditeur', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('§5.1 : injecte une barre d’outils au-dessus de la zone (un bouton par label actif)', () => {
    const { controller, host } = setup();
    controller.attach();
    const toolbar = host.querySelector('.cct-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.querySelectorAll('.cct-label-button')).toHaveLength(10);
    controller.dispose();
  });

  it('§5.3 : rend une pastille et les diagnostics sous la zone', async () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const pastille = host.querySelector('.cct-pastille');
    expect(pastille?.getAttribute('data-state')).toBe('non-compliant');
    expect(host.querySelector('.cct-diagnostics li[data-code="E-NO-LABEL"]')).not.toBeNull();
    controller.dispose();
  });

  it('§5.4 : bouton marqué aria-disabled (jamais l’attribut natif disabled), clic intercepté', async () => {
    const { controller, textarea, submit } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(submit.hasAttribute('disabled')).toBe(false); // CA-12 : reste atteignable au clavier
    let clicked = false;
    submit.addEventListener('click', () => (clicked = true));
    submit.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    expect(clicked).toBe(false); // interception en capture
    controller.dispose();
  });

  it('§5.4 : Ctrl+Entrée intercepté quand le commentaire est en erreur (§4.3)', async () => {
    const { controller, textarea } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    controller.dispose();
  });

  it('CA-02 : clic sur un label insère le préfixe et conserve le texte', async () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    writeToTextField(textarea, 'le nom est ambigu');
    const issueButton = [...host.querySelectorAll('.cct-label-button')].find(
      (b) => b.getAttribute('data-label') === 'issue'
    ) as HTMLButtonElement;
    issueButton.click();
    expect(textarea.value).toBe('issue: le nom est ambigu');
    controller.dispose();
  });

  it('mode warn : diagnostics affichés, jamais de blocage (CA-09)', async () => {
    const { controller, textarea, submit } = setup('warn');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    controller.dispose();
  });

  it('correction en un clic : réécrit la ligne de préfixe (§5.3)', async () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    writeToTextField(textarea, 'Issue: le nom est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const fix = host.querySelector('.cct-fix') as HTMLButtonElement;
    expect(fix).not.toBeNull();
    fix.click();
    expect(textarea.value).toBe('issue: le nom est ambigu');
    controller.dispose();
  });
});
