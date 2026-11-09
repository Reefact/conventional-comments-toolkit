// VUE OVERVIEW — la logique que seule la page Overview des pull requests demande (préversion
// publique du 2026-11-05, #131).
//
// Les sélecteurs vivent dans `selectors.ts` (§9.4), bloc « VUE OVERVIEW » ; ce fichier n'en porte
// que l'usage. Les fils de revue de l'Overview sont rendus par le même composant que Files
// changed : leur lecture (corps, auteur, ancre, édition d'un commentaire DE FIL) reste celle du
// code commun, dans `index.ts`. Ici, seulement ce que l'Overview a en propre.

import { closestChain, queryChain, type EditorContext } from '@cct/adapter-shared';
import type { PrRef } from '@cct/core';
import { selectors } from './selectors.js';

/** La zone d'un champ de l'Overview, quand elle relève d'une marque propre à cette vue — `null`
 * sinon, et le code commun décide : l'édition d'un commentaire de fil (dans
 * `[data-testid="review-thread"]`, comme sur Files changed) et le panneau de revue.
 *
 * L'ordre suit l'emboîtement mesuré : un champ d'édition DANS un fil est aussi dans son groupe,
 * d'où le renvoi au code commun dès qu'il est dans un fil. */
export function overviewContext(el: Element, pr: PrRef): EditorContext | null {
  // Édition d'un commentaire GÉNÉRAL : le champ est dans l'`article` du commentaire (capture 06).
  const general = closestChain(el, selectors.overviewGeneralComment).element;
  if (general) {
    return {
      zone: 'conversation',
      action: 'edit',
      pr,
      threadId: general.id,
      commentId: general.id,
      canCarryBlockingState: false,
      inScope: true,
    };
  }
  // Réponse dans un fil : le champ est dans le GROUPE du fil, mais hors du fil lui-même (capture
  // 02). Dans le fil, c'est l'édition d'un de ses commentaires : le code commun la classe.
  const group = closestChain(el, selectors.overviewThreadGroup).element;
  if (group && !closestChain(el, selectors.threadContainer).element) {
    // L'identifiant du FIL est celui de sa racine, le premier commentaire du groupe : le groupe
    // porte celui de la revue (`pullrequestreview-…`), qui n'en est pas un.
    const root = queryChain(group, selectors.overviewThreadComment).element;
    return {
      zone: 'reply',
      action: 'compose',
      pr,
      threadId: root?.id || undefined,
      canCarryBlockingState: false,
      inScope: true,
    };
  }
  if (closestChain(el, selectors.overviewConversationForm).element) {
    return { zone: 'conversation', action: 'compose', pr, canCarryBlockingState: false, inScope: true };
  }
  return null;
}

/** Le champ est-il celui de la DESCRIPTION de la PR — hors périmètre (§4.1) ? */
export function inOverviewPrDescription(el: Element): boolean {
  return closestChain(el, selectors.overviewPrDescription).element !== null;
}

/** Le bouton de fusion de la rangée « action recommandée », et si son absence est NOMINALE : la
 * rangée dit que la PR ne peut pas être fusionnée maintenant (`overviewNotMergeable`, #127). */
export function overviewCompletion(doc: Document): { element: Element | null; nominalAbsence: boolean } {
  const element = queryChain(doc, selectors.overviewMergeButton).element;
  return { element, nominalAbsence: queryChain(doc, selectors.overviewNotMergeable).element !== null };
}
