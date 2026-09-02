// Sélecteurs DOM GitHub — centralisés dans un fichier unique, versionné et documenté
// (§9.4). Organisés en chaînes avec repli : la génération React d'abord, puis le DOM
// hérité (§A.5). Quand aucune génération ne matche, la dégradation silencieuse
// s'applique zone par zone — jamais d'exception remontée à l'utilisateur (CA-11).
//
// Ces chaînes sont la surface à maintenir : le smoke test quotidien (§9.4) doit être
// exécuté contre github.com ET des versions représentatives de GHE Server (§A.5).

import type { SelectorChain } from '@cct/adapter-shared';

export const selectors = {
  /** Zone de saisie d'un commentaire — les deux générations encapsulent un <textarea> (§A.2). */
  editors: {
    name: 'editors',
    candidates: [
      // Génération React (Files changed réécrite).
      'textarea[aria-label*="omment"][class*="CommentBox"]',
      'div[data-testid*="comment-composer"] textarea',
      // Génération héritée.
      'textarea[name="comment[body]"]',
      'textarea[name="pull_request_review_comment[body]"]',
      'textarea[name="pull_request_review[body]"]',
      'textarea.js-comment-field',
    ],
  } satisfies SelectorChain,

  /** Visibilité du dépôt affiché — MESURÉE sur une page réelle de github.com (2026-09) :
   * `<meta name="octolytics-dimension-repository_public" content="true">`, en un exemplaire.
   * Ne sert qu'à interpréter un 404 de la lecture sans session (§8.2) : sur un dépôt privé,
   * GitHub masque ce qu'on n'a pas le droit de voir, et « pas de fichier » est alors
   * indiscernable de « pas le droit ». */
  repositoryPublicMeta: {
    name: 'repository-public-meta',
    candidates: ['meta[name="octolytics-dimension-repository_public"]'],
  } satisfies SelectorChain,

  /** Repli visible de la même information : le badge à côté du nom du dépôt. La page mesurée
   * porte `<span class="Label Label--secondary v-align-middle mr-1">Public</span>` — mais
   * d'autres badges partagent ces classes (« Bot »), donc l'appelant filtre par TEXTE et ne
   * conclut que sur « public »/« private ». Un repli muet laisse la lecture au comportement
   * d'avant : il ne peut pas mettre un bandeau là où il n'y en avait pas. */
  repositoryVisibilityLabel: {
    name: 'repository-visibility-label',
    candidates: ['span.Label--secondary', 'span.Label'],
  } satisfies SelectorChain,

  /** Conteneur d'un fil existant — décide de la zone `reply` (§4.1). */
  threadContainer: {
    name: 'thread-container',
    candidates: ['[data-testid="review-thread"]', '.js-resolvable-timeline-thread-container', '.review-thread-component'],
  } satisfies SelectorChain,

  /** Zone de conversation générale (issue comment) — zone `conversation` (§4.1). */
  conversationForm: {
    name: 'conversation-form',
    candidates: ['#new_comment_form', 'form.js-new-comment-form'],
  } satisfies SelectorChain,

  /** Corps d'une revue soumise en lot — zone `review-body` (§4.1, §A.7). */
  reviewSummaryForm: {
    name: 'review-summary-form',
    candidates: ['[data-testid="review-changes-form"]', 'form.pull-request-review-menu-form', '.js-reviews-container form'],
  } satisfies SelectorChain,

  /** Boutons d'envoi d'un formulaire de commentaire (§4.3). */
  submitButtons: {
    name: 'submit-buttons',
    candidates: [
      'button[type="submit"][data-testid*="submit"]',
      'button[type="submit"].btn-primary',
      'button[type="submit"]',
    ],
  } satisfies SelectorChain,

  /** Bouton de complétion/merge (§6.5) — jamais intercepté, grisé visuellement seulement. */
  mergeButton: {
    name: 'merge-button',
    candidates: [
      '[data-testid="mergebox-partial"] button.btn-primary',
      'button[data-testid*="merge-button"]',
      '.merge-message button.btn-group-merge',
      'button.js-merge-commit-button',
    ],
  } satisfies SelectorChain,

  /** Fils rendus sur la page — pour les ancres du bandeau (§5.5). */
  renderedThreads: {
    name: 'rendered-threads',
    candidates: ['[data-testid="review-thread"]', '.js-resolvable-timeline-thread-container'],
  } satisfies SelectorChain,

  /** Permalien d'ancrage d'un fil rendu — l'ancre du bandeau (§5.5). Le repli large
   * `a[href*="#"]` vient en dernier : un lien d'avatar le satisferait aussi. */
  threadAnchor: {
    name: 'thread-anchor',
    candidates: [
      '[data-testid="permalink"]',
      'a[href*="#discussion_r"]',
      'a[href*="#issuecomment"]',
      'a[href*="#"]',
    ],
  } satisfies SelectorChain,

  /** Conteneur des contrôles d'envoi d'un éditeur (§4.3) — générique, mais centralisé et
   * nommé (§9.4). */
  submitContainer: {
    name: 'submit-container',
    candidates: ['form'],
  } satisfies SelectorChain,

  /** Marqueur « résolu » d'un fil rendu. */
  resolvedMarker: {
    name: 'resolved-marker',
    candidates: ['[data-testid="resolved-badge"]', 'summary [title*="esolved"]', '.Details--on .color-fg-muted'],
  } satisfies SelectorChain,

  /** Formulaire d'édition d'un commentaire existant (§4.3). */
  editForm: {
    name: 'edit-form',
    candidates: ['.js-comment-edit-form', 'form[data-testid*="edit"]', '[data-testid*="edit-form"]'],
  } satisfies SelectorChain,

  /** Un commentaire rendu dans un fil — pour distinguer l'édition d'une RACINE de celle
   * d'une réponse (§4.1), et porter les badges (§5.5). */
  renderedComment: {
    name: 'rendered-comment',
    candidates: ['[data-testid="review-thread-comment"]', '.review-comment', '.js-comment'],
  } satisfies SelectorChain,

  /** Corps d'un commentaire rendu — badges du §5.5. */
  commentBody: {
    name: 'comment-body',
    candidates: ['[data-testid="comment-body"]', '.comment-body'],
  } satisfies SelectorChain,

  /** Auteur d'un commentaire rendu. */
  commentAuthor: {
    name: 'comment-author',
    candidates: ['[data-testid="comment-author"]', '.author'],
  } satisfies SelectorChain,

  /** Login de l'utilisateur courant — lu dans le DOM, jamais par API (§10). */
  currentUser: {
    name: 'current-user',
    candidates: ['meta[name="user-login"]'],
  } satisfies SelectorChain,

  /** Date de création de la PR — lisible dans la page (§6.2.3). */
  prCreatedAt: {
    name: 'pr-created-at',
    candidates: ['.gh-header-meta relative-time', '[data-testid="pr-header"] relative-time', 'relative-time'],
  } satisfies SelectorChain,

  /** Élément après lequel insérer le bandeau du §5.5 : « en tête de PR » — dans le flux de
   * la page, sous le titre, et non au-dessus du chrome de la plateforme. Rien n'apparie sur
   * une page hors PR : l'appelant se replie alors sur le haut du document. */
  bannerMount: {
    name: 'banner-mount',
    candidates: ['[data-testid="pr-header"]', '.gh-header-show', '.gh-header'],
  } satisfies SelectorChain,

  /** Titres de checks rendus sur la page — c'est là que vit la ligne cc/1 (§6.3.1, §A.8). */
  checkRunTitles: {
    name: 'check-run-titles',
    candidates: [
      '[data-testid="check-run-item"]',
      '.merge-status-item .status-meta',
      '.merge-status-item',
      '.branch-action-item .status-meta',
    ],
  } satisfies SelectorChain,

  /** Brouillon — décide de rien côté A, affiché seulement. */
  draftBadge: {
    name: 'draft-badge',
    candidates: ['.State--draft', '[data-testid="draft-label"]'],
  } satisfies SelectorChain,
};
