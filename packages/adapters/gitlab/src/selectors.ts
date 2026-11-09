// Sélecteurs DOM GitLab — centralisés dans un fichier unique, versionné et documenté (§9.4).
//
// Chaque candidat est MESURÉ sur une capture réelle de gitlab.com (2026-11-08,
// test/fixtures/pages/, détail dans CAPTURES.md) et la cite. Rien n'est déduit : ce que les
// captures ne montrent pas n'a pas de candidat (skill plateforme, étape 4).
//
// Plusieurs générations de DOM coexistent à un même instant (§C.3, au titre du §A.5) : l'Overview,
// l'onglet Changes en vue Rapid Diffs (par défaut) et en vue classique, et deux éditeurs — une
// <textarea> Markdown ou un éditeur de texte enrichi (§C.2). Les chaînes les couvrent toutes ;
// quand aucune ne matche, la dégradation silencieuse s'applique zone par zone (CA-11).
//
// Les prises préférées sont les `data-testid`, posés exprès par GitLab ; les classes ne servent
// que là où aucun attribut de sens n'existe. Un même `data-testid` désigne parfois des rôles
// différents selon la vue (« reply-comment-button » est « Add comment now » sur une réponse et
// « Save comment » sur une édition) : le rôle se lit alors sur le FORMULAIRE, pas sur le bouton.
//
// Les candidats d'une chaîne sont des REPLIS ORDONNÉS, jamais une union : `queryChainAll` rend
// les éléments du PREMIER candidat qui trouve quelque chose. Quand une chaîne doit rendre
// PLUSIEURS sortes d'éléments à la fois (les champs de toutes les zones, tous les boutons d'envoi
// d'un formulaire), l'union s'écrit en UN candidat, liste de sélecteurs CSS. Une première écriture
// listait ces sortes comme candidats séparés : dans l'Overview, `comment-field` trouvait le champ
// général et les champs de réponse n'étaient jamais observés.

import type { SelectorChain } from '@cct/adapter-shared';

export const selectors = {
  /** Champs de saisie Markdown — une <textarea> par zone. MESURÉ le 2026-11-08 :
   *   - `comment-field` : nouveau commentaire général (01, 03, 06, 07, 08, 09) ;
   *   - `reply-field` : réponse (02, 05), nouveau commentaire de ligne (04) ET modification (06),
   *     dans les trois vues — le même attribut pour trois zones, que seul le contexte distingue
   *     (CAPTURES.md, « Editing a published comment ») ;
   *   - `review[note]` : corps de revue, dans le panneau « Submit your review » (07-…-corps-revue),
   *     `data-testid="comment-textarea"`.
   * Les <textarea data-update-url> qui portent la source Markdown des commentaires publiés ne sont
   * PAS des champs de saisie (03) : aucun candidat ne les prend. */
  editors: {
    name: 'editors',
    candidates: [
      'textarea[data-testid="comment-field"], textarea[data-testid="reply-field"], textarea[name="review[note]"]',
    ],
  } satisfies SelectorChain,

  /** Éditeur de TEXTE ENRICHI (ProseMirror), qui remplace la <textarea> quand l'utilisateur a
   * choisi ce mode — choix mémorisé pour son compte (§C.2). MESURÉ : 01-…-texte-riche,
   * 04-…-texte-riche, 05-…-texte-riche, 06-overview-…-texte-riche ; `aria-label` « Comment » ou
   * « Reply to comment » selon la zone, comme la <textarea> qu'il remplace. L'écriture y est à
   * établir (§C.2), et l'adaptateur ne le lit pas : aucun code livré ne consulte cette chaîne.
   * Elle sert aux tests sur pages réelles, qui établissent que l'éditeur est là ET qu'aucun champ
   * n'est observé, et à `check:captured-selectors` ; le jour où l'écriture sera mesurée, c'est
   * par elle que l'adaptateur le reconnaîtra. */
  richTextEditors: {
    name: 'rich-text-editors',
    candidates: ['div[contenteditable="true"].ProseMirror'],
  } satisfies SelectorChain,

  /** Formulaire du nouveau commentaire général — zone `conversation`. MESURÉ dans toutes les
   * captures de l'Overview (01 à 09), dans les deux modes d'éditeur ; absent de Changes. */
  conversationForm: {
    name: 'conversation-form',
    candidates: ['form.js-main-target-form', 'form[data-testid="comment-form"]'],
  } satisfies SelectorChain,

  /** Formulaire d'un champ de fil : réponse, nouveau commentaire de ligne, modification.
   * MESURÉ : le MÊME formulaire porte les trois (02, 04, 05, 06, dans les trois vues et les deux
   * modes) — il ne dit pas, à lui seul, de quelle zone il s'agit (CAPTURES.md). */
  threadForm: {
    name: 'thread-form',
    candidates: ['form.edit-note'],
  } satisfies SelectorChain,

  /** ZONE d'un champ de fil — le formulaire ne la dit pas (`threadForm`), ses ANCÊTRES si.
   * Règle MESURÉE sur les douze champs de fil des captures (02, 04 ×4, 05 ×3, 06 ×4 : Overview,
   * Rapid Diffs, vue classique ; Markdown et texte enrichi), sans exception :
   *   1. entouré de `replyWrapper` → RÉPONSE ;
   *   2. sinon, entouré de `noteContainer` → MODIFICATION du commentaire de ce conteneur ;
   *   3. sinon → NOUVEAU FIL de ligne.
   * L'ORDRE compte : en Rapid Diffs, une réponse est AUSSI dans le conteneur de la note à laquelle
   * elle répond (05) — testée en second, cette marque la prendrait pour une modification.
   * Confirmation indépendante, dans les mêmes captures : le formulaire d'une modification est le
   * seul sans aucun bouton de revue (`start-review-button` / `add-to-review-button`).
   * Écartées parce qu'elles ne valent que dans certaines vues : `.note-body` (absent de l'édition
   * en Rapid Diffs), `.discussion-reply-holder` (absent des réponses en Rapid Diffs, présent sur un
   * nouveau fil classique), `.note-edit-form` (présent sur des réponses). */
  replyWrapper: {
    name: 'reply-wrapper',
    candidates: ['[data-testid="reply-wrapper"]'],
  } satisfies SelectorChain,

  /** Conteneur d'un commentaire publié — `li#note_<id>`. MESURÉ dans les trois vues (03, 05, 06) ;
   * `data-testid="noteable-note-container"` y est partout, `data-note-id` seulement dans l'Overview
   * et la vue classique : l'identifiant se lit sur l'`id` (`note_<id>`), commun aux trois.
   * PAS de repli sur `li[id^="note_"]` : une NOTE SYSTÈME (« closed », 08) a cette forme —
   * `li#note_<empreinte>.system-note`, sans le `data-testid` — et le repli la prendrait pour un
   * commentaire, quand le §4.2 exempte les messages de plateforme. */
  noteContainer: {
    name: 'note-container',
    candidates: ['li[data-testid="noteable-note-container"]'],
  } satisfies SelectorChain,

  /** Un FIL (discussion) rendu. MESURÉ dans les trois vues : Overview `div.discussion` (03, 06),
   * vue classique idem (05-, 06-changes-classique), Rapid Diffs `li.js-discussion-container`
   * (03-changes, 05, 06-changes) — tous portent `data-testid="discussion-content"` et
   * `data-discussion-resolvable`. Ses notes sont les `noteContainer` qu'il contient, la première
   * étant la racine du fil, les suivantes ses réponses (03-overview-commentaires-discussion).
   *
   * L'identifiant NATIF du fil n'est pas dans les captures, et c'est mesuré : la page vivante le
   * porte sur `div[data-discussion-id]` (Overview, 2026-11-08, nom d'attribut relevé sans sa
   * valeur), et l'API rend une empreinte hexadécimale de 40 caractères — que la réduction retire
   * comme opaque. L'identifiant d'un fil est donc celui de sa PREMIÈRE note (`note_<id>`), lu sur
   * `threadAnchor` quand il existe, sur le premier `noteContainer` sinon. */
  thread: {
    name: 'thread',
    candidates: ['[data-testid="discussion-content"]'],
  } satisfies SelectorChain,

  /** Lien d'horodatage de la première note d'un fil — `href="#note_<id>"`. MESURÉ dans l'Overview et
   * la vue classique : dans CHAQUE fil, résolu ou non, il désigne la première note, sans un seul
   * écart (03, 05-, 06-changes-classique, 06, 07, 09) — et il est le SEUL porteur de cet
   * identifiant dans un fil résolu, replié sans aucune note (03-overview-fil-resolu). Absent en
   * Rapid Diffs (03-, 04-, 05-, 06-changes) : l'identifiant s'y lit sur la première note. */
  threadAnchor: {
    name: 'thread-anchor',
    candidates: ['a.note-timestamp[href^="#note_"]'],
  } satisfies SelectorChain,

  /** Marque d'un fil RÉSOLU, sur le conteneur du fil. MESURÉ : `data-discussion-resolved="true"`
   * sur le seul fil résolu de 03-overview-fil-resolu, absente des cinq autres et de tous les fils
   * des autres captures. Un fil résolu y est REPLIÉ : son en-tête reste, ses notes non.
   * En Rapid Diffs, un fil résolu n'est PAS DANS LE DOM (03-changes-fil-resolu : aucune trace de sa
   * note) : l'état résolu ne se lit que dans l'Overview ou la vue classique — §C.5. */
  threadResolved: {
    name: 'thread-resolved',
    candidates: ['[data-discussion-resolved="true"]'],
  } satisfies SelectorChain,

  /** Marque d'un fil OUVERT — résoluble et non résolu, sur le conteneur du fil. MESURÉ : tous les
   * fils non résolus des captures portent `data-discussion-resolvable="true"` sans
   * `data-discussion-resolved`, dans l'Overview comme en Rapid Diffs (03, 03-changes, 05, 06…) ;
   * le seul fil résolu porte les deux (03-overview-fil-resolu). Sans cette marque, un fil ouvert
   * et un fil dont l'état n'est pas rendu se confondraient (`unknown`). */
  threadUnresolved: {
    name: 'thread-unresolved',
    candidates: ['[data-discussion-resolvable="true"]:not([data-discussion-resolved="true"])'],
  } satisfies SelectorChain,

  /** Auteur de la RÉSOLUTION d'un fil résolu (§6.1, `resolvedBy`). MESURÉ : dans l'en-tête replié,
   * « Resolved just now by Sylvain AURAT », suivi d'un lien `a.js-user-link[href="/<username>"]` —
   * SANS `data-username`, le nom se lit sur le chemin (03-overview-fil-resolu). Absent de tout fil
   * non résolu de la même capture. */
  threadResolver: {
    name: 'thread-resolver',
    candidates: ['.discussion-headline-light a.js-user-link'],
  } satisfies SelectorChain,

  /** Corps RENDU d'un commentaire publié, cherché DANS son `noteContainer`. MESURÉ : `.note-text.md`
   * dans l'Overview et la vue classique (03, 05-, 06-changes-classique), `.md` seul en Rapid Diffs
   * (03-changes) ; un commentaire portant un bloc de suggestion a `.md.suggestions` SANS
   * `.note-text`, même dans l'Overview (03-overview-commentaires-discussion). D'où un seul candidat
   * qui couvre les deux formes, plutôt qu'une chaîne dont le premier maillon matcherait la
   * plupart des notes et ferait manquer les autres.
   * Chaque bloc Markdown y est un enfant direct (`p`, `ul`, `div.markdown-code-block`), avec son
   * `data-sourcepos` ; la ligne de préfixe est un `p`, pas forcément le premier (code cité avant). */
  commentBody: {
    name: 'comment-body',
    candidates: ['div.note-text, div.md'],
  } satisfies SelectorChain,

  /** Bloc de suggestion natif (§C.6), dans un corps rendu. MESURÉ : 03-overview- et
   * 03-changes-commentaires-discussion — `div.md-suggestion`, alors qu'un bloc de code ordinaire est
   * `div.markdown-code-block > pre.code` (même capture). La spec n'en fixe pas encore le marqueur
   * pour GitLab : cette chaîne MESURE le rendu, elle ne déclenche pas l'étage 0. */
  suggestionBlock: {
    name: 'suggestion-block',
    candidates: ['div.md-suggestion'],
  } satisfies SelectorChain,

  /** Auteur d'un commentaire, DANS son `noteContainer` : `data-username` du lien d'utilisateur.
   * MESURÉ dans les trois vues (03, 05, 06) — `a.author-name-link` n'existe pas en Rapid Diffs,
   * `a.js-user-link[data-username]` partout. */
  commentAuthor: {
    name: 'comment-author',
    candidates: ['a.js-user-link[data-username]'],
  } satisfies SelectorChain,

  /** Corps de l'APERÇU d'un commentaire en cours de rédaction (§5.5). MESURÉ : 09-overview-apercu —
   * `div.md` dans `.md-preview-holder`, à l'intérieur du formulaire. Le porteur EXISTE dans tout
   * formulaire, aperçu fermé (03, 06, 07…) : il y est alors VIDE (texte de longueur nulle, mesuré).
   * Trouver l'élément ne dit donc pas qu'un aperçu est affiché ; son contenu, si. */
  previewBody: {
    name: 'preview-body',
    candidates: ['.md-preview-holder > div.md'],
  } satisfies SelectorChain,

  /** Panneau de soumission de revue — zone `review-body`. MESURÉ : 07-overview-panneau-revue et
   * 07-overview-corps-revue, un tiroir `.gl-drawer-body` ouvert par « Your review ». */
  reviewDrawer: {
    name: 'review-drawer',
    candidates: ['.gl-drawer-body'],
  } satisfies SelectorChain,

  /** Contrôles d'ENVOI, cherchés DANS le formulaire de l'éditeur. Les `data-testid` changent
   * selon la vue et l'état — MESURÉ, aucun n'est commun à tous les contextes :
   *   - formulaire principal : `button[type="submit"]` (« Comment », « Start thread », « Add
   *     internal note » — 01, 01-…-type-fil, 01-…-note-interne) et `start-review-button` ; revue en
   *     cours : `add-to-review-button` et `add-comment-now-button` (07) ;
   *   - fil, Overview et vue classique : `comment-now-button`, `start-review-button` (02, 04- et
   *     05-changes-classique) ;
   *   - fil, Rapid Diffs : `reply-comment-button`, `add-to-review-button` (04, 05, 04-mr2) ;
   *   - modification, toutes vues : `reply-comment-button` (« Save comment », 06) ;
   *   - corps de revue : `submit-review-button` (07-…-corps-revue).
   * Champ vide, ces boutons portent `aria-disabled="true"` SANS l'attribut `disabled` (01, 02, 04) :
   * aucun candidat ne filtre sur `:disabled` / `:enabled`, qui ne le verraient pas. */
  submitButtons: {
    name: 'submit-buttons',
    candidates: [
      'button[type="submit"], button[data-testid="start-review-button"], button[data-testid="add-to-review-button"], ' +
        'button[data-testid="add-comment-now-button"], button[data-testid="comment-now-button"], ' +
        'button[data-testid="reply-comment-button"]',
    ],
  } satisfies SelectorChain,

  /** Second chemin d'envoi du formulaire principal : ce bouton FERME (ou rouvre) la merge request
   * et, champ rempli, publie le commentaire en même temps. MESURÉ : « Close merge request » champ
   * vide (01), « Comment and close merge request » champ rempli (01-…-rempli), « Start thread and
   * close… » (01-…-type-fil), « Add internal note and close… » (01-…-note-interne), « Reopen merge
   * request » sur une merge request fermée (08). Il n'envoie un commentaire que si le champ en
   * porte un : l'intercepter champ vide bloquerait une fermeture sans commentaire. */
  closeReopenButton: {
    name: 'close-reopen-button',
    candidates: ['button[data-testid="close-reopen-button"]'],
  } satisfies SelectorChain,

  /** Bouton d'envoi du corps de revue. MESURÉ : 07-overview-panneau-revue, 07-overview-corps-revue. */
  submitReviewButton: {
    name: 'submit-review-button',
    candidates: ['button[data-testid="submit-review-button"]'],
  } satisfies SelectorChain,

  /** Contrôles qui ANNULENT — jamais interceptés (skill plateforme, étape 4). MESURÉ :
   * `cancel` en Rapid Diffs et sur toute modification (04, 05, 06), `cancelBatchCommentsEnabled`
   * sur une réponse de l'Overview et de la vue classique (02, 04- et 05-changes-classique),
   * « Discard review » dans le tiroir de revue (07). Un formulaire de fil porte AUSSI un « Cancel »
   * sans `data-testid`, avec les contrôles de téléversement : ce n'est pas celui qu'on voit, et
   * cliquer dessus n'a pas fermé le formulaire (06-changes, CAPTURES.md) — aucun candidat ne le
   * prend. */
  cancelButtons: {
    name: 'cancel-buttons',
    candidates: [
      'button[data-testid="cancel"], button[data-testid="cancelBatchCommentsEnabled"], button[data-testid="discard-review-btn"]',
    ],
  } satisfies SelectorChain,

  /** Élément après lequel insérer le bandeau du §5.5 — « en tête de MR », sous le titre, dans le
   * flux de la page. MESURÉ : `.detail-page-header` (titre `h1[data-testid="title-content"]`) dans
   * l'Overview, Rapid Diffs et la vue classique (01, 04, 04-changes-classique, 08). */
  bannerMount: {
    name: 'banner-mount',
    candidates: ['.detail-page-header'],
  } satisfies SelectorChain,

  /** État de la merge request, QUEL QU'IL SOIT. MESURÉ : le badge de l'en-tête collant porte
   * l'état dans son `aria-label` — « Open » (01, 04, 04-changes-classique), « Closed » (08). C'est
   * un texte d'interface, donc localisé : il ne peut servir à aucune décision. **Aucun code ne le
   * lit encore** : l'adaptateur GitHub recopie ce fait dans le relevé d'une ligne du journal
   * (§9.4), l'adaptateur GitLab journalise sans relevé. La chaîne est mesurée et contrôlée par
   * `check:captured-selectors`, en attente de ce branchement. */
  prStateLabel: {
    name: 'pr-state-label',
    candidates: ['.merge-request-sticky-header .gl-badge[aria-label]'],
  } satisfies SelectorChain,

  /** Utilisateur courant (§6.1) — le nom se lit sur le CHEMIN du lien de son menu (`href="/<username>"`),
   * qui ne porte pas de `data-username`. MESURÉ sur toutes les vues (01, 04, 04-changes-classique,
   * 08). */
  currentUser: {
    name: 'current-user',
    candidates: ['a[data-testid="user-menu-toggle"][href]'],
  } satisfies SelectorChain,

  /** Date de CRÉATION de la merge request (§6.2.3) — c'est elle qui la range avant ou après
   * `activatedAt`. MESURÉ : la ligne « … requested to merge … » de l'en-tête porte un
   * `time[datetime]`, ENFANT DIRECT de `.detail-page-description` à côté du bloc de l'auteur — et
   * unique dans ce bloc, sur toutes les captures (une première écriture le cherchait DANS le bloc de
   * l'auteur et ne trouvait rien). Valeur : 18:24:04Z pour !1, 18:24:06Z pour !2, égale au
   * `created_at` de l'API à la seconde près — alors que !1 avait été modifiée à 20:44, et que !2,
   * fermée (08), garde la même date. Présent dans les trois vues. UN SEUL candidat : aucun repli
   * générique sur la première `time` du document, qui porterait une autre date sans le dire
   * (même leçon que GitHub). */
  prCreatedAt: {
    name: 'pr-created-at',
    problem: 'pr-creation-date',
    candidates: ['.detail-page-description > time[datetime]'],
  } satisfies SelectorChain,

  /** Merge request ARRÊTÉE — l'absence du bouton de fusion y est la norme (§9.4). MESURÉ :
   * `[data-testid="reopen-merge-request"]` sur la merge request fermée (08), absent de toutes les
   * captures d'une merge request ouverte. Une merge request FUSIONNÉE n'est pas capturée (§C.6) :
   * aucun candidat ne la décrit, et sur elle l'absence du bouton sera journalisée — une ligne de
   * trop, jamais un blocage de trop. Aucun candidat sur le libellé localisé de l'état. */
  prSettledState: {
    name: 'pr-settled-state',
    candidates: ['[data-testid="reopen-merge-request"]'],
  } satisfies SelectorChain,

  /** Contrôle de complétion — le bouton de fusion (§6.5, §9.4). MESURÉ : présent dans l'Overview
   * d'une merge request ouverte (01, 01-…-mr2) ; absent sur une merge request fermée (08) ; et
   * absent de TOUTES les captures de l'onglet Changes (`…/diffs`), dans les deux vues (03- à
   * 06-changes) — le widget de fusion n'y est pas rendu. Dans ces deux cas, son absence est la
   * NORME, pas une rupture de sélecteur. */
  mergeButton: {
    name: 'merge-button',
    problem: 'completion-control',
    candidates: ['button[data-testid="merge-button"]'],
  } satisfies SelectorChain,
};
