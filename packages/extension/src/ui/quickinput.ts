// Saisie rapide au clavier (§5.2) : complétion `/` ou `:` en début de zone, liste
// filtrable, navigation ↑ ↓, validation Entrée/Tab, annulation Échap ; abréviations
// extensibles par Tab depuis `shortcuts.abbreviations` — l'unicité normative est celle
// de l'abréviation au moment où Tab est pressée (§5.2).

import { enabledLabels, matchPrefix, splitBody, type EffectiveConfig } from '@cct/core';
import type { EditorHandle, PlatformAdapter } from '@cct/adapter-shared';

export interface QuickInputOptions {
  editor: EditorHandle;
  adapter: PlatformAdapter;
  config: EffectiveConfig;
  lang: string;
  /** Label effectivement posé par la complétion. La saisie rapide écrit le préfixe
   * elle-même, sans passer par `insertPrefix()` du contrôleur : sans ce rappel, le compteur
   * « label utilisé » (§10) dépendait du chemin d'interaction — la barre d'outils et les
   * raccourcis directs comptaient, la complétion `/` ou `:` non (revue Codex, PR #31). */
  onLabelAccepted?: (id: string) => void;
}

/** Le label que ce commentaire porte MAINTENANT, ou `null` — lu sur le RÉSULTAT, jamais sur
 * le dépliement seul.
 *
 * Deux versions successives se sont trompées d'objet. La première inspectait le texte
 * déplié et acceptait `TODO(perf) `, qui n'est pas un préfixe. La seconde l'inspectait
 * correctement, mais une abréviation se déplie À N'IMPORTE QUELLE POSITION : `?i` frappée
 * après « Some text » insère `issue: ` en milieu de ligne, où ce n'est le préfixe de rien —
 * et le compteur l'enregistrait quand même (revue Codex, PR #31).
 *
 * La question à poser n'est donc pas « ce texte ressemble-t-il à un préfixe ? » mais « le
 * commentaire porte-t-il ce préfixe, une fois l'insertion faite ? ». Elle se pose à `core/`
 * — `splitBody()` isole la ligne de préfixe au sens du §3.4.1, `matchPrefix()` y applique la
 * regex de référence — et la réponse ne dépend plus de l'endroit où la personne a frappé. */
function labelPosedBy(value: string, expansion: string, config: EffectiveConfig): string | null {
  const expanded = matchPrefix(expansion.trim())?.label.toLowerCase();
  if (expanded === undefined) return null;
  // `prefixLine` est `null` quand le corps n'a aucune ligne éligible (tout en citation, en
  // bloc de code, ou vide) : il n'y a alors aucun préfixe, donc rien à compter.
  const prefixLine = splitBody(value).prefixLine;
  const posed = prefixLine === null ? undefined : matchPrefix(prefixLine)?.label.toLowerCase();
  // Le préfixe du commentaire doit être CELUI que ce dépliement vient de poser : sinon on
  // compterait un label déjà présent à chaque abréviation frappée ailleurs dans le texte.
  if (posed !== expanded) return null;
  return enabledLabels(config).some((l) => l.id === posed) ? posed : null;
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
    opts.onLabelAccepted?.(id);
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
        // Une abréviation qui se déplie en un LABEL en pose un, exactement comme la liste de
        // complétion ou la barre d'outils. Seul le chemin de la liste avait été câblé, si
        // bien que `?i` → `issue: ` restait invisible du compteur — l'usage des labels
        // dépendait encore de la façon dont on les pose (revue Codex, PR #31).
        const posed = labelPosedBy(next, expansion, opts.config);
        if (posed !== null) opts.onLabelAccepted?.(posed);
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
