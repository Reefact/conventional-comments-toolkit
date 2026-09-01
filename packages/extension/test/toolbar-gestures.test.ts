// @vitest-environment happy-dom
//
// LA BARRE D'OUTILS PAR LE GESTE (§5.1) — et non par ses fonctions.
//
// Les quatre défauts que ce fichier verrouille ont été trouvés par un utilisateur, pas par
// la suite, et ils avaient tous la même forme : invisibles à un test qui appelle
// `insertPrefix()` ou `computePrefixInsertion()` directement, évidents à un test qui
// CLIQUE. Le segment « aucune » n'effaçait rien ; le sélecteur entier était inerte sur un
// commentaire déjà labellisé ; le radiogroup affichait « aucune » sur un commentaire
// décoré ; le champ libre perdait en silence ce qu'on venait d'y taper dès qu'on en
// sortait.
//
// Un test par API aurait pu passer sur les quatre : chacun appelle la fonction avec les
// arguments que la barre, elle, n'envoyait justement pas. C'est le même angle mort que la
// revue de la PR #31 avait nommé pour la télémétrie — les tests y étaient rangés par
// contrat de module, jamais par ce qui arrive à un onglet. Ici : jamais par ce que fait
// une personne devant l'éditeur.

import { describe, expect, it, beforeEach } from 'vitest';
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

function setup() {
  const host = document.createElement('div');
  const textarea = document.createElement('textarea');
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
  return { controller, textarea };
}

/** Les gestes, nommés comme la personne les ferait. */
const clickLabel = (id: string): void =>
  (document.querySelector(`.cct-label-button[data-label="${id}"]`) as HTMLElement).click();

/** Le sélecteur segmenté : `null` désigne le premier segment, « aucune ». */
function clickDecoration(id: string | null): void {
  const segments = [...document.querySelectorAll('.cct-decoration-segment')] as HTMLElement[];
  const target = id === null ? segments[0] : segments.find((s) => s.textContent === `(${id})`);
  expect(target, `segment ${id ?? 'aucune'} absent de la barre`).toBeDefined();
  target!.click();
}

const freeField = (): HTMLInputElement =>
  document.querySelector('.cct-free-decoration') as HTMLInputElement;

const checkedSegment = (): string | null =>
  document.querySelector('.cct-decoration-segment[aria-checked="true"]')?.textContent ?? null;

/** Écrire À LA MAIN, puis laisser la validation débattue passer : c'est ainsi qu'arrive un
 * commentaire que la barre n'a jamais vu poser. */
async function typeByHand(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  writeToTextField(textarea, value, value.length);
  await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 20));
}

describe('§5.1 — le sélecteur de décoration, au clic', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('« aucune » RETIRE la décoration écrite', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    clickDecoration('blocking');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');

    clickDecoration(null);
    expect(textarea.value).toBe('issue: le nom est ambigu');
  });

  it('changer de décoration remplace, sans empiler', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    clickDecoration('blocking');
    clickDecoration('non-blocking');
    expect(textarea.value).toBe('issue (non-blocking): le nom est ambigu');
  });

  // Le sélecteur n'agissait que sur un label CLIQUÉ dans la même session d'édition. Un
  // commentaire rouvert, tapé à la main ou posé par la complétion n'avait laissé aucun clic
  // derrière lui : toute la barre de décoration était alors sans effet, silencieusement.
  it('agit sur un commentaire déjà labellisé, qu’aucun clic n’a posé', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue: le nom est ambigu');

    clickDecoration('blocking');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');
  });

  // Et sans attendre : la barre se réaligne à la validation DÉBATTUE (150 ms), donc entre la
  // frappe et ce réalignement il existe une fenêtre où ce qu'elle a mémorisé est en retard
  // sur le texte. Quelqu'un qui tape vite y clique. C'est pour cette fenêtre-là que le clic
  // relit le texte au lieu de se fier à ce que la barre croit savoir — un test qui attend
  // toujours la validation ne peut pas l'exprimer.
  it('agit aussi AVANT la validation débattue, sur un texte plus récent que la barre', () => {
    const { textarea } = setup();
    writeToTextField(textarea, 'issue: le nom est ambigu', 24); // pas d'attente : refresh non encore passé

    clickDecoration('blocking');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');
  });

  // CA-02 doit tenir PAR LE GESTE, et pas seulement dans la fonction : c'est le clic sur un
  // label que le critère décrit.
  it('CA-02 : poser un autre label conserve la décoration écrite', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');

    clickLabel('todo');
    expect(textarea.value).toBe('todo (blocking): le nom est ambigu');
  });

  it('ce que la barre MONTRE est ce que le commentaire porte', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');
    expect(checkedSegment()).toBe('(blocking)');

    clickDecoration(null);
    expect(checkedSegment()).toBe('aucune');
    expect(textarea.value).toBe('issue: le nom est ambigu');
  });

  it('une décoration sans segment ne fait cocher AUCUN segment — surtout pas « aucune »', async () => {
    const { textarea } = setup();
    // `(perf)` est descriptive : elle n'a pas de segment, et prétendre « aucune » serait
    // affirmer qu'il n'y a pas de décoration alors qu'il y en a une.
    await typeByHand(textarea, 'issue (perf): le nom est ambigu');
    expect(checkedSegment()).toBeNull();
  });
});

describe('§5.1 — le champ de décoration libre', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('Tab pose la décoration au lieu de la perdre', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');

    const free = freeField();
    free.value = 'perf';
    free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(textarea.value).toBe('issue (perf): le nom est ambigu');
    expect(free.value).toBe('');
  });

  it('quitter le champ la pose aussi — cliquer ailleurs n’efface plus le travail', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');

    const free = freeField();
    free.value = 'ux';
    free.dispatchEvent(new Event('blur', { bubbles: false }));
    expect(textarea.value).toBe('issue (ux): le nom est ambigu');
  });

  it('Tab ne bloque pas le déplacement du focus (§5.1, CA-12)', () => {
    setup();
    const free = freeField();
    free.value = 'perf';
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    free.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  // §3.3 : la forme d'une décoration est structurelle, indépendante de `allowFree`. Sur
  // Entrée, poser « perf critique » était une faute délibérée ; sur une perte de focus, ce
  // serait un accident — d'où un champ qui GARDE ce qu'il ne peut pas poser.
  it('une forme illégale n’est ni posée ni jetée : elle reste, signalée', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    const before = textarea.value;

    const free = freeField();
    free.value = 'perf critique';
    free.dispatchEvent(new Event('blur', { bubbles: false }));
    expect(textarea.value).toBe(before);
    expect(free.value).toBe('perf critique');
    expect(free.getAttribute('aria-invalid')).toBe('true');

    // Et corriger la saisie lève le signalement.
    free.value = 'perf-critique';
    free.dispatchEvent(new Event('input', { bubbles: true }));
    expect(free.getAttribute('aria-invalid')).toBeNull();
  });

  it('un champ vide quitté ne pose rien', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    const before = textarea.value;

    const free = freeField();
    free.dispatchEvent(new Event('blur', { bubbles: false }));
    expect(textarea.value).toBe(before);
  });
});
