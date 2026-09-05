// Sélecteurs DOM GitHub — centralisés dans un fichier unique, versionné et documenté
// (§9.4). Organisés en chaînes avec repli : la génération React d'abord, puis le DOM
// hérité (§A.5). Quand aucune génération ne matche, la dégradation silencieuse
// s'applique zone par zone — jamais d'exception remontée à l'utilisateur (CA-11).
//
// Ces chaînes sont la surface à maintenir : le smoke test quotidien (§9.4) doit être
// exécuté contre github.com ET des versions représentatives de GHE Server (§A.5).

import type { SelectorChain } from '@cct/adapter-shared';

export const selectors = {
  /** Zone de saisie d'un commentaire — les deux générations encapsulent un <textarea> (§A.2).
   *
   * MESURÉ sur `https://github.com/Reefact/conventional-comments-toolkit/pull/45/changes`
   * (session ouverte, composeur de ligne ouvert, 2026-09-04). La page `…/changes` est la
   * nouvelle vue des fichiers modifiés, et le composeur y est le SEUL <textarea> du
   * document :
   *
   *   <textarea aria-label="Markdown value" placeholder="Leave a comment"
   *             class="prc-Textarea-TextArea-snlco" id="_r_qm_">
   *
   * Aucun des six candidats d'avant n'y matchait — ni les quatre hérités, ni les deux
   * candidats React, écrits de mémoire et jamais observés nulle part. L'extension ne posait
   * donc aucune barre d'outils sur la zone que le §4.1 appelle « cœur de la revue », et le
   * silence était complet : `observeEditors` ne journalisait pas cet échec (§9.4).
   *
   * Deux attributs du champ sont inutilisables : `-snlco` est un hachage de build de Primer,
   * `_r_qm_` un identifiant `useId` de React. Restent trois prises, de la plus spécifique à
   * la plus large, chacune suffisante à elle seule :
   *
   *   - `aria-label="Markdown value"` — nom accessible que Primer donne au champ de son
   *     éditeur Markdown. Il ne contient pas « comment », ce sur quoi tombait l'ancien
   *     premier candidat ;
   *   - `placeholder="Leave a comment"` — texte visible, donc localisable, mais sans
   *     ambiguïté sur la nature du champ ;
   *   - `class*="prc-Textarea-TextArea"` — le composant Primer, hachage retiré : le filet le
   *     plus large, et le seul qui survive à une réécriture des deux précédents.
   *
   * CES TROIS PRISES SONT EN DERNIER, et l'ordre est le point délicat : `queryChainAll`
   * s'arrête au premier candidat qui ramène un élément, et ne rend QUE les siens — un
   * candidat placé trop haut masque donc tous les suivants. Or `placeholder` et la classe
   * Primer sont larges : en tête de chaîne, sur une page servie par la génération héritée —
   * celle où l'extension fonctionne aujourd'hui —, ils pourraient n'attraper qu'une partie
   * des éditeurs (le composeur principal sans les réponses de fil) et faire DISPARAÎTRE le
   * reste. Placé en fin de chaîne, l'ajout est strictement additif : il ne peut que changer
   * « aucun éditeur » en « des éditeurs », jamais défaire une détection qui marche. Le prix
   * est connu et assumé : sur une page hypothétique qui mélangerait les deux générations,
   * la nouvelle resterait invisible — un cas non mesuré, et le journal le dira désormais.
   *
   * Les deux candidats React d'origine ne sont pas retirés pour autant : ils ne matchent
   * rien de mesuré, mais rien ne prouve qu'ils ne décrivent aucune vue. */
  editors: {
    name: 'editors',
    candidates: [
      // Génération React — jamais observée, laissée telle quelle.
      'textarea[aria-label*="omment"][class*="CommentBox"]',
      'div[data-testid*="comment-composer"] textarea',
      // Génération héritée.
      'textarea[name="comment[body]"]',
      'textarea[name="pull_request_review_comment[body]"]',
      'textarea[name="pull_request_review[body]"]',
      'textarea.js-comment-field',
      // Nouvelle vue des fichiers modifiés (`/pull/N/changes`) — MESURÉ, voir ci-dessus.
      'textarea[aria-label="Markdown value"]',
      'textarea[placeholder="Leave a comment"]',
      'textarea[class*="prc-Textarea-TextArea"]',
    ],
  } satisfies SelectorChain,

  /** Sonde générique « cette page porte-t-elle une surface de saisie ? » — elle ne sert qu'à
   * DÉCIDER si l'absence de match de `editors` est une dégradation (§9.4) ou le cas nominal.
   * Ce qu'elle attrape n'est jamais décoré : aucun `EditorHandle` n'en sort.
   *
   * Sans cette distinction, journaliser l'échec de `editors` serait pire que le silence :
   * sur une PR dont aucun composeur n'est ouvert, ne rien trouver est la NORME, et une entrée
   * par page noierait le journal comme `merge-button` le faisait sur une PR fermée (cf.
   * `SelectorLog`, adapters/shared). */
  editingSurfaces: {
    name: 'editing-surfaces',
    candidates: ['textarea', '[contenteditable="true"]'],
  } satisfies SelectorChain,

  /** **Description de la PR — hors périmètre** (§4.1, dernière ligne du tableau : format non
   * validé, aucun état bloquant). L'éditeur qu'on y ouvre n'est pas une zone du §4.1 : il ne
   * doit recevoir ni barre d'outils, ni saisie rapide, ni garde d'envoi. Sans cette chaîne, il
   * tombait dans le REPLI de `#contextOf()` — « ni fil, ni corps de revue, ni conversation,
   * donc commentaire de ligne de diff » — et se retrouvait classé `thread-root`, la zone la
   * plus privilégiée : en mode `enforce`, mettre à jour la description d'une PR devenait
   * impossible, faute d'un `label:` en tête.
   *
   * MESURÉ sur `https://github.com/Reefact/conventional-comments-toolkit/pull/39` (page
   * anonyme, 2026-09), où les trois candidats matchent **un seul** élément chacun, tous
   * ancêtres du formulaire d'édition de la description, et aucun ancêtre d'un autre
   * commentaire :
   *
   *   <div class="TimelineItem … js-command-palette-pull-body">      ← candidat 1
   *     <div class="timeline-comment-group …" id="issue-5321598100">
   *       <div id="pullrequest-4420243102" class="… js-comment …">   ← candidat 2
   *         …
   *         <form class="js-comment-update" id="issue-5321598100-edit-form">  ← candidat 3
   *           <include-fragment src="…/edit_form?textarea_id=issue-5321598100-body">
   *
   * Les trois ne sont donc PAS trois générations de DOM (§A.5) mais trois emboîtements du
   * MÊME rendu : `closestChain` s'arrêtant au premier qui matche, un renommage de la classe
   * la plus extérieure laisse les deux autres attraper le cas.
   *
   * Deux limites, écrites parce qu'elles ne sont pas mesurées et ne doivent pas être crues :
   * le `<textarea>` lui-même est servi par le `<include-fragment>` ci-dessus, que GitHub
   * refuse sans session — ses attributs propres n'ont donc pas été observés, et c'est
   * précisément pourquoi l'exclusion porte sur les ANCÊTRES, qui le seront quels qu'ils
   * soient ; la génération React de la page de conversation, elle, n'a pas été observée du
   * tout (la page mesurée est rendue côté serveur), et si elle nomme autrement ce conteneur,
   * aucun candidat ne matchera — l'éditeur redeviendra visible comme avant ce correctif,
   * jamais pire.
   *
   * `[id^="issue-"]` ne matche pas `issuecomment-…` — vérifié sur la page mesurée, qui porte
   * les deux : le candidat 3 y compte exactement une occurrence. */
  prDescription: {
    name: 'pr-description',
    candidates: [
      '.js-command-palette-pull-body',
      '[id^="pullrequest-"].js-comment',
      'form.js-comment-update[id^="issue-"]',
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
    candidates: [
      '[data-testid="review-changes-form"]',
      'form.pull-request-review-menu-form',
      '.js-reviews-container form',
      // MESURÉ sur `/pull/48/changes`, panneau « Finish your comments » ouvert (2026-09-04) :
      // aucun des trois candidats ci-dessus n'y matche, et le champ du panneau est
      // indiscernable de celui d'un commentaire de ligne par ses attributs propres — même
      // `aria-label`, même `placeholder`, même classe. Ce qui le distingue est au-dessus de
      // lui : deux conteneurs du composant « ReviewMenu », que rien d'autre ne porte.
      //
      // Sans eux, le corps de revue tombait dans le repli de `#contextOf()` et se retrouvait
      // classé `thread-root`, donc réputé porter un état bloquant. Symptôme unique et vérifié
      // à l'écran : un `issue:` y affichait `E-EMPTY-SUBJECT` et `W-NO-DISCUSSION`, mais PAS
      // `W-NOT-BLOCKABLE` — alors que personne ne peut résoudre un corps de revue (§4.1).
      '[class*="ReviewMenuContent-module__"]',
      '[class*="ReviewMenu-module__"]',
    ],
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

  /** ————— Vue `/pull/N/changes` : les quatre chaînes ci-dessous y étaient TOUTES à zéro —————
   *
   * MESURÉ sur `https://github.com/Reefact/conventional-comments-toolkit/pull/48/changes`
   * (session ouverte, fil de `adapters/shared/src/index.ts` ligne 257 déplié, 2026-09-04).
   * Structure relevée, classes de modules CSS abrégées de leur hachage :
   *
   *   div.rounded-2.bgColor-default
   *     div[data-testid="review-thread"]              ← RECONNU : le premier candidat tient
   *       div.ReviewThread-module__ReviewThreadContainer
   *         div.ReviewThreadComment-module__ReviewThreadContainer      ← un par commentaire
   *           div.ReviewThreadComment-module__ReviewThreadInnerContainer
   *             div[data-testid="comment-header"]
   *               a[data-testid="avatar-link"].ActivityHeader-module__AuthorName  « Reefact »
   *           div.ReviewThreadComment-module__ReviewThreadWrapper
   *             div.ReviewThreadComment-module__BodyHTMLContainer
   *               div.markdown-body.ReviewThreadComment-module__SafeHTMLBox      ← le corps
   *         div.rounded-bottom-2 > … AddCommentEditor-module__AddCommentEditor    ← répondre
   *     div[data-testid="unified-comment-actions"]    ← SŒUR du fil, PAS dedans
   *       button[data-testid="unified-comment-unresolve-button"]
   *
   * Deux relevés valent d'être écrits parce qu'ils ne se devinent pas :
   *
   *   • le marqueur de résolution est **hors** de `review-thread` — `getThreads()` le
   *     cherchait dedans, d'où `resolution: 'unknown'` sur un fil manifestement résolu.
   *     Le bouton a été mesuré dans les DEUX états (résolu : 1, non résolu : 0, re-résolu :
   *     1) : c'est un marqueur, pas un ornement. `resolved-badge` vaut 0 dans les deux, et
   *     `unified-comment-actions` 1 dans les deux — ni l'un ni l'autre ne marque rien ;
   *   • le champ d'ÉDITION d'un commentaire est à l'intérieur de son
   *     `ReviewThreadComment-module__ReviewThreadContainer`, alors que le champ de RÉPONSE
   *     est ailleurs, sous `AddCommentEditor-module__AddCommentEditor`. C'est ce qui
   *     distingue une édition d'une composition sur cette vue, et donc ce qui rend à
   *     l'édition d'une RACINE sa zone `thread-root` (§4.1, §4.3).
   *
   * Comme pour `editors`, les candidats mesurés sont AJOUTÉS EN FIN de chaîne : sur une page
   * servie par la génération héritée, le premier candidat qui matche gagne, et l'ajout ne
   * peut donc rien défaire de ce qui fonctionne.
   *
   * Le badge « Resolved » visible dans l'en-tête du fil a été cherché : il n'est PAS dans
   * `review-thread` non plus. La boîte environnante reste donc le seul endroit où lire l'état.
   *
   * Reste NON mesuré, et donc non traité ici : aucun conteneur de cette vue ne porte
   * d'attribut `id`, si bien que `threadId`/`commentId` y sont vides et que `getThreads()`
   * retombe sur ses identifiants synthétiques. Le permalien, lui, PORTE cet identifiant dans
   * son fragment (`#r3932637709`) — le jour où ces champs devront être renseignés, c'est là
   * qu'ils se lisent, et non dans un attribut du DOM. */

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
      // MESURÉ sur la vue `…/changes` : le permalien d'un commentaire est le lien de sa DATE,
      // et son fragment s'écrit `#r<id>` là où la génération héritée écrit `#discussion_r<id>`
      // — d'où le zéro du deuxième candidat. Placé AVANT le repli large, faute de quoi il ne
      // serait jamais atteint. Ce n'est pas une réparation : le repli attrape déjà le bon lien
      // sur cette vue, les liens d'avatar et d'auteur (`/Reefact`) n'ayant pas de fragment.
      // C'est une prise accidentelle rendue délibérée — elle cesse de dépendre du fait
      // qu'aucun autre lien à fragment n'apparaisse plus haut dans le fil.
      '[class*="ActivityHeader-module__HeaderLink"]',
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
    candidates: [
      '[data-testid="resolved-badge"]',
      'summary [title*="esolved"]',
      '.Details--on .color-fg-muted',
      '[data-testid="unified-comment-unresolve-button"]', // MESURÉ dans les deux états
    ],
  } satisfies SelectorChain,

  /** Formulaire d'édition d'un commentaire existant (§4.3). */
  editForm: {
    name: 'edit-form',
    candidates: [
      '.js-comment-edit-form',
      'form[data-testid*="edit"]',
      '[data-testid*="edit-form"]',
      // MESURÉ : cette vue n'a pas de formulaire d'édition nommé. Ce qui distingue une
      // édition d'une composition est la POSITION du champ — dans le commentaire édité,
      // là où les champs de réponse et de nouveau commentaire sont ailleurs.
      '[class*="ReviewThreadComment-module__ReviewThreadContainer"]',
    ],
  } satisfies SelectorChain,

  /** Un commentaire rendu dans un fil — pour distinguer l'édition d'une RACINE de celle
   * d'une réponse (§4.1), et porter les badges (§5.5). */
  renderedComment: {
    name: 'rendered-comment',
    candidates: [
      '[data-testid="review-thread-comment"]',
      '.review-comment',
      '.js-comment',
      '[class*="ReviewThreadComment-module__ReviewThreadContainer"]', // MESURÉ
    ],
  } satisfies SelectorChain,

  /** Corps d'un commentaire rendu — badges du §5.5. */
  commentBody: {
    name: 'comment-body',
    candidates: [
      '[data-testid="comment-body"]',
      '.comment-body',
      '[class*="ReviewThreadComment-module__SafeHTMLBox"]', // MESURÉ — porte aussi `.markdown-body`
    ],
  } satisfies SelectorChain,

  /** Auteur d'un commentaire rendu. */
  commentAuthor: {
    name: 'comment-author',
    candidates: [
      '[data-testid="comment-author"]',
      '.author',
      '[data-testid="avatar-link"]', // MESURÉ — le lien du NOM de l'auteur, pas son image
    ],
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
