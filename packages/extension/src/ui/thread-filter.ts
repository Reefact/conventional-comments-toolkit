// Filtre local par label « dans la liste des fils de discussion » (§5.5) — le contrôle vit
// donc AVEC ce qu'il contrôle, en tête des fils rendus, et non dans le bandeau : un objet
// d'information n'héberge pas un outil d'action, et le bandeau n'a plus besoin d'exister
// sur une PR sans fil bloquant juste pour lui servir d'hôte.
//
// Le bandeau, lui, n'est plus filtré : il résume ce qui bloque la complétion, et son
// décompte fait autorité (CA-03). Une liste qui rétrécit sous un filtre de lecture
// contredirait le nombre affiché juste au-dessus d'elle.
//
// Purement visuel : aucun appel réseau, aucun contenu stocké modifié, aucun DOM de fil
// réécrit — seulement un `display` posé et repris.

import { ui } from './strings.js';

export interface ThreadFilterOptions {
  /** Labels proposés, dans l'ordre de la configuration. */
  labels: string[];
  lang: string;
  /** Sélection à restaurer ; null = tous. */
  selected: string | null;
  onSelect: (labelId: string | null) => void;
}

/** Barre de puces : les labels sont peu nombreux, le choix se voit sans être ouvert, et
 * l'état actif reste lisible pendant qu'on parcourt les fils — ce qu'un menu déroulant,
 * refermé sur sa valeur, ne donne pas. */
export function renderThreadFilter(options: ThreadFilterOptions): HTMLElement {
  const doc = globalThis.document;
  const root = doc.createElement('div');
  root.className = 'cct-thread-filter';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', ui(options.lang, 'filter.aria'));

  const chip = (labelId: string | null, text: string): HTMLElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'cct-filter-chip';
    button.dataset['label'] = labelId ?? '';
    button.textContent = text;
    // `aria-pressed` plutôt qu'une classe seule : l'état actif doit être lu, pas seulement vu (§10).
    button.setAttribute('aria-pressed', String(options.selected === labelId));
    button.addEventListener('click', () => options.onSelect(labelId));
    return button;
  };

  root.appendChild(chip(null, ui(options.lang, 'filter.all')));
  for (const id of options.labels) root.appendChild(chip(id, id));
  return root;
}

/** Marqueur posé sur un fil de PAGE masqué par ce filtre (`data-cct-filtered`). Porte la
 * valeur ORIGINALE de `style.display` (chaîne vide comprise) capturée juste avant de la
 * remplacer par `none` : restaurer un simple `''` perdrait un display en ligne non vide
 * posé par la plateforme (`grid`, `flex`…) pour ses propres raisons de mise en page.
 * Présence de l'attribut — `!== undefined`, jamais un test de vérité — distingue « masqué
 * par nous » de « jamais touché », y compris quand la valeur capturée est elle-même la
 * chaîne vide. */
const FILTERED_MARKER = 'cctFiltered';

/** Masque les fils rendus de la page dont le label ne correspond pas. `labelId` null = tous. */
export function applyLabelFilter(
  renderedThreads: { id: string; element: Element }[],
  labelOfThread: Map<string, string | null>,
  labelId: string | null
): void {
  for (const { id, element } of renderedThreads) {
    const el = element as HTMLElement;
    const visible = labelId === null || labelOfThread.get(id) === labelId;
    if (!visible) {
      if (el.dataset[FILTERED_MARKER] === undefined) el.dataset[FILTERED_MARKER] = el.style.display;
      el.style.display = 'none';
    } else if (el.dataset[FILTERED_MARKER] !== undefined) {
      // Seulement si CE filtre l'avait masqué : sinon, ne pas toucher à un `display` que la
      // plateforme porte pour ses propres raisons. Restaure la valeur D'ORIGINE, pas une
      // chaîne vide — un `display: grid` posé par la plateforme doit revenir tel quel.
      el.style.display = el.dataset[FILTERED_MARKER]!;
      delete el.dataset[FILTERED_MARKER];
    }
  }
}

/** Restaure la visibilité des fils de page masqués par un `applyLabelFilter` antérieur —
 * jamais ceux masqués par la plateforme elle-même (§5.5). Appelé avant de reconstruire la
 * barre : le nouveau filtre repart sur « tous », les fils qu'il avait masqués ne doivent
 * pas rester orphelins, cachés pour rien. */
export function clearLabelFilter(renderedThreads: { id: string; element: Element }[]): void {
  for (const { element } of renderedThreads) {
    const el = element as HTMLElement;
    if (el.dataset[FILTERED_MARKER] !== undefined) {
      el.style.display = el.dataset[FILTERED_MARKER]!;
      delete el.dataset[FILTERED_MARKER];
    }
  }
}
