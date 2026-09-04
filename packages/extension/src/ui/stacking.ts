// Où poser ce que le §5.1 veut AU-DESSUS du champ de saisie, et le §5.3 en dessous.
//
// Les deux se posaient jusqu'ici comme frères immédiats du champ, dans son parent direct.
// C'est correct tant que ce parent EMPILE ses enfants — vrai du DOM hérité de GitHub et
// d'Azure DevOps, faux sur la vue `/pull/N/changes`, où le parent direct du `<textarea>` est
// un `<span>` Primer en `inline-flex` (MESURÉ : `getComputedStyle` de la chaîne d'ancêtres,
// 2026-09-04). La barre d'outils y devenait une colonne À CÔTÉ du champ, ses dix labels
// repliés sur quatre rangées, et la pastille de retour une seconde colonne à droite.
//
// D'où ce module : plutôt que de nommer le conteneur d'une plateforme — un nom de plus qui
// vieillirait —, on remonte jusqu'au premier ancêtre qui empile réellement ses enfants, et on
// insère devant celui de ses enfants qui contient le champ. Sur un DOM où le parent direct
// empile déjà, la boucle s'arrête au premier tour : la géométrie d'avant est conservée à
// l'identique, ce que le premier test ci-contre vérifie.
export interface StackingMount {
  /** L'ancêtre qui empile — c'est lui qui reçoit l'insertion. */
  container: Element;
  /** Son enfant qui contient le champ : la barre se pose devant, la pastille derrière. */
  anchor: Element;
}

/** Remonte au plus `limit` niveaux. Rend `null` si aucun ancêtre ne convient — l'appelant
 * retombe alors sur le parent direct, c'est-à-dire sur le comportement d'avant : ne rien
 * savoir ne doit jamais faire pire que ce qui existait.
 *
 * DEUX conditions, et la seconde a été ajoutée en regardant le résultat de la première dans
 * le navigateur : un ancêtre qui empile ses enfants mais qui est lui-même ENFERMÉ DANS UNE
 * RANGÉE ne fait pas un bon hôte. Sur la vue `…/changes`, le premier ancêtre à empiler est
 * `InlineAutocomplete-module__container` (`display: block`), mais son parent
 * `MarkdownInput-module__inputWrapper` est une rangée : la barre y tombait bien au-dessus du
 * champ, à la largeur de la seule colonne du champ. Un cran plus haut,
 * `AddCommentEditor-module__ConversationCommentBox` empile ET vit dans une colonne : la barre
 * y prend la largeur du composeur, ce que le §5.1 décrit.
 *
 * Conséquence assumée : sur un DOM où le parent direct empile mais tient dans une rangée, le
 * point d'ancrage remonte lui aussi d'un cran. C'est voulu — c'est exactement le cas où la
 * barre serait comprimée. Là où le parent direct empile DANS une colonne ou un bloc, rien ne
 * bouge, et c'est le cas du DOM hérité. */
export function stackingMountFor(editor: Element, limit = 6): StackingMount | null {
  const view = editor.ownerDocument?.defaultView ?? null;
  let anchor: Element = editor;
  let container = editor.parentElement;
  for (let i = 0; container && i < limit; i++) {
    if (stacks(container, view) && !squeezed(container, view)) return { container, anchor };
    anchor = container;
    container = container.parentElement;
  }
  return null;
}

/** « Cet élément est-il posé dans une rangée ? » — la question se pose à son parent de MISE EN
 * PAGE, donc en traversant les `display: contents`, qui n'en sont pas un. Sans parent, rien ne
 * le comprime. */
function squeezed(el: Element, view: (Window & typeof globalThis) | null): boolean {
  let parent = el.parentElement;
  while (parent && (view?.getComputedStyle(parent).display || 'block') === 'contents') {
    parent = parent.parentElement;
  }
  return parent !== null && !stacks(parent, view);
}

/** « Cet élément met-il ses enfants les uns SOUS les autres ? » — question de mise en page,
 * donc posée au moteur de style, jamais à un nom de classe. Sans moteur de style (contexte de
 * test sans CSS), `display` est vide et le repli `block` redonne le comportement d'avant. */
function stacks(el: Element, view: (Window & typeof globalThis) | null): boolean {
  const style = view?.getComputedStyle(el);
  const display = style?.display || 'block';
  // Une grille empile ses rangées par défaut ; une flexbox seulement si elle est en colonne.
  if (display === 'grid' || display === 'inline-grid') return true;
  if (display === 'flex' || display === 'inline-flex') return (style?.flexDirection || 'row').startsWith('column');
  // `contents` n'a pas de boîte : ses enfants sont mis en page par le grand-parent, donc y
  // insérer ne décide de rien. `none` ne rendrait rien du tout.
  if (display === 'contents' || display === 'none') return false;
  // Reste `block`, `flow-root`, `list-item`, `table-cell`… — et les `inline*`, qui alignent
  // leurs enfants sur une ligne comme le faisait le `<span>` de la vue `…/changes`.
  return !display.startsWith('inline');
}
