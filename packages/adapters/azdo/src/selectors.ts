// Sélecteurs DOM Azure DevOps — centralisés dans un fichier unique, versionné et documenté (§9.4).
//
// Chaque candidat est MESURÉ sur une capture réelle de dev.azure.com (2026-11-09,
// test/fixtures/pages/, détail dans CAPTURES.md) et la cite par son numéro d'état. Rien n'est
// déduit : ce que les captures ne montrent pas n'a pas de candidat (skill plateforme, étape 4). La
// version précédente de ce fichier avait été écrite de mémoire, sans aucune capture ; aucune de
// ses chaînes n'a été reprise.
//
// Une seule génération de DOM a été vue (« repos- », l'interface « bolt » d'Azure DevOps
// Services), dans deux vues — Overview et Files —, et dans les modes de diff Inline,
// Side-by-side et plein écran. La largeur de la fenêtre ne change rien à ce qui est lu ici
// (mesuré à 1279 et 806 px, CAPTURES.md).
//
// Azure DevOps ne pose ni `data-testid` ni identifiant de commentaire sur ces pages : les prises
// sont des classes de COMPOSANT (`repos-…`, nommées par le produit), jamais des classes
// utilitaires seules. Les textes d'interface sont localisés et ne servent de prise nulle part —
// à une exception près, écrite à son endroit (`threadStateLabel`).
//
// Les candidats d'une chaîne sont des REPLIS ORDONNÉS, jamais une union : `queryChainAll` rend
// les éléments du PREMIER candidat qui trouve quelque chose. Une union s'écrit en UN candidat.

import type { SelectorChain } from '@cct/adapter-shared';

export const selectors = {
  /** Champs de saisie — une <textarea> par éditeur ouvert, dans TOUTES les zones : nouveau
   * commentaire général (01), réponse (02, 05), nouveau fil de ligne (04), modification (06), dans
   * les deux vues et les trois modes de diff. Chaque éditeur porte DEUX <textarea> : la vraie, et
   * sa jumelle `bolt-textfield-auto-adjust-hidden` qui sert à calculer la hauteur, sans
   * `aria-label` — jamais un champ. Cherchées DANS un fil : la description de la PR n'est pas une
   * zone du §4.1. Avant le clic, le champ général et chaque champ de réponse sont un <input>
   * replié (01-…-replie, 03) : ce n'est pas l'éditeur, le clic le remplace. */
  editors: {
    name: 'editors',
    problem: 'editor-field',
    candidates: ['.repos-discussion-thread textarea.bolt-textfield-input:not(.bolt-textfield-auto-adjust-hidden)'],
  } satisfies SelectorChain,

  /** Un FIL — publié, ou en cours de création (le nouveau commentaire général et le nouveau fil de
   * ligne sont un `.repos-discussion-thread` SANS commentaire, 01 et 04). Le même conteneur dans
   * l'Overview (fil d'activité) et dans Files (`.repos-editor-discussion`). */
  thread: {
    name: 'thread',
    candidates: ['.repos-discussion-thread'],
  } satisfies SelectorChain,

  /** Un commentaire PUBLIÉ, dans son fil : la racine est le premier, les réponses les suivants
   * (03 : `issue (blocking)` puis sa réponse `done:`). En modification, l'éditeur est DANS le
   * commentaire modifié (06, les trois captures) — et nulle part ailleurs. */
  comment: {
    name: 'comment',
    candidates: ['.repos-discussion-comment'],
  } satisfies SelectorChain,

  /** Corps RENDU d'un commentaire, cherché DANS son `comment` — la description de la PR porte
   * aussi un `.markdown-content`, hors de tout commentaire (03). Paragraphes `<p>`, listes `<ul>`,
   * blocs de code `div.copy-btn-container > pre.hljs`, bloc de suggestion natif
   * `div[id^="md-transform-replacement-"]` (03-files-suggestion-native). Reste affiché pendant la
   * modification, sous l'éditeur (06). */
  commentBody: {
    name: 'comment-body',
    problem: 'comment-text',
    candidates: ['.markdown-content'],
  } satisfies SelectorChain,

  /** APERÇU d'un commentaire en cours de rédaction (§5.5) — Azure DevOps le rend EN DIRECT sous
   * l'éditeur dès que le champ a du texte, sans onglet *Preview* : un `.markdown-content` dans la
   * rangée de l'éditeur (01-, 02-, 04-, 05-…-rempli), absent champ vide (01, 02, 04, 05). En
   * MODIFICATION, l'aperçu est le corps affiché dans le commentaire modifié (06) : `commentBody`
   * le lit déjà. (Validation du propriétaire, 2026-11-09 : l'état 9 avait d'abord été déclaré
   * « sans objet », faute d'onglet.) */
  previewBody: {
    name: 'preview-body',
    candidates: ['.repos-discussion-thread-reply .markdown-content'],
  } satisfies SelectorChain,

  /** Bouton « Copy to clipboard » qu'Azure DevOps pose DANS le corps rendu, avant chaque bloc de
   * code (03, le commentaire à code cité) : son texte précéderait la ligne de préfixe à la
   * lecture du corps. Retiré du texte lu, jamais de la page. */
  codeCopyButton: {
    name: 'code-copy-button',
    candidates: ['.copy-btn-container > button.copy-btn'],
  } satisfies SelectorChain,

  /** Porteur de l'identifiant NATIF d'un fil : le champ de réponse REPLIÉ (`<input>` « Write a
   * reply... ») porte la classe `threadId-<n>`, `n` étant l'identifiant du fil dans l'API
   * (03 : `threadId-1` à `threadId-9`, chacun dans le fil que l'API désigne ainsi). Un éditeur
   * de nouveau fil porte `threadId--1` (01, 04) : pas un identifiant. QUAND LA RÉPONSE EST
   * OUVERTE, le champ replié est remplacé et la marque disparaît avec lui (02 : aucun attribut du
   * fil ne la porte plus) — l'identifiant est alors celui qu'on a lu plus tôt, s'il l'a été. */
  threadIdCarrier: {
    name: 'thread-id-carrier',
    candidates: ['input.bolt-textfield-input[class*="threadId-"]'],
  } satisfies SelectorChain,

  /** Auteur d'un commentaire, DANS son `comment` : la pastille de l'en-tête porte le NOM AFFICHÉ
   * dans `aria-label` (03). Aucun identifiant de compte n'est dans la page. */
  commentAuthor: {
    name: 'comment-author',
    candidates: ['.repos-comment-header-persona[aria-label]'],
  } satisfies SelectorChain,

  /** Date d'un commentaire, DANS son `comment` : `time[datetime]` de l'en-tête, à la milliseconde
   * (03 : 21:02:34.590Z pour la racine du fil 2, 21:02:34.767Z pour sa réponse). */
  commentTime: {
    name: 'comment-time',
    candidates: ['time[datetime]'],
  } satisfies SelectorChain,

  /** Numéro d'un commentaire DANS son fil : `button#__bolt-delete-comment-<n>` (03 : 1 pour la
   * racine, 2 pour la réponse). Le bouton *Delete* n'est rendu que sur les commentaires de
   * l'utilisateur courant — toutes les captures ont un seul auteur : sur un commentaire d'autrui,
   * son absence est à prévoir (à vérifier). */
  commentDeleteButton: {
    name: 'comment-delete-button',
    candidates: ['button[id^="__bolt-delete-comment-"]'],
  } satisfies SelectorChain,

  /** Libellé de l'ÉTAT d'un fil, dans l'en-tête de sa racine — **texte d'interface, donc
   * localisé**. Aucune marque de structure ne distingue un fil résolu d'un fil actif : classes,
   * attributs et balisage sont identiques, seul le texte change (03-overview-fils-resolus,
   * comparaison complète dans CAPTURES.md). C'est la seule lecture de texte de cet adaptateur, et
   * elle ne décide que d'un AFFICHAGE (§10 : l'extension ne tranche rien sur cet état). Libellés
   * mesurés, interface en anglais : « Active », « Pending », « Resolved » (statut `fixed`),
   * « Won't fix », « Closed » — et « Unknown » pour un fil `byDesign` (03-…-pr2), que la page
   * affiche ainsi. */
  threadStateLabel: {
    name: 'thread-state-label',
    candidates: ['.repos-discussion-comment .bolt-dropdown-expandable-button-label'],
  } satisfies SelectorChain,

  /** Bouton du pied d'un fil, à côté du champ de réponse REPLIÉ — « Resolve » sur un fil actif ou
   * en attente, « Reactivate » sur un fil résolu, quel qu'en soit le statut, `byDesign` compris
   * (03-overview-fils-resolus, 03-…-pr2). Texte localisé lui aussi : second signal, pour le seul
   * fil `byDesign` dont le libellé d'état dit « Unknown ». ENFANT DIRECT de la rangée du champ
   * replié : quand la réponse est ouverte, la rangée devient l'éditeur, ses boutons (*Cancel*,
   * *Reply*…) sont plus profonds et ne sont pas pris (02, 05). */
  threadFooterButton: {
    name: 'thread-footer-button',
    candidates: ['.repos-discussion-thread-reply .repos-comment-editor-max-width > button.bolt-button'],
  } satisfies SelectorChain,

  /** Fil de LIGNE dans la vue Files : son conteneur `.repos-editor-discussion` est intercalé dans
   * le diff (03-files, 04, 05, 06-files, en Inline comme en Side-by-side). Un nouveau fil qui s'y
   * trouve est un commentaire de ligne ; ailleurs — le fil d'activité de l'Overview —, un nouveau
   * fil est un commentaire général (01). */
  diffDiscussion: {
    name: 'diff-discussion',
    candidates: ['.repos-editor-discussion'],
  } satisfies SelectorChain,

  /** Le composeur d'un nouveau commentaire GÉNÉRAL — le cas que le repli de `#contextOf()` classe
   * `conversation` sans l'avoir reconnu (§4.1, §9.4, #168). Ne sert qu'à DÉCIDER si ce repli est le
   * cas nominal ou un champ qu'aucune règle n'a situé, journalisé alors sans que la zone change.
   *
   * MESURÉ le 2026-11-10 sur toutes les captures : le repli n'est atteint que par le champ des
   * captures 01 de l'Overview, dans le fil d'activité (`activityFeed`, même tableau). */
  generalComposer: {
    name: 'general-composer',
    problem: 'editor-zone',
    candidates: ['table.activity-feed-list'],
  } satisfies SelectorChain,

  /** Contrôles d'ENVOI, cherchés DANS le conteneur de l'éditeur (`.repos-comment-editor-fit`).
   * Le pied de l'éditeur est une rangée de boutons dont *Cancel* est TOUJOURS le premier (01, 02,
   * 04, 06 — les quatre sortes d'éditeur), suivi de :
   *   - nouveau fil : *Comment* (`#__bolt-comment--<n>`, primaire) ;
   *   - réponse : *Reply & resolve* puis *Reply* (primaire) — *Reply & reactivate* à la place du
   *     premier sur un fil déjà résolu (vu le 2026-11-10, hors des captures) ;
   *   - modification : *Update & resolve* puis *Update* (primaire).
   * D'où « tout bouton de la rangée sauf le premier », sans aucun libellé. Champ vide, ils portent
   * `aria-disabled="true"` et la classe `disabled`, SANS l'attribut `disabled` (01, 02, 06) : aucun
   * candidat ne filtre sur `:disabled` / `:enabled`. Les boutons de la barre d'outils (mise en
   * forme, mentions, suggestion) sont dans une autre rangée. */
  submitButtons: {
    name: 'submit-buttons',
    problem: 'submit-control',
    candidates: ['.justify-end > .flex-row > button.bolt-button:not(:first-child)'],
  } satisfies SelectorChain,

  /** Bouton d'envoi PRIMAIRE de la rangée — *Comment*, *Reply*, *Update* (01, 02, 06). Les autres
   * boutons d'envoi (*… & resolve*) publient ET changent l'état du fil (§B.6). */
  primarySubmit: {
    name: 'primary-submit',
    candidates: ['button.primary'],
  } satisfies SelectorChain,

  /** Le bouton qui ANNULE — jamais intercepté (skill plateforme, étape 4) : le premier de la
   * rangée, sur les quatre sortes d'éditeur (01, 02, 04, 06). */
  cancelButton: {
    name: 'cancel-button',
    candidates: ['.justify-end > .flex-row > button.bolt-button:first-child'],
  } satisfies SelectorChain,

  /** Conteneur d'un éditeur — sa barre d'outils, son champ et sa rangée de boutons (01, 02, 04,
   * 06). Les boutons d'envoi se cherchent DEDANS : la page en contient plusieurs à la fois. */
  editorContainer: {
    name: 'editor-container',
    candidates: ['.repos-comment-editor-fit'],
  } satisfies SelectorChain,

  /** Élément après lequel insérer le bandeau du §5.5 — l'en-tête de la PR, titre et actions.
   * MESURÉ dans toutes les captures, plein écran compris (où il se réduit à une ligne). */
  bannerMount: {
    name: 'banner-mount',
    candidates: ['.repos-pr-header'],
  } satisfies SelectorChain,

  /** PR ARRÊTÉE — l'absence du bouton de complétion y est la norme (§9.4). MESURÉ : la pastille
   * d'état de l'en-tête porte `pr-status-abandoned` sur la PR abandonnée (08), `pr-status-active`
   * partout ailleurs. Une PR TERMINÉE (fusionnée) n'est pas capturée : aucun candidat ne la
   * décrit, et l'absence du bouton y sera journalisée — une ligne de trop, jamais un blocage de
   * trop. */
  prSettledState: {
    name: 'pr-settled-state',
    candidates: ['.repos-pr-header .pr-status-abandoned'],
  } satisfies SelectorChain,

  /** Vue Files en PLEIN ÉCRAN : l'en-tête se réduit à une ligne, sans bouton de complétion — son
   * absence y est la norme. MESURÉ : la classe `full-screen` n'existe que dans les captures
   * `-plein-ecran` (comparaison des classes, CAPTURES.md). */
  fullScreen: {
    name: 'full-screen',
    candidates: ['.full-screen'],
  } satisfies SelectorChain,

  /** Contrôle de complétion (§6.5, §9.4) — le bouton principal du bouton scindé *Complete* de
   * l'en-tête. MESURÉ sur toutes les captures d'une PR active, Overview et Files. Sur la PR
   * abandonnée (08), le MÊME emplacement porte *Reactivate* : `prSettledState` doit être lu
   * AVANT, sans quoi l'extension intercepterait une réactivation. Absent en plein écran. */
  completeButton: {
    name: 'complete-button',
    problem: 'completion-control',
    candidates: ['.repos-pr-header-complete-button > .bolt-split-button-main'],
  } satisfies SelectorChain,

  /** Utilisateur courant (§6.1) — son NOM AFFICHÉ, sur la pastille posée devant chaque champ de
   * réponse replié et devant le champ général (03 : la même pastille que celle de l'auteur de ses
   * propres commentaires). Même forme que `commentAuthor` : les deux se comparent. */
  currentUser: {
    name: 'current-user',
    candidates: ['.repos-discussion-thread-reply > .bolt-coin[aria-label], .repos-comment-card .bolt-coin[aria-label]:not(.repos-comment-header-persona)'],
  } satisfies SelectorChain,

  /** Date de CRÉATION de la PR (§6.2.3). MESURÉ : la DERNIÈRE ligne du fil d'activité est
   * l'événement de création — 20:49:08.770Z pour la PR 1, 20:49:09.564Z pour la PR 2, à la
   * milliseconde de leur création par l'API (03, 08). La seule date de l'en-tête est celle du
   * dernier changement d'état (21:13 sur la PR abandonnée, 08) : jamais elle. Absente de la vue
   * Files, et d'une Overview dont la dernière ligne n'est pas encore rendue — le fil d'activité
   * est virtualisé (CAPTURES.md) : une date inconnue, jamais une fausse. UN SEUL candidat.
   * `time.activity-card-time` est AUSSI la date d'en-tête d'un fil de ligne dans le fil
   * d'activité (03 : 21:02:35.377Z, dans `.comment-file-header`, à l'intérieur d'une
   * `.bolt-card`) : si la dernière ligne était un fil, ce candidat la trouverait. L'adaptateur
   * écarte donc tout élément situé dans une `.bolt-card` — ce que le CSS de happy-dom ne sait
   * pas exprimer de façon fiable. */
  prCreatedAt: {
    name: 'pr-created-at',
    problem: 'pr-creation-date',
    candidates: ['tr.bolt-timeline-last-row time.activity-card-time[datetime]'],
  } satisfies SelectorChain,

  /** Le FIL D'ACTIVITÉ de l'Overview — un tableau dont chaque ligne est un événement ou un fil
   * (01, 02, 03, 06, 08). Le filtre du §5.5 se pose AVANT lui : posé avant le premier fil, il
   * tombait DANS la carte de ce fil, une rangée flex, ses boutons étirés en pastilles verticales
   * à gauche du commentaire (validation du propriétaire, 2026-11-09). */
  activityFeed: {
    name: 'activity-feed',
    candidates: ['table.activity-feed-list'],
  } satisfies SelectorChain,

  /** Ligne du fil d'activité qui CONTIENT un fil (03) — carte, frise et fil compris. C'est elle
   * que le filtre masque dans l'Overview : masquer le seul `thread` laisserait la carte vide et
   * le point de la frise. Absente de Files, où le fil est intercalé dans le diff. */
  timelineRow: {
    name: 'timeline-row',
    candidates: ['tr.bolt-timeline-row'],
  } satisfies SelectorChain,

  /** Carte d'un fil dans le fil d'activité (03) — l'événement de création n'en a pas. Sert à
   * écarter de `prCreatedAt` la date d'en-tête d'un fil. */
  activityCard: {
    name: 'activity-card',
    candidates: ['.bolt-card'],
  } satisfies SelectorChain,
};
