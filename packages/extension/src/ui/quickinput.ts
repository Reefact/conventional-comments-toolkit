// Saisie rapide au clavier (§5.2) : complétion `/` ou `:` en début de zone, liste
// filtrable, navigation ↑ ↓, validation Entrée/Tab, annulation Échap ; abréviations
// extensibles par Tab depuis `shortcuts.abbreviations` — l'unicité normative est celle
// de l'abréviation au moment où Tab est pressée (§5.2).

import { enabledLabels, type EffectiveConfig } from '@cct/core';
import type { EditorHandle, PlatformAdapter } from '@cct/adapter-shared';

export interface QuickInputOptions {
  editor: EditorHandle;
  adapter: PlatformAdapter;
  config: EffectiveConfig;
  lang: string;
}

export function attachQuickInput(opts: QuickInputOptions): { dispose: () => void } {
  const element = opts.editor.element as HTMLTextAreaElement;
  const doc = globalThis.document;

  let list: HTMLElement | null = null;
  let items: string[] = [];
  let selected = 0;

  const closeList = () => {
    list?.remove();
    list = null;
  };

  const openList = (filter: string) => {
    closeList();
    items = enabledLabels(opts.config)
      .map((l) => l.id)
      .filter((id) => id.startsWith(filter.toLowerCase()));
    if (items.length === 0) return;
    selected = 0;
    list = doc.createElement('ul');
    list.className = 'cct-quick-list';
    list.setAttribute('role', 'listbox');
    renderList();
    element.insertAdjacentElement('afterend', list);
  };

  const renderList = () => {
    if (!list) return;
    list.textContent = '';
    items.forEach((id, i) => {
      const li = doc.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === selected ? 'true' : 'false');
      li.textContent = `${id}: `;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        accept(id);
      });
      list!.appendChild(li);
    });
  };

  const accept = (id: string) => {
    // Remplace le déclencheur en début de zone par le préfixe complet.
    const value = element.value;
    const next = value.replace(/^[/:][A-Za-z]*/, `${id}: `);
    opts.adapter.writeValue(opts.editor, next, `${id}: `.length);
    closeList();
  };

  const onKeydown = (e: Event) => {
    const ke = e as KeyboardEvent;

    // Abréviations extensibles par Tab (§5.2) : le texte avant le curseur doit être
    // exactement une abréviation de la table au moment où Tab est pressée.
    if (ke.key === 'Tab' && !list) {
      const caret = element.selectionStart ?? 0;
      const before = element.value.slice(0, caret);
      const token = /(\S+)$/.exec(before)?.[1];
      // Object.hasOwn : une table venue de JSON ne doit jamais « étendre » constructor,
      // toString… hérités du prototype.
      const abbreviations = opts.config.shortcuts.abbreviations;
      const expansion =
        token !== undefined && Object.hasOwn(abbreviations, token) ? abbreviations[token] : undefined;
      if (token !== undefined && expansion !== undefined) {
        ke.preventDefault();
        const next = element.value.slice(0, caret - token.length) + expansion + element.value.slice(caret);
        opts.adapter.writeValue(opts.editor, next, caret - token.length + expansion.length);
        return;
      }
    }

    if (list) {
      if (ke.key === 'ArrowDown') {
        ke.preventDefault();
        selected = (selected + 1) % items.length;
        renderList();
        return;
      }
      if (ke.key === 'ArrowUp') {
        ke.preventDefault();
        selected = (selected - 1 + items.length) % items.length;
        renderList();
        return;
      }
      if (ke.key === 'Enter' || ke.key === 'Tab') {
        ke.preventDefault();
        accept(items[selected]!);
        return;
      }
      if (ke.key === 'Escape') {
        ke.preventDefault();
        closeList();
        return;
      }
    }
  };

  const onInput = () => {
    const value = element.value;
    // Déclencheur : `/` ou `:` en début de zone (§5.2).
    const m = /^[/:]([A-Za-z]*)$/.exec(value);
    if (m) openList(m[1]!);
    else closeList();
  };

  element.addEventListener('keydown', onKeydown);
  element.addEventListener('input', onInput);
  return {
    dispose: () => {
      element.removeEventListener('keydown', onKeydown);
      element.removeEventListener('input', onInput);
      closeList();
    },
  };
}
