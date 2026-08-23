// Sélecteurs DOM Azure DevOps — fichier unique, versionné (§9.4). L'éditeur exact est à
// établir par le spike P1' (§B.2) : ces chaînes couvrent l'hypothèse <textarea> et
// l'hypothèse d'un éditeur riche ; quand aucune ne matche, la dégradation silencieuse
// s'applique (CA-11) et l'extension n'empêche jamais l'usage normal de la plateforme.

import type { SelectorChain } from '@cct/adapter-shared';

export const selectors = {
  editors: {
    name: 'editors',
    candidates: [
      'textarea.comment-textarea',
      '.repos-discussion-comment-editor textarea',
      '.vc-discussion-comment-editor textarea',
      'textarea[aria-label*="omment"]',
    ],
  } satisfies SelectorChain,

  threadContainer: {
    name: 'thread-container',
    candidates: ['.repos-discussion-thread', '.vc-discussion-thread-box'],
  } satisfies SelectorChain,

  submitButtons: {
    name: 'submit-buttons',
    candidates: [
      // « Comment » ET « Comment & resolve » — les deux passent par la validation (§B.6).
      'button[data-testid*="comment"]',
      '.repos-discussion-comment-editor button.bolt-button.primary',
      'button.bolt-button.primary',
    ],
  } satisfies SelectorChain,

  completeButton: {
    name: 'complete-button',
    candidates: ['button[data-testid*="complete"]', '#pull-request-complete-button', 'button[aria-label*="omplete"]'],
  } satisfies SelectorChain,

  renderedThreads: {
    name: 'rendered-threads',
    candidates: ['.repos-discussion-thread', '.vc-discussion-thread-box'],
  } satisfies SelectorChain,

  /** État de résolution rendu — Azure DevOps affiche le statut du fil dans un menu ;
   * lorsqu'il n'est pas lisible, `resolution: 'unknown'`, compté non résolu (§B.5, §5.5). */
  threadStatus: {
    name: 'thread-status',
    candidates: ['.repos-discussion-thread-status', '[aria-label*="status"]'],
  } satisfies SelectorChain,

  currentUser: {
    name: 'current-user',
    candidates: ['.bolt-header-user-avatar img[alt]', 'img.user-avatar[alt]'],
  } satisfies SelectorChain,

  prCreatedAt: {
    name: 'pr-created-at',
    candidates: ['.repos-pr-header time', 'time[datetime]'],
  } satisfies SelectorChain,

  /** Formulaire d'édition d'un commentaire existant — décide d'action: 'edit' (§4.3).
   * PIÈGE : `[class*="comment-edit"]` matcherait `.repos-discussion-comment-editor` — le
   * conteneur de COMPOSITION nominal — par sous-chaîne, et TOUT éditeur deviendrait
   * 'edit'. Les candidats sont donc fermés sur la forme d'édition. */
  editForm: {
    name: 'edit-form',
    candidates: ['.repos-discussion-comment--editing', '[class*="comment-editing"]', '[class*="edit-comment"]'],
  } satisfies SelectorChain,

  /** Un commentaire rendu dans un fil — distingue l'édition d'une RACINE de celle d'une
   * réponse (§4.1). Le candidat par sous-chaîne exclut les conteneurs d'édition, qui
   * portent aussi « discussion-comment » dans leur classe. */
  renderedComment: {
    name: 'rendered-comment',
    candidates: ['.repos-discussion-comment', '[class*="discussion-comment"]:not([class*="editor"])'],
  } satisfies SelectorChain,

  /** Conteneur des contrôles d'envoi d'un éditeur (§4.3) — en chaîne ordonnée : la
   * génération « repos- », la génération héritée « vc- », puis un formulaire (§9.4). */
  submitContainer: {
    name: 'submit-container',
    candidates: ['.repos-discussion-comment-editor', '.vc-discussion-comment-editor', 'form'],
  } satisfies SelectorChain,

  /** Corps d'un commentaire rendu — badges du §5.5. */
  commentBody: {
    name: 'comment-body',
    candidates: ['.markdown-content', '.comment-content'],
  } satisfies SelectorChain,

  /** Description des PR Status rendus — c'est là que vit la ligne cc/1 (§B.7). */
  statusDescriptions: {
    name: 'status-descriptions',
    candidates: ['.pr-status-list .pr-status-description', '[data-testid*="pr-status"]', '.repos-pr-status'],
  } satisfies SelectorChain,
};
