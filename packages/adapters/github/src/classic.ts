// VUE CLASSIQUE — la logique que seule la Conversation d'avant l'Overview demande.
//
// Les sélecteurs vivent dans `selectors.ts` (§9.4), bloc « VUE CLASSIQUE » ; ce fichier n'en porte
// que l'usage. Le jour où l'Overview sera la seule version, il se supprime avec ce bloc, et le
// compilateur désigne chaque appel à retirer dans `index.ts`.

import { closestChain, matchesChain, queryChain } from '@cct/adapter-shared';
import { selectors } from './selectors.js';

/** Le bouton de fusion de la zone `mergebox-partial`, et si son absence est NOMINALE : PR ouverte
 * dont la page dit qu'elle ne peut pas être fusionnée maintenant (#113, `classicNotMergeable`). */
export function classicCompletion(doc: Document): { element: Element | null; nominalAbsence: boolean } {
  const element = queryChain(doc, selectors.mergeButton).element;
  return { element, nominalAbsence: queryChain(doc, selectors.classicNotMergeable).element !== null };
}

/** Le champ est-il celui de la DESCRIPTION de la PR — hors périmètre (§4.1) ? */
export function inClassicPrDescription(el: Element): boolean {
  return closestChain(el, selectors.prDescription).element !== null;
}

/** Le champ est-il dans le formulaire de conversation générale (ou l'édition d'un commentaire
 * général) — zone `conversation` (§4.1) ? */
export function inClassicConversationForm(el: Element): boolean {
  return closestChain(el, selectors.conversationForm).element !== null;
}

/** Le contenu de ce fil n'est PAS dans la page : il est replié et chargé au dépliage
 * (`deferredThread`), ou son chargement est EN COURS — un `<include-fragment>` à la place des
 * commentaires (#117).
 *
 * MESURÉ sur le squelette du rapport du 2026-10-31 (branche `diagnostic/2026-10-31-comment-body`,
 * `skeletons/mvwpatfe-xunl01.txt`) : le second fil, replié, ne porte plus
 * `data-deferred-content-url` — l'attribut part dès que le chargement commence — et son contenu
 * est un `include-fragment` qui affiche « Loading ». Entre les deux états, ni corps ni auteur, et
 * `comment-body` / `comment-author` étaient journalisés pour un fil qui n'avait rien de pourri.
 * N'est consulté que pour un fil SANS corps ni auteur : un fil rendu n'est jamais concerné. */
export function classicThreadNotRendered(thread: Element): boolean {
  return (
    matchesChain(thread, selectors.deferredThread).element !== null ||
    queryChain(thread, selectors.classicLoadingThread).element !== null
  );
}

/** L'état de résolution que le conteneur du fil déclare lui-même (`data-resolved`), ou `null`
 * s'il ne le déclare pas. */
export function classicResolutionFlag(thread: Element): 'resolved' | 'unresolved' | null {
  if (matchesChain(thread, selectors.threadResolvedFlag).element) return 'resolved';
  if (matchesChain(thread, selectors.threadUnresolvedFlag).element) return 'unresolved';
  return null;
}
