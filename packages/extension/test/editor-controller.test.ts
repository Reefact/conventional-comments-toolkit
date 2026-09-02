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
  // Génération React du CommentBox GitHub (cf. selectors.ts, `class*="CommentBox"`) : c'est
  // le cas par défaut que la plupart des tests exercent ; voir plus bas pour le cas où cette
  // classe est absente (DOM hérité, Azure DevOps).
  textarea.className = 'CommentBox-input';
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
    platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
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

  it('marque le conteneur et la zone pour le retrait intérieur, et les démarque à dispose()', () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    // Le retrait n'est posé que sur les boîtes réellement instrumentées : un sélecteur
    // visant le conteneur de la plateforme restylerait aussi celles qu'on ne touche pas.
    expect(host.classList.contains('cct-host')).toBe(true);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
    // Rien de ce que attach() pose ne doit survivre au détachement.
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(false);
  });

  it('ne pose pas le retrait hors du CommentBox GitHub moderne (DOM hérité, Azure DevOps)', () => {
    const { controller, textarea, host } = setup();
    // Aucun conteneur borderless ni padding propre à neutraliser sur ces éditeurs (§ci-dessus
    // dans editor-controller.ts) : la zone de saisie porte sa propre bordure et son propre
    // padding, que ce retrait effacerait à tort.
    textarea.className = 'comment-textarea';
    controller.attach();
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(false);
    controller.dispose();
  });

  it('pose le retrait sur le composeur React reconnu par data-testid, sans classe CommentBox', () => {
    const { controller, textarea, host } = setup();
    // Second sélecteur candidat de la même génération React dans selectors.ts
    // (`div[data-testid*="comment-composer"] textarea`) : le composeur, et non la classe
    // du textarea, porte l'indice de reconnaissance.
    textarea.className = '';
    host.setAttribute('data-testid', 'comment-composer-foo');
    controller.attach();
    expect(host.classList.contains('cct-host')).toBe(true);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
  });

  it('pose le retrait sur le composeur lui-même, pas sur un wrapper intermédiaire, quand la zone de saisie y est nichée', () => {
    const { controller, textarea, host } = setup();
    // Le sélecteur `div[data-testid*="comment-composer"] textarea` est un sélecteur
    // descendant : la zone de saisie peut être nichée sous un wrapper intermédiaire (ici
    // `host`, qui reste le parent direct utilisé pour insérer la barre d'outils) distinct
    // du composeur qui doit recevoir le retrait — en-tête et onglets natifs sont à son
    // niveau, pas à celui du wrapper.
    textarea.className = '';
    const composer = document.createElement('div');
    composer.setAttribute('data-testid', 'comment-composer-foo');
    host.replaceWith(composer);
    composer.appendChild(host);
    controller.attach();
    expect(composer.classList.contains('cct-host')).toBe(true);
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
    expect(composer.classList.contains('cct-host')).toBe(false);
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

  it('revue Codex, PR #39 : updateResolved() applique une configuration nouvelle à un éditeur déjà attaché, sans le réattacher', async () => {
    const { controller, textarea, submit } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true'); // bloqué sous la config initiale

    // La configuration change PENDANT que l'éditeur reste ouvert (assouplissement du mode,
    // §8.1.3, ligne « Élargissant ») — un scénario que seul `updateResolved()` peut refléter :
    // `deps.resolved`, capturé une fois pour toutes à `attach()`, ne se relit jamais tout seul.
    const offConfig = defaultConfig();
    offConfig.mode = 'off';
    offConfig.activation.activatedAt = '2026-09-01T00:00:00Z';
    controller.updateResolved({ config: offConfig, notices: [], fingerprint: 'cccc3333', degraded: false });

    // Sans le correctif, ce même éditeur continuerait de bloquer sur la configuration
    // périmée jusqu'à sa fermeture/réouverture ou au rechargement de la page.
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
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
