// Barre d'outils (§5.1) : un bouton par label actif, sélecteur de décoration segmenté
// construit depuis la configuration — un segment par décoration dont `forces` n'est pas
// null —, champ libre lorsque `decorations.allowFree` vaut true.

import { enabledLabels, type EffectiveConfig } from '@cct/core';
import { ui } from './strings.js';

export interface ToolbarOptions {
  config: EffectiveConfig;
  lang: string;
  onLabel: (label: string, decorations: string[], toggle: boolean) => void;
  onFreeDecoration: (decoration: string) => void;
}

// Les exemples d'infobulle sont localisés dans strings.ts (§5.1 : « dans la langue de
// l'interface »).

export function buildToolbar(opts: ToolbarOptions): HTMLElement {
  const doc = globalThis.document;
  const root = doc.createElement('div');
  root.className = 'cct-toolbar';
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', ui(opts.lang, 'toolbar.aria'));

  let selectedDecorations: string[] = [];
  let activeLabel: string | null = null;

  // Un bouton par label, avec icône, libellé et couleur distincts (§5.1).
  for (const label of enabledLabels(opts.config)) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'cct-label-button';
    button.dataset['label'] = label.id;
    button.textContent = `${label.icon ?? ''} ${label.id}`.trim();
    if (label.color) button.style.setProperty('--cct-label-color', label.color);
    // Infobulle : définition + exemple, dans la langue de l'interface (§5.1).
    const description = ui(opts.lang, `label.${label.id}`);
    const example = ui(opts.lang, `example.${label.id}`);
    button.title =
      example !== `example.${label.id}`
        ? `${description}\n${ui(opts.lang, 'label.example', { example })}`
        : description;
    button.addEventListener('click', () => {
      const toggle = activeLabel === label.id;
      opts.onLabel(label.id, selectedDecorations, toggle);
      activeLabel = toggle ? null : label.id;
      for (const b of root.querySelectorAll('.cct-label-button')) {
        b.setAttribute('aria-pressed', b === button && !toggle ? 'true' : 'false');
      }
    });
    button.setAttribute('aria-pressed', 'false');
    root.appendChild(button);
  }

  // Sélecteur de décoration segmenté : « aucune », puis un segment par décoration
  // porteuse de la configuration (§5.1).
  const group = doc.createElement('div');
  group.className = 'cct-decoration-group';
  group.setAttribute('role', 'radiogroup');
  const carriers = opts.config.decorations.known.filter((d) => d.forces !== null);
  const segments: { id: string | null; text: string }[] = [
    { id: null, text: ui(opts.lang, 'toolbar.decoration.none') },
    ...carriers.map((d) => ({ id: d.id, text: `(${d.id})` })),
  ];
  for (const segment of segments) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'cct-decoration-segment';
    b.textContent = segment.text;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', segment.id === null ? 'true' : 'false');
    b.addEventListener('click', () => {
      selectedDecorations = segment.id === null ? [] : [segment.id];
      for (const s of group.querySelectorAll('[role="radio"]')) {
        s.setAttribute('aria-checked', s === b ? 'true' : 'false');
      }
      if (activeLabel) opts.onLabel(activeLabel, selectedDecorations, false);
    });
    group.appendChild(b);
  }
  root.appendChild(group);

  // Champ libre lorsque decorations.allowFree vaut true — sans lui, les décorations
  // libres autorisées resteraient inaccessibles à la souris (§5.1).
  if (opts.config.decorations.allowFree) {
    const free = doc.createElement('input');
    free.type = 'text';
    free.className = 'cct-free-decoration';
    free.placeholder = ui(opts.lang, 'toolbar.decoration.free');
    free.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && free.value.trim() !== '') {
        e.preventDefault();
        opts.onFreeDecoration(free.value.trim().toLowerCase());
        free.value = '';
      }
    });
    root.appendChild(free);
  }

  return root;
}
