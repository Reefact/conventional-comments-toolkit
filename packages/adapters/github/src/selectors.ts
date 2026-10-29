// Sélecteurs DOM GitHub — centralisés dans un fichier unique, versionné et documenté
// (§9.4). Organisés en chaînes avec repli : la génération React d'abord, puis le DOM
// hérité (§A.5). Quand aucune génération ne matche, la dégradation silencieuse
// s'applique zone par zone — jamais d'exception remontée à l'utilisateur (CA-11).
//
// Ces chaînes sont la surface à maintenir : le smoke test quotidien (§9.4) doit être
// exécuté contre github.com ET des versions représentatives de GHE Server (§A.5).

import type { SelectorChain } from '@cct/adapter-shared';

export const selectors = {
  /** Zones de saisie de la génération REACT — jamais observée en direct dans ce dépôt,
   * conservée parce que rien ne prouve qu'elle ne décrive aucune vue.
   *
   * Les trois chaînes de composeur qui suivent sont assemblées en SURFACES par `surfaces.ts` :
   * `/pull/N` et `/pull/N/changes` coexistent, et une chaîne unique rendait invisible le
   * composeur de la seconde (une chaîne rend les éléments du premier candidat qui matche).
   * Les sélecteurs restent ici — le §9.4 les veut « centralisés dans un fichier unique par
   * adaptateur », et un second fichier de sélecteurs enfreindrait la règle que cette
   * modélisation sert à honorer. `surfaces.ts` ne porte que la STRUCTURE. */
  editorsReact: {
    name: 'editors',
    candidates: [
      'textarea[aria-label*="omment"][class*="CommentBox"]',
      'div[data-testid*="comment-composer"] textarea',
    ],
  } satisfies SelectorChain,

  /** Zones de saisie de la génération HÉRITÉE. */
  editorsLegacy: {
    name: 'editors',
    candidates: [
      'textarea[name="comment[body]"]',
      'textarea[name="pull_request_review_comment[body]"]',
      'textarea[name="pull_request_review[body]"]',
      'textarea.js-comment-field',
    ],
  } satisfies SelectorChain,

  /** Zones de saisie de la NOUVELLE VUE DES FICHIERS MODIFIÉS (`/pull/N/changes`).
   *
   * MESURÉ en console sur `/pull/45/changes`, composeur de ligne ouvert (2026-09-04) — voir
   * extension/test/changes-view-composer.test.ts, qui reproduit le relevé. Deux attributs du
   * champ y sont inutilisables : `-snlco` est un hachage de build de Primer, `_r_qm_` un
   * identifiant `useId` de React. Restent trois prises, de la plus spécifique à la plus large :
   *
   *   - `aria-label="Markdown value"` — nom accessible que Primer donne au champ de son éditeur
   *     Markdown. Il ne contient pas « comment », ce sur quoi tombait l'ancien premier candidat ;
   *   - `placeholder="Leave a comment"` — texte visible, donc localisable, mais sans ambiguïté
   *     sur la nature du champ ;
   *   - `class*="prc-Textarea-TextArea"` — le composant Primer, hachage retiré : le filet le plus
   *     large, et le seul qui survive à une réécriture des deux précédents.
   *
   * L'ordre va du plus spécifique au plus large parce qu'une prise large en tête pourrait
   * n'attraper qu'une partie des éditeurs de cette surface et faire disparaître le reste. Ce que
   * la modélisation en surfaces change, c'est que ce risque est borné à UNE surface au lieu de
   * traverser les trois. */
  editorsChanges: {
    name: 'editors',
    candidates: [
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

  /** Le CHÂSSIS du composeur React — le conteneur qui encadre ENSEMBLE l'en-tête natif, les
   * onglets, le champ et ce que l'extension injecte. Sélecteur d'ANCÊTRE, possiblement
   * éloigné : son homologue dans `editorsReact` est un sélecteur descendant, le champ peut donc
   * être niché sous un wrapper intermédiaire.
   *
   * Ces deux candidats ont vécu EN DUR DANS LE CONTRÔLEUR PARTAGÉ, donc évalués aussi sur une
   * page Azure DevOps, où ils ne matchent rien. `surfaces.ts` les rattache à la surface qui les
   * emploie ; ils sont définis ici, comme tous les sélecteurs de cet adaptateur (§9.4). */
  composerFrame: {
    name: 'composer-frame',
    candidates: ['[data-testid*="comment-composer"]'],
  } satisfies SelectorChain,

  /** Génération React sans `data-testid` : la marque est portée par la ZONE DE SAISIE
   * elle-même, et son châssis est alors son parent direct. Chaîne distincte de la précédente
   * parce que la question posée n'est pas la même — ici on interroge le champ (`matches`), là on
   * remonte ses ancêtres (`closest`). Les confondre ferait remonter au premier ancêtre portant
   * la marque, qui n'est pas le parent direct. */
  composerFrameOnField: {
    name: 'composer-frame-on-field',
    candidates: ['[class*="CommentBox"]'],
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
    candidates: [
      '#new_comment_form',
      'form.js-new-comment-form',
      // L'ÉDITION d'un commentaire général, MESURÉE le 2026-10-28
      // (`test/fixtures/pages/06-conversation-modification-commentaire.html`) : son champ est
      // dans le commentaire publié, pas dans le formulaire de nouveau commentaire. Sans ce
      // candidat, elle tombait dans le repli de `#contextOf()` et se lisait `thread-root` —
      // réputée porter un état bloquant, sans `W-NOT-BLOCKABLE` (§4.1). L'identifiant
      // `issuecomment-` la distingue d'un corps de revue, qui s'écrit `pullrequestreview-`.
      '.timeline-comment-group[id^="issuecomment-"]',
    ],
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
      // MESURÉ le 2026-10-28 (`test/fixtures/pages/07-review-changes.html`) : les deux
      // candidats précédents n'y matchent plus rien — voir « Les classes de modules CSS ont
      // perdu leur préfixe », plus bas. Le champ du panneau de revue est le seul de la page
      // sous ce conteneur.
      '[class*="AnchoredReviewBody__"]',
    ],
  } satisfies SelectorChain,

  /** Boutons d'envoi d'un formulaire de commentaire (§4.3). */
  submitButtons: {
    name: 'submit-buttons',
    candidates: [
      'button[type="submit"][data-testid*="submit"]',
      'button[type="submit"].btn-primary',
      'button[type="submit"]',
      // MESURÉ sur la vue `…/changes`, boîte de réponse ouverte : les boutons de Primer sont
      // `type="button"`, donc invisibles aux trois candidats ci-dessus. Le pied en porte
      // trois — *Cancel*, *Reply*, *Start a review* — et il faut intercepter les deux qui
      // PUBLIENT sans toucher à celui qui annule : bloquer *Cancel* enfermerait l'auteur d'un
      // commentaire non conforme, pire que le défaut qu'on corrige.
      //
      // Aucun attribut ne les sépare : `data-variant` vaut `primary` pour *Start a review*
      // mais `default` pour *Reply* COMME pour *Cancel*, et il n'y a ni `data-testid`, ni
      // `aria-label`, ni indice de raccourci clavier (cherché, absent). Le seul écart mesuré
      // est structurel : *Cancel* est un `<button>` nu, PREMIER enfant du groupe, quand les
      // deux autres sont chacun enveloppés d'un `<div>`.
      //
      // D'où les deux conditions plutôt qu'une. L'enveloppe seule échouerait du mauvais côté —
      // le jour où GitHub enveloppe *Cancel*, on se mettrait à l'intercepter. En exigeant AUSSI
      // qu'il ne soit pas le premier enfant, il faudrait que la plateforme l'enveloppe ET le
      // déplace. Le libellé, lui, n'est pas une prise : il se traduit.
      '[class*="Footer-module__childrenStyling"] > div:not(:first-child) button',
      // Le panneau de revue, MESURÉ : deux boutons seulement, et celui qui publie porte la
      // classe de son propre composant — `ReviewMenuFooter-module__Submit…` — quand *Cancel*
      // n'a que la base Primer. Prise sémantique, et qui échoue du bon côté : si GitHub la
      // renomme, on cesse d'intercepter au lieu de se mettre à bloquer l'annulation.
      // `data-variant="primary"` aurait marché ici aussi, mais pas dans le composeur inline,
      // où *Reply* est `default` comme *Cancel* — une prise par vue vaut mieux qu'une prise
      // qui ne tient qu'à moitié.
      '[class*="ReviewMenuFooter-module__Submit"]',
      // Les deux mêmes prises, MESURÉES le 2026-10-28 sous leurs noms actuels
      // (`test/fixtures/pages/04` à `07`). Structure inchangée : *Cancel* est toujours un
      // `<button>` nu, premier enfant du groupe, et chaque bouton qui publie — *Comment*,
      // *Start a review*, *Reply*, *Update* — est enveloppé d'un `<div>`. Le bouton de revue
      // a changé de NOM, pas seulement de préfixe : `SubmitReviewButton__…`.
      '[class*="childrenStyling__"] > div:not(:first-child) button',
      '[class*="SubmitReviewButton__"]',
    ],
  } satisfies SelectorChain,

  /** Bouton de complétion/merge (§6.5) — jamais intercepté, grisé visuellement seulement.
   *
   * MESURÉ le 2026-10-29 sur `test/fixtures/pages/01` — la seule capture d'une PR OUVERTE : le
   * bouton est un bouton Primer React, `button.prc-Button-ButtonBase-… [data-variant="primary"]`
   * libellé « Rebase and merge », premier item d'un `[data-component="ButtonGroup"]` (le second,
   * vide sur ce dépôt, porte le choix de la méthode quand il y en a plusieurs). Aucun `.btn-primary`
   * nulle part : aucun des candidats suivants ne matchait, et le §6.5 ne grisait plus rien sur
   * github.com. Le journal le disait — `merge-button`, sur chaque page —, noyé dans les entrées
   * des PR fusionnées où l'absence est la norme (cf. `prSettledState`).
   *
   * Non mesuré : l'étape de confirmation qui suit le clic, si GitHub en rend une. Le grisage ne
   * porte que sur le bouton affiché à l'arrivée sur la page. */
  mergeButton: {
    name: 'merge-button',
    candidates: [
      '[data-testid="mergebox-partial"] [data-component="ButtonGroup"] button[data-variant="primary"]', // MESURÉ
      '[data-testid="mergebox-partial"] button.btn-primary',
      'button[data-testid*="merge-button"]',
      '.merge-message button.btn-group-merge',
      'button.js-merge-commit-button',
    ],
  } satisfies SelectorChain,

  /** Sonde « cette PR ne peut PAS être fusionnée d'ici » — elle ne sert qu'à DÉCIDER si
   * l'absence de `mergeButton` est une dégradation (§9.4) ou le cas nominal, comme
   * `editingSurfaces` pour `editors`. Sur une PR fusionnée, fermée ou en brouillon, GitHub ne
   * rend aucun bouton de fusion : journaliser son absence remplissait le journal d'une entrée
   * par PR visitée, si bien que la vraie rupture — le bouton d'une PR OUVERTE devenu
   * introuvable — y passait pour du bruit.
   *
   * MESURÉ le 2026-10-29 : `[data-component="StateLabel"]` porte l'état de la PR dans
   * `data-status`, sur les deux vues — `pullOpened` sur la capture 01, `pullMerged` sur les
   * captures 02 à 07, Conversation comme Files changed. Les valeurs `pullClosed` et `draft` ne
   * figurent sur aucune capture : elles sont lues dans le source de `@primer/react` 38.43.0
   * (`StateLabel.js`, `octiconMap`), qui les définit à côté des deux mesurées. Un brouillon ne
   * se fusionne pas (§6.2.4) ; une PR fermée non plus.
   *
   * Restreinte à l'EN-TÊTE de la page (`prc-PageHeader-PageHeader`, où se trouve, mesuré, le
   * `StateLabel` de la PR sur chaque capture) : un `StateLabel` « Merged » ailleurs — une PR
   * citée dans la timeline — ferait sinon taire le journal sur une PR ouverte.
   *
   * Le sens de l'erreur est choisi : si cette sonde pourrit, elle ne matche plus, et
   * l'absence du bouton est journalisée comme avant — du bruit, jamais du silence.
   * `pullQueued` (file de fusion) n'y figure pas : ce que la page rend alors n'est pas
   * mesuré. */
  prSettledState: {
    name: 'pr-settled-state',
    candidates: [
      '[class*="prc-PageHeader-PageHeader"] [data-component="StateLabel"][data-status="pullMerged"]', // MESURÉ
      '[class*="prc-PageHeader-PageHeader"] [data-component="StateLabel"][data-status="pullClosed"]',
      '[class*="prc-PageHeader-PageHeader"] [data-component="StateLabel"][data-status="draft"]',
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
   * qu'ils se lisent, et non dans un attribut du DOM.
   *
   * ————— Les classes de modules CSS ont perdu leur préfixe (relevé du 2026-10-28) —————
   *
   * Huit pages capturées par l'utilisateur, extension désactivée, sont dans
   * `test/fixtures/pages/`. La chaîne `-module__` n'apparaît dans AUCUNE : là où le relevé du
   * 2026-09-04 lisait `ReviewThreadComment-module__SafeHTMLBox__…`, la page porte
   * `SafeHTMLBox__…`. Nous ne savons pas depuis quand : c'est ce que montrent ces pages, rien
   * de plus. Tout candidat qui en dépendait y matche zéro élément, et les candidats ajoutés le
   * même jour en sont les successeurs, chacun vérifié sur la capture qu'il cite. Le relevé
   * structurel ci-dessus reste juste, aux noms de classes près.
   *
   * Le préfixe portait le nom du COMPOSANT, et c'est lui qui rendait deux noms distincts :
   * `ReviewThread-module__ReviewThreadContainer` (le fil) et
   * `ReviewThreadComment-module__ReviewThreadContainer` (un commentaire) s'écrivent
   * désormais tous deux `ReviewThreadContainer__…`. Un successeur n'est donc pas toujours le
   * nom sans préfixe : `editForm` et `renderedComment` ont dû trouver une autre prise. Les
   * anciens candidats restent en tête de leurs chaînes : ils ne coûtent rien, et une chaîne
   * est faite pour qu'un nom d'hier côtoie celui d'aujourd'hui (§9.4). */

  /** Fils rendus sur la page — pour les ancres du bandeau (§5.5). */
  renderedThreads: {
    name: 'rendered-threads',
    candidates: ['[data-testid="review-thread"]', '.js-resolvable-timeline-thread-container'],
  } satisfies SelectorChain,

  /** Sonde « ce fil est REPLIÉ, son contenu n'est pas dans la page » — elle ne sert qu'à
   * DÉCIDER si un fil sans corps ni auteur lisibles est une dégradation (§9.4) ou le cas
   * nominal, comme `editingSurfaces` pour `editors`.
   *
   * MESURÉ le 2026-10-29 sur les captures 01, 02 et 06 (vue Conversation) : chaque fil y est un
   * `<review-thread-collapsible>`, et un fil résolu ou obsolète arrive REPLIÉ — un en-tête
   * « Comment thread », le lien du fichier, « Outdated » —, son contenu n'étant chargé qu'au
   * dépliage, depuis `data-deferred-content-url`. La correspondance est exacte sur les 28 fils
   * des trois captures : les 21 qui portent l'attribut n'ont ni corps ni auteur, les 7 qui ne le
   * portent pas (dépliés une fois, l'attribut disparaît avec le chargement) ont les deux.
   * `getThreads()` journalisait donc `comment-body` et `comment-author` sur toute PR ayant un
   * fil résolu — deux entrées qui ne disaient rien d'autre que « GitHub a replié un fil ».
   *
   * Si la sonde pourrit, elle ne matche plus, et le fil replié est journalisé comme avant :
   * du bruit, jamais du silence. */
  deferredThread: {
    name: 'deferred-thread',
    candidates: ['review-thread-collapsible[data-deferred-content-url]'], // MESURÉ
  } satisfies SelectorChain,

  /** L'état de résolution que le conteneur du fil porte LUI-MÊME — évalué sur le conteneur,
   * jamais sur ses descendants (`matchesChain`).
   *
   * MESURÉ le 2026-10-29 : sur la vue Conversation (captures 01, 02, 06), chaque
   * `<review-thread-collapsible>` porte `data-resolved="true"` ou `"false"`, replié ou non, et
   * aucun des marqueurs de `resolvedMarker` : les 28 fils y étaient lus `unknown`, donc comptés
   * NON résolus par le repli local du bandeau (§5.5) — deux fils `issue (blocking)` résolus de
   * la capture 01 y passaient pour bloquants. Le §9.2.3 réserve `unknown` à l'état « non rendu »
   * ; celui-ci l'est. Recoupé avec la vue Files changed de la MÊME PR (capture 05, lue par
   * `resolvedMarker`) : `r4398202547` y est résolu et porte `"true"` sur la capture 01,
   * `r4397911246` ne l'est pas et porte `"false"`. */
  threadResolvedFlag: {
    name: 'thread-resolved-flag',
    candidates: ['review-thread-collapsible[data-resolved="true"]'], // MESURÉ
  } satisfies SelectorChain,
  threadUnresolvedFlag: {
    name: 'thread-unresolved-flag',
    candidates: ['review-thread-collapsible[data-resolved="false"]'], // MESURÉ
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
      '[class*="HeaderLink__"]', // MESURÉ le 2026-10-28, `test/fixtures/pages/05`
      'a[href*="#"]',
    ],
  } satisfies SelectorChain,

  /** Conteneur des contrôles d'envoi d'un éditeur (§4.3) — générique, mais centralisé et
   * nommé (§9.4). */
  submitContainer: {
    name: 'submit-container',
    candidates: [
      'form',
      // MESURÉ sur la vue `…/changes` : ce composeur n'a AUCUN `form`, si bien que le repli de
      // `getSubmitControls()` — le parent direct du champ — tombait sur le `<span>` qui ne
      // contient que lui. Aucun contrôle d'envoi n'était donc branché, et sous `enforce` un
      // commentaire non conforme restait publiable au clic (revue, PR #52). Ce conteneur-ci
      // porte à la fois le champ et le pied qui tient les boutons.
      '[class*="MarkdownEditor-module__container"]',
      // Le panneau « Finish your comments » range ses boutons DEHORS : MESURÉ, ils vivent dans
      // l'overlay qui porte le panneau, dix niveaux au-dessus du champ, quand le candidat
      // ci-dessus matche bien plus tôt sans les contenir. C'est ce qui a imposé à
      // `getSubmitControls()` de retenir le premier conteneur qui porte des BOUTONS, et non le
      // premier qui matche.
      '[class*="prc-Overlay-Overlay"]',
      // MESURÉ le 2026-10-28 (`test/fixtures/pages/04` à `06`) : le candidat
      // `MarkdownEditor-module__container` ne matche plus. Son successeur s'appelle
      // `container__…`, nom que porte AUSSI l'enveloppe immédiate du champ, qui ne contient
      // aucun bouton — `getSubmitControls()` ne retenant qu'un ancêtre par candidat, il
      // s'arrêterait sur elle. Le `<fieldset>` du composeur est le premier ancêtre sans
      // homonyme qui porte le pied et ses boutons. Placé APRÈS l'overlay : dans le panneau de
      // revue, il existe aussi, mais sans les boutons, qui vivent dans l'overlay.
      'fieldset',
    ],
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
      // MESURÉ le 2026-10-28 (`test/fixtures/pages/06-files-modification-commentaire.html`) :
      // le successeur du candidat précédent, `ReviewThreadContainer__…`, n'est plus
      // discriminant — le conteneur du FIL et l'en-tête du fil portent le même nom, avec un
      // autre hachage, et le champ de réponse vit sous le premier. Ce qui ne désigne qu'un
      // commentaire est l'attribut que GitHub pose sur chacun, et sur lui seul.
      '[data-first-thread-comment]',
      // L'édition d'un commentaire de la CONVERSATION, MESURÉE le même jour
      // (`test/fixtures/pages/06-conversation-modification-commentaire.html`) : le formulaire
      // s'appelle `form.js-comment-update`, et `.js-comment-edit-form` n'existe plus sur la
      // page. La description de la PR porte la même classe, mais elle est écartée avant toute
      // classification (`observeEditors`, `prDescription`).
      'form.js-comment-update',
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
      '[data-first-thread-comment]', // MESURÉ le 2026-10-28 — voir `editForm`
    ],
  } satisfies SelectorChain,

  /** Corps d'un commentaire rendu — badges du §5.5. */
  commentBody: {
    name: 'comment-body',
    candidates: [
      '[data-testid="comment-body"]',
      '.comment-body',
      '[class*="ReviewThreadComment-module__SafeHTMLBox"]', // MESURÉ — porte aussi `.markdown-body`
      '[class*="SafeHTMLBox__"]', // MESURÉ le 2026-10-28, `test/fixtures/pages/05`
    ],
  } satisfies SelectorChain,

  /** Corps rendu par l'onglet « Preview » d'un champ en cours de rédaction — le §5.5 le
   * décore comme n'importe quel corps de commentaire, alors qu'il n'est pas publié. C'est un
   * comportement HÉRITÉ, pas une exigence : sur la génération ancienne, l'aperçu porte
   * `comment-body` et la chaîne ci-dessus l'attrape depuis toujours. Sur la vue `…/changes`,
   * elle ne l'attrapait pas, et l'écart entre les deux vues est le défaut signalé.
   *
   * POURQUOI UNE CHAÎNE À PART, et non un candidat de plus dans `comment-body` :
   * `queryChainAll` ne rend que les éléments du PREMIER candidat qui matche. Sur `…/changes`
   * ce premier candidat est celui des fils (`ReviewThreadComment-module__SafeHTMLBox`) ;
   * un candidat d'aperçu ajouté APRÈS lui n'y serait jamais atteint, et placé AVANT il
   * évincerait les corps de fil dès qu'un aperçu est ouvert. Les deux ensembles sont
   * disjoints : il leur faut deux lectures, que l'appelant réunit (`getRenderedComments`).
   *
   * MESURÉ, mais PAS sur le DOM de la page, et la nuance doit être écrite :
   * `…/changes` répond **302 vers `/files` sans session** (vérifié le 2026-09-05), cette vue
   * n'était donc pas ouvrable depuis l'environnement de développement. La mesure porte sur le
   * CODE LIVRÉ par `github.githubassets.com` — ce qui dit ce que le composant rend dans tous
   * les cas, et ne dit pas qu'il est bien celui que la page monte. Deux relevés du
   * 2026-09-05, chunks trouvés par la table de `wp-runtime-6ce19d92daee010e.js` :
   *
   *   - `pz-6fb14692eb5a8512.js` — l'éditeur, en mode aperçu, rend
   *
   *       <div aria-live="polite" tabindex="-1"
   *            class="MarkdownEditor-module__previewViewerWrapper__M5C8O …">
   *         <h2 class="MarkdownEditor-module__previewHeader__CZcUw">Rendered Markdown Preview</h2>
   *         <MarkdownViewer verifiedHTML=… />
   *
   *   - `wp-0857cd7042392755.js` — ce `MarkdownViewer` (`displayName`) rend son HTML dans un
   *     élément dont la classe vaut
   *     `cx("markdown-body", !fournie && "MarkdownViewer-module__markdownBody__yGuuU", fournie)` :
   *     `markdown-body` est INCONDITIONNELLE, la classe de module n'apparaît qu'à défaut de
   *     classe fournie par l'appelant. C'est la même fonction qui explique le corps de fil
   *     relevé le 2026-09-04 (`div.markdown-body.ReviewThreadComment-module__SafeHTMLBox__…`,
   *     où le fil FOURNIT sa classe) — un seul composant, deux habillages.
   *
   * D'où la prise en deux morceaux — l'enveloppe de l'aperçu, PUIS le corps — plutôt que la
   * seule classe `MarkdownViewer-module__markdownBody`, qui désignerait tout aperçu rendu
   * ailleurs sur la page. L'enveloppe seule ne conviendrait pas non plus : elle contient le
   * `<h2>` de titre, dont le texte entrerait dans le corps relu et casserait la
   * reconnaissance du préfixe.
   *
   * Le second candidat est le repli du premier : les deux classes sont sur le MÊME élément
   * aujourd'hui, et `markdown-body` — globale, ancienne, portée par tout markdown rendu de
   * GitHub — passe en tête parce qu'elle survivra plus longtemps qu'un nom de module CSS.
   *
   * Aucun candidat pour la génération héritée, et c'est délibéré : son aperçu porte
   * `comment-body` (`.previewable-comment-form .comment-body`, mesuré le même jour dans la
   * feuille de style livrée), la chaîne ci-dessus l'attrape déjà, et un candidat ici le ferait
   * décorer deux fois. */
  previewBody: {
    name: 'preview-body',
    candidates: [
      '[class*="MarkdownEditor-module__previewViewerWrapper"] .markdown-body',
      '[class*="MarkdownEditor-module__previewViewerWrapper"] [class*="MarkdownViewer-module__markdownBody"]',
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

  /** Date de création de la PR — lisible dans la page (§6.2.3), et décisive : c'est elle qui
   * range une PR avant ou après `activatedAt`, donc hors ou dans le périmètre où l'extension
   * bloque.
   *
   * MESURÉ le 2026-10-28 (`test/fixtures/pages/`, #84) : la chaîne d'avant finissait par
   * `relative-time` tout court, et c'est lui seul qui répondait, partout — la PREMIÈRE date du
   * document. L'en-tête de la page n'en porte pas sur une PR ouverte (capture 01), et sur une PR
   * fusionnée il porte la date de FUSION (« Reefact merged 9 commits… », captures 02 à 07) : la
   * même PR #331 se lisait 07:18 sur une page, 09:17 sur les autres. Le repli générique est
   * retiré : il trouvait toujours quelque chose, si bien qu'aucune rupture ne pouvait atteindre
   * le journal (§9.4). Mieux vaut une date inconnue — l'extension ne bloque alors jamais
   * (`resolveInScope`) — qu'une date fausse.
   *
   * L'horodatage de la DESCRIPTION de la PR est sa date de création : elle est publiée à
   * l'ouverture, et une modification ne le change pas. Mesuré sur deux PR où une seconde source
   * permettait de le vérifier (`pullRequestsLayoutRoute.pullRequest.createdTime`, voir
   * `prEmbeddedData`) : 07:18:01Z pour #331, 12:15:37Z pour #292, identiques. Sur la vue des
   * fichiers modifiés, aucun élément de la page ne porte cette date : c'est `prEmbeddedData`
   * qui prend le relais.
   *
   * UN SEUL candidat, et c'est voulu. Les deux d'en-tête qui suivaient
   * (`.gh-header-meta relative-time`, `[data-testid="pr-header"] relative-time`) ne matchent rien
   * sur les captures ; mais sur une page où ils matcheraient, rien ne dit qu'ils portent la
   * création plutôt que la FUSION — c'est précisément ce que porte l'en-tête mesuré —, et ils
   * passaient avant les données embarquées sans rien journaliser (revue Reefact, PR #86). Un
   * candidat n'entre ici que s'il désigne une date identifiable comme celle de la création. */
  prCreatedAt: {
    name: 'pr-created-at',
    candidates: ['[id^="pullrequest-"] relative-time'],
  } satisfies SelectorChain,

  /** Les données que la vue React embarque dans la page, en JSON — la seule source de la date
   * de création sur la vue des fichiers modifiés (`payload.pullRequestsLayoutRoute.pullRequest
   * .createdTime`, MESURÉ le 2026-10-28, captures 02 et 04 à 07). C'est du DOM, pas une API
   * (§10) : un `<script>` de la page, lu tel quel.
   *
   * Ces données peuvent appartenir à une AUTRE page : sur la capture 03 (PR #294), elles
   * décrivent la liste des PR du dépôt, restées d'une navigation précédente. Elles ne sont donc
   * lues que si elles désignent la PR de l'URL — son NUMÉRO et son DÉPÔT
   * (`pullRequestsLayoutRoute.repository.ownerLogin` et `.name`, présents sur toutes les
   * captures) : deux dépôts ont chacun leur PR #331 (revue Reefact, PR #86). */
  prEmbeddedData: {
    name: 'pr-embedded-data',
    candidates: ['script[type="application/json"][data-target="react-app.embeddedData"]'],
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
