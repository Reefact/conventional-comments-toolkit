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
      'textarea[data-testid="comment-field"]',
      'textarea[data-testid="reply-field"]',
      'textarea[name="review[note]"]',
    ],
  } satisfies SelectorChain,

  /** Éditeur de TEXTE ENRICHI (ProseMirror), qui remplace la <textarea> quand l'utilisateur a
   * choisi ce mode — choix mémorisé pour son compte (§C.2). MESURÉ : 01-…-texte-riche,
   * 04-…-texte-riche, 05-…-texte-riche, 06-overview-…-texte-riche ; `aria-label` « Comment » ou
   * « Reply to comment » selon la zone, comme la <textarea> qu'il remplace. L'écriture y est à
   * établir (§C.2) : cette chaîne sert à le RECONNAÎTRE, pas à y écrire. */
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
      'button[type="submit"]',
      'button[data-testid="start-review-button"]',
      'button[data-testid="add-to-review-button"]',
      'button[data-testid="add-comment-now-button"]',
      'button[data-testid="comment-now-button"]',
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
      'button[data-testid="cancel"]',
      'button[data-testid="cancelBatchCommentsEnabled"]',
      'button[data-testid="discard-review-btn"]',
    ],
  } satisfies SelectorChain,

  /** Contrôle de complétion — le bouton de fusion (§6.5, §9.4). MESURÉ : présent sur une merge
   * request ouverte (01, 01-…-mr2), absent sur une merge request fermée (08) : son absence y est
   * la NORME, pas une rupture de sélecteur. */
  mergeButton: {
    name: 'merge-button',
    problem: 'completion-control',
    candidates: ['button[data-testid="merge-button"]'],
  } satisfies SelectorChain,
};
