// Retour visuel temps réel (§5.3) : pastille permanente, messages énumérant TOUS les
// diagnostics dans l'ordre du §3.5.1 avec leur correction, zone aria-live polite,
// bordure colorée, aucun layout shift (hauteur réservée en CSS).

import type { CommentAnalysis, Diagnostic } from '@cct/core';
import type { FeedbackState } from '../guard.js';
import { ui } from './strings.js';

const STATE_ICONS: Record<FeedbackState, string> = {
  compliant: '✅',
  'compliant-with-warnings': '⚠\uFE0F',
  'non-compliant': '❌',
  degraded: '⚠\uFE0F',
  'fingerprint-mismatch': '⚠\uFE0F',
};

export interface FeedbackRender {
  state: FeedbackState;
  diagnostics: Diagnostic[];
  aliasRewrite: CommentAnalysis['aliasRewrite'];
  onFix: (replacement: string) => void;
}

export class FeedbackView {
  #root: HTMLElement;
  #pastille: HTMLElement;
  #live: HTMLElement;
  #list: HTMLElement;
  #editor: Element;
  #lang: string;

  constructor(editor: Element, lang: string) {
    this.#editor = editor;
    this.#lang = lang;
    const doc = globalThis.document;
    this.#root = doc.createElement('div');
    this.#root.className = 'cct-feedback';
    this.#pastille = doc.createElement('span');
    this.#pastille.className = 'cct-pastille';
    // Motif du blocage annoncé dans une zone aria-live polite (§5.4).
    this.#live = doc.createElement('div');
    this.#live.className = 'cct-live sr-only';
    this.#live.setAttribute('aria-live', 'polite');
    this.#list = doc.createElement('ul');
    this.#list.className = 'cct-diagnostics';
    this.#root.append(this.#pastille, this.#list, this.#live);
    editor.insertAdjacentElement('afterend', this.#root);
    const id = `cct-fb-${Math.floor(performance.now())}-${Math.floor(Math.random() * 1e6)}`;
    this.#root.id = id;
    // Messages d'erreur associés au champ (§10, accessibilité).
    editor.setAttribute('aria-describedby', id);
  }

  render(r: FeedbackRender): void {
    // L'icône ne porte jamais seule l'information : texte systématique (§10).
    this.#pastille.textContent = `${STATE_ICONS[r.state]} ${ui(this.#lang, `pastille.${r.state}`)}`;
    this.#pastille.dataset['state'] = r.state;
    // Bordure de la zone de saisie colorée selon l'état (§5.3).
    (this.#editor as HTMLElement).classList.remove(
      'cct-border-ok',
      'cct-border-warn',
      'cct-border-error'
    );
    (this.#editor as HTMLElement).classList.add(
      r.state === 'compliant' ? 'cct-border-ok' : r.state === 'non-compliant' ? 'cct-border-error' : 'cct-border-warn'
    );

    // Le message les énumère TOUS, dans l'ordre de restitution, chacun avec sa
    // correction quand elle est calculable (§5.3).
    this.#list.textContent = '';
    const doc = globalThis.document;
    for (const d of r.diagnostics) {
      const li = doc.createElement('li');
      li.dataset['code'] = d.code;
      li.dataset['severity'] = d.severity;
      const text = doc.createElement('span');
      text.textContent = `${d.code} — ${d.message}`;
      li.appendChild(text);
      if (d.fix) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'cct-fix';
        button.textContent = ui(this.#lang, 'fix.apply');
        const replacement = d.fix.replacement;
        button.addEventListener('click', () => r.onFix(replacement));
        li.appendChild(button);
      }
      this.#list.appendChild(li);
    }
    // Réécriture d'alias : commodité d'édition, jamais une correction (§8.2).
    if (r.aliasRewrite) {
      const li = doc.createElement('li');
      li.className = 'cct-alias';
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = ui(this.#lang, 'alias.rewrite', {
        from: r.aliasRewrite.from,
        to: r.aliasRewrite.to,
      });
      const replacement = r.aliasRewrite.replacement;
      button.addEventListener('click', () => r.onFix(replacement));
      li.appendChild(button);
      this.#list.appendChild(li);
    }
  }

  announceBlocked(diagnostics: Diagnostic[]): void {
    const details = diagnostics.map((d) => `${d.code} — ${d.message}`).join(' ');
    this.#live.textContent = ui(this.#lang, 'guard.blocked', { details });
  }

  dispose(): void {
    this.#root.remove();
    this.#editor.removeAttribute('aria-describedby');
  }
}
