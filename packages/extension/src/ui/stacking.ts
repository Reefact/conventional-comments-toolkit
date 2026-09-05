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

/** Remonte au plus `limit` niveaux. Rend `null` si aucun ancêtre n'empile — l'appelant
 * retombe alors sur le parent direct, c'est-à-dire sur le comportement d'avant : ne rien
 * savoir ne doit jamais faire pire que ce qui existait. */
export function stackingMountFor(editor: Element, limit = 6): StackingMount | null {
  const view = editor.ownerDocument?.defaultView ?? null;
  let anchor: Element = editor;
  let container = editor.parentElement;
  for (let i = 0; container && i < limit; i++) {
    if (stacks(container, view)) return { container, anchor };
    anchor = container;
    container = container.parentElement;
  }
  return null;
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

/** « Le trait d'état posé sur ce champ sera-t-il rogné ? » — question de PEINTURE, et la
 * réponse se calcule sur des boîtes, pas sur des noms de classe.
 *
 * Un `outline` se dessine à l'extérieur de la boîte de son élément (c'est pourquoi le §5.3 le
 * préfère à un `border` : il ne pousse rien). Un ancêtre qui coupe ce qui dépasse et dont la
 * boîte épouse celle du champ le fait donc disparaître — MESURÉ sur la vue `…/changes` de
 * GitHub, où le champ est enveloppé d'un conteneur Primer en `overflow: hidden`, large de
 * 563 px comme lui et au même `left` (2026-09-04).
 *
 * On exige que les DEUX bords horizontaux soient collés, à `tolerance` près. Un seul bord
 * commun se produit par accident dans n'importe quelle mise en page ; les deux signalent un
 * conteneur qui gaine le champ. La distinction compte : là où le trait n'est pas rogné, le
 * rentrer le ferait mordre sur le texte quand le champ n'a pas de padding — c'est le cas du
 * DOM hérité, où `cct-editor` met justement ce padding à zéro. */
export function ringIsClipped(editor: Element, tolerance = 2, limit = 4): boolean {
  const view = editor.ownerDocument?.defaultView ?? null;
  if (!view) return false;
  const box = editor.getBoundingClientRect();
  let el = editor.parentElement;
  for (let i = 0; el && i < limit; i++) {
    const style = view.getComputedStyle(el);
    const clips = [style.overflow, style.overflowX, style.overflowY].some((v) => v !== '' && v !== 'visible');
    if (clips) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.left - box.left) <= tolerance && Math.abs(r.right - box.right) <= tolerance) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Le conteneur qui ENCADRE le champ : le plus proche ancêtre dont la bordure est visible.
 *
 * MESURÉ au focus réel sur les deux générations (2026-09-04), et c'est la mesure qui a fini
 * par expliquer l'écart visible entre elles :
 *
 *   /pull/48          .CommentBox-container   border 1px, et outline bleu 2px au focus
 *   /pull/48/changes  MarkdownInput-module__inputWrapper  idem
 *
 * Des deux côtés, ce cadre englobe la barre, le champ et la pastille. Sur la page héritée,
 * l'extension lui pose 8 px de retrait (`cct-host`), si bien que son contenu respire à
 * l'intérieur du cadre ; sur la nouvelle vue, faute d'être reconnu, il n'en avait aucun et le
 * cadre serrait tout. La différence de rendu tenait à ces 8 px, pas au point d'insertion —
 * lequel a été soupçonné trois fois et disculpé trois fois.
 *
 * Chercher « qui dessine le cadre » plutôt que « comment s'appelle ce conteneur » unifie les
 * deux générations sans nommer aucune des deux : sur le DOM hérité, la réponse est l'élément
 * que l'extension choisissait déjà. */
export function framedAncestor(editor: Element, limit = 4): Element | null {
  const view = editor.ownerDocument?.defaultView ?? null;
  if (!view) return null;
  let el = editor.parentElement;
  for (let i = 0; el && i < limit; i++) {
    const style = view.getComputedStyle(el);
    const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
    if (widths.some((w) => parseFloat(w) > 0)) return el;
    el = el.parentElement;
  }
  return null;
}
