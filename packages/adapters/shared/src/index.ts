// Socle commun des adaptateurs client (composant A) : contrat §9.2.3, stratégie
// d'écriture programmatique §9.3, chaînes de sélecteurs avec repli §9.4/§A.5.

import { EMOJI_TOKEN_SOURCE, matchPrefix, splitBody } from '@cct/core';
import type {
  ConfigRead,
  Disposable,
  PlatformProfile,
  PrRef,
  PublishedSummary,
  ThreadInfo,
  UserInfo,
  Zone,
} from '@cct/core';

// ————— Contrat client (§9.2.3) —————

export interface EditorContext {
  zone: Zone;
  action: 'compose' | 'edit';
  pr: PrRef;
  threadId?: string;
  commentId?: string;
  canCarryBlockingState: boolean;
  inScope: boolean;
}

export interface EditorHandle {
  id: string;
  element: Element;
  context: EditorContext;
}

export interface SubmitControl {
  element: Element;
  kind: 'submit' | 'submit-and-resolve' | 'complete-pr';
}

/** Ce que seule la PLATEFORME sait du châssis qui entoure une zone de saisie — la boîte de
 * commentaire, ses onglets, son en-tête — et dont l'extension a besoin pour s'y loger sans
 * décaler quoi que ce soit (§5.1, §5.3).
 *
 * Cette méthode existe parce que son absence était un DÉFAUT DE CONFORMITÉ, pas parce qu'une
 * abstraction manquait à l'élégance. Le §9.4 exige que « les sélecteurs DOM soient centralisés
 * dans un fichier unique PAR ADAPTATEUR » ; or le contrôleur partagé cherchait ce conteneur
 * avec deux littéraux GitHub (`[data-testid*="comment-composer"]`, puis la classe `CommentBox`),
 * ce que le §9.4 interdit. Il n'avait pourtant aucun moyen d'obéir : aucune méthode du contrat
 * ne lui permettait de DEMANDER ce conteneur à l'adaptateur. Élargir le port, c'est rendre
 * l'obéissance possible.
 *
 * **Chaque champ vaut `null` pour dire « je ne me prononce pas »**, et le code partagé applique
 * alors sa règle géométrique — celle qui n'interroge que le moteur de style et ne nomme personne
 * (`framedAncestor`, `stackingMountFor`, `ringIsClipped` d'ui/stacking.ts). Un adaptateur qui
 * rend `NEUTRAL_EDITOR_CHROME` obtient donc EXACTEMENT le comportement d'avant. C'est ce qui
 * rend cet élargissement sans risque pour une plateforme qu'on n'a pas mesurée : ne rien
 * affirmer, plutôt qu'affirmer sur elle les chiffres d'une autre.
 *
 * Ce châssis porte des ÉLÉMENTS, jamais des longueurs ni des couleurs. La frontière n'est pas
 * cosmétique : le TypeScript dit quel élément joue quel rôle, la feuille de style de la
 * plateforme dit combien il mesure (`--cct-frame-padding`, `--cct-text-gutter`). Sans cette
 * règle, une mesure faite sur une plateforme redeviendrait une constante partagée par toutes,
 * ce qui est exactement le défaut qu'on corrige : le retrait de 8 px du conteneur était la
 * marge propre de `.CommentBox-container` sur GitHub, appliquée telle quelle à Azure DevOps.
 *
 * Ce type ne nomme AUCUNE plateforme, et c'est une règle : un port dont une signature mentionne
 * GitHub ou Azure DevOps a échoué, puisqu'il obligerait le code partagé à savoir de qui il parle.
 * `scripts/check-platform-isolation.mjs` le vérifie. */
export interface EditorChrome {
  /** Le conteneur qui encadre ENSEMBLE l'en-tête natif de la boîte, ses onglets, le champ et
   * ce que l'extension injecte — celui à qui donner le retrait intérieur, pour que rien ne
   * touche la bordure. `null` : le code partagé le cherche par la géométrie, en remontant au
   * premier ancêtre qui DESSINE le cadre. */
  framedContainer: Element | null;
}

/** « Je ne me prononce sur rien » — la réponse juste pour une plateforme dont la boîte de
 * commentaire n'a pas été mesurée, et le comportement exact du code partagé avant que le port
 * ne s'élargisse. Gelé : c'est une valeur partagée par tous les appelants, et un consommateur
 * distrait qui y écrirait contaminerait les autres. */
export const NEUTRAL_EDITOR_CHROME: EditorChrome = Object.freeze({
  framedContainer: null,
});

/** La FORME du HTML qu'une plateforme produit en rendant un corps de commentaire Markdown.
 *
 * Deux faits, et deux seulement, parce que ce sont les deux que le masquage de préfixe et la
 * mise en avant du sujet (§5.5) interrogent. Ils vivaient en dur dans `extension/src/ui/badges.ts`
 * — `tagName !== 'P'` et trois comparaisons à `'BR'` — sous la forme d'affirmations vraies de
 * GitHub, mesurées sur github.com, et appliquées à toute plateforme.
 *
 * C'est la fuite dont l'absence coûte le plus cher : les autres RENONCENT proprement quand
 * elles ne reconnaissent rien, celle-ci se trompe. Sur un corps rendu où la fin de ligne n'est
 * pas un `<br>`, la borne du sujet ne se déclenche jamais et un frère entier passe dans le
 * sujet — donc en gras, avec tout ce qui le suit.
 *
 * Les deux adaptateurs répondent aujourd'hui la même chose, et le déplacement est donc à
 * comportement rigoureusement nul. Ce n'est pas une raison de s'en passer : la valeur cesse
 * d'être une supposition tacite du code partagé pour devenir une réponse que chaque plateforme
 * donne — et qu'une plateforme future peut donner autrement, au lieu de la subir. */
export interface RenderedBodyShape {
  /** Les conteneurs de PREMIER NIVEAU qui enveloppent une ligne de Markdown ordinaire sans
   * avoir consommé de syntaxe de tête. Tout le reste — bloc de code, citation, liste, titre,
   * tableau — fait renoncer le masquage, ce qui est toujours l'issue sûre (§9.4, CA-11). */
  readonly paragraphTags: readonly string[];
  /** Ce qui MATÉRIALISE une fin de ligne simple dans ce corps rendu. */
  readonly lineBreakTag: string;
}

/** La forme d'un rendu Markdown → HTML ordinaire. Nommée plutôt qu'écrite en dur : une valeur
 * par défaut qui porte un nom est une affirmation qu'on peut relire et contredire ; la même
 * valeur dispersée en quatre littéraux est une supposition qu'on ne voit plus. */
export const MARKDOWN_HTML_BODY_SHAPE: RenderedBodyShape = Object.freeze({
  paragraphTags: Object.freeze(['P']),
  lineBreakTag: 'BR',
});

export interface PlatformAdapter {
  matches(url: URL): boolean;
  platformProfile(): PlatformProfile;
  getRepoConfig(pr: PrRef): Promise<ConfigRead>;
  getOrgConfig(url: string | null): Promise<ConfigRead>;
  observeEditors(cb: (editor: EditorHandle) => void): Disposable;
  getSubmitControls(editor: EditorHandle): SubmitControl[];
  /** §5.1, §5.3, §9.4 — le châssis de CET éditeur. Obligatoire, et c'est délibéré : une
   * méthode optionnelle laisserait une plateforme nouvelle compiler sans jamais répondre, et
   * son extension se logerait alors au jugé sur un DOM que personne n'a regardé. Le compilateur
   * doit poser la question ; `NEUTRAL_EDITOR_CHROME` permet d'y répondre « rien de spécial »
   * en un mot. */
  getEditorChrome(editor: EditorHandle): EditorChrome;
  /** §5.5 — la forme du HTML que cette plateforme produit en rendant un corps de commentaire,
   * ou `null` si elle n'a pas été MESURÉE.
   *
   * Obligatoire pour la même raison que `getEditorChrome` : c'est une question qu'une plateforme
   * nouvelle doit se voir poser. Mais contrairement au châssis, il n'y a pas de repli
   * géométrique ici — rien ne permet de DEVINER quelle balise matérialise une fin de ligne.
   * `null` fait donc RENONCER le masquage du préfixe et la mise en avant du sujet ; les badges
   * restent posés, et le corps s'affiche entier. C'est la dégradation sûre du §9.4 (CA-11), et
   * le seul repli honnête : une valeur plausible mais non vérifiée peut faire glisser une partie
   * de la discussion dans le sujet mis en avant (revue Reefact, PR #66).
   *
   * Rendre `MARKDOWN_HTML_BODY_SHAPE` est donc une AFFIRMATION — « j'ai mesuré, c'est bien
   * `<p>`/`<br>` » — et non un défaut commode. */
  renderedBodyShape(): RenderedBodyShape | null;
  readValue(editor: EditorHandle): string;
  writeValue(editor: EditorHandle, text: string, caret?: number): void;
  getThreads(): Promise<ThreadInfo[]>;
  getCompletionControl(): SubmitControl | null;
  getCurrentUser(): Promise<UserInfo>;
  readPublishedResult(): PublishedSummary | null;
}

// ————— Reconnaissance d'hôte (§2, §A.4, §B.4) —————
// Un hôte autorisé via `optional_host_permissions` peut être un JOKER : le §A.4 nomme
// `*.ghe.com` (GitHub Enterprise Cloud with data residency, sous-domaine dédié par client,
// inconnu à la compilation) et le §B.6 `*.visualstudio.com`. Chrome accorde bien
// `https://*.ghe.com/*` et injecte le script sur `acme.ghe.com` ; une comparaison par
// égalité stricte, elle, ne reconnaîtrait jamais cet hôte concret et laisserait
// l'extension inerte sur la page (revue Codex, PR #29). Les deux adaptateurs partagent
// donc cette fonction plutôt que de réinventer chacun sa règle.
//
// `*.exemple.com` couvre le domaine nu (`exemple.com`) ET ses sous-domaines
// (`acme.exemple.com`). C'est bien la sémantique des motifs WebExtension — la
// documentation donne `https://mozilla.org/` comme correspondant à `*://*.mozilla.org/*`.
// Une version antérieure de cette fonction excluait le domaine nu, en affirmant l'inverse,
// et un test verrouillait cette croyance (revue Codex, PR #29) : Chrome injectait donc le
// script sur le domaine nu couvert par l'octroi, et l'adaptateur refusait ensuite de le
// reconnaître.
//
// Le suffixe est comparé PRÉCÉDÉ DE SON POINT pour les sous-domaines : sans lui,
// `evilghe.com` passerait pour un sous-domaine de `ghe.com`.

/** L'hôte `host` est-il couvert par l'entrée `pattern` — nom exact, ou joker `*.suffixe` ? */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === pattern;
}

/** L'hôte est-il couvert par au moins une des entrées (noms exacts et jokers mêlés) ? */
export function hostMatchesAny(host: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => hostMatchesPattern(host, p));
}

/** Le `fetch` à employer par un adaptateur : la substitution reçue, sinon le global **LIÉ à
 * son global**. Le `.bind()` n'est pas une précaution de style, c'est la correction d'un défaut
 * livré.
 *
 * Un adaptateur range son `fetch` dans un champ privé et l'appelle comme méthode
 * (`this.#fetch(url, init)`) : l'appel passe donc l'INSTANCE en receveur. Dans le monde isolé
 * d'un script de contenu, Chromium refuse ce receveur —
 * « Failed to execute 'fetch' on 'Window': Illegal invocation » — et TOUTE lecture de
 * configuration levait. L'extension rendait `unreachable` sur chaque dépôt, avec ou sans
 * fichier, et affichait le bandeau du §5.4 en permanence.
 *
 * Deux raisons pour lesquelles ce défaut a vécu longtemps, et elles se valent d'être écrites :
 *  - aucun test unitaire ne peut le voir. Un faux `fetch` est une fonction ordinaire, qui
 *    accepte n'importe quel receveur ; le vrai exige le sien.
 *  - sondé dans le monde PRINCIPAL d'une page, Chromium ACCEPTE ce même receveur. La mesure
 *    qui déclarait l'hypothèse fausse était juste — dans le mauvais monde.
 *
 * `npm run check:content-script-cors` mesure les deux formes, dans un script de contenu réel.
 *
 * Le repli sans `bind` couvre le contexte qui n'a pas de `fetch` global : l'échec y reste au
 * moment de la lecture, comme avant, plutôt qu'à la construction de l'adaptateur. */
export function adapterFetch(impl?: typeof fetch): typeof fetch {
  if (impl) return impl;
  const global = globalThis.fetch;
  return typeof global === 'function' ? global.bind(globalThis) : global;
}

// ————— Stratégie d'écriture programmatique (§9.3) —————
// Les éditeurs pilotés par un état applicatif absorbent l'affectation directe de `value` :
// le champ paraît modifié, mais le contenu soumis ne l'est pas (§A.2, §B.2). La méthode
// commune : passer par le setter NATIF de la propriété — celui du prototype, que le
// framework n'a pas remplacé — puis émettre un événement `input` qui remonte. Jamais
// `element.value = …`. Validée par le spike P1' (spikes/p1-prime).

export function writeToTextField(
  element: HTMLTextAreaElement | HTMLInputElement,
  text: string,
  caret?: number
): void {
  const proto =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, text);
  } else {
    // Environnement sans descripteur (tests minimalistes) : affectation directe en repli.
    (element as HTMLTextAreaElement).value = text;
  }
  if (caret !== undefined) {
    try {
      element.setSelectionRange(caret, caret);
    } catch {
      // Certains types d'input ne portent pas de sélection : sans conséquence.
    }
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Restaure une sélection décalée de `delta` (§5.1 — la sélection active est restaurée,
 * décalée de la longueur du préfixe inséré). Seules les positions situées à partir de
 * `changedAt` se décalent : le préfixe peut s'insérer sur une ligne située APRÈS la
 * sélection (brouillon commençant par une citation, §3.4.1), et décaler une position
 * antérieure ferait dériver la sélection restaurée (CA-02). */
export function shiftSelection(
  element: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
  delta: number,
  changedAt = 0
): void {
  try {
    element.setSelectionRange(start < changedAt ? start : start + delta, end < changedAt ? end : end + delta);
  } catch {
    // idem
  }
}

// ————— Sélecteurs en chaînes avec repli (§9.4, §A.5) —————
// Chaque adaptateur centralise ses sélecteurs dans un fichier unique, organisé en
// chaînes : la génération la plus récente d'abord, puis les précédentes.

export interface SelectorChain {
  /** Nom stable, pour la journalisation de dégradation (§9.4). */
  name: string;
  candidates: string[];
}

export interface SelectorOutcome {
  element: Element | null;
  /** Sélecteur qui a réussi, ou null : la dégradation de sélecteur s'applique (§9.4). */
  matched: string | null;
}

export function queryChain(root: ParentNode, chain: SelectorChain): SelectorOutcome {
  for (const candidate of chain.candidates) {
    const element = root.querySelector(candidate);
    if (element) return { element, matched: candidate };
  }
  return { element: null, matched: null };
}

export function queryChainAll(root: ParentNode, chain: SelectorChain): Element[] {
  for (const candidate of chain.candidates) {
    const elements = [...root.querySelectorAll(candidate)];
    if (elements.length > 0) return elements;
  }
  return [];
}

/** Les DEUX seuls emplacements où `decorateComment` pose ses badges, jamais un troisième :
 * enfant direct du corps de commentaire, ou enfant direct de l'élément qu'il a lui-même MARQUÉ
 * en y écrivant.
 *
 * **Plus aucun nom de balise.** Ce sélecteur a dit `:scope > p > .cct-badge`, c'est-à-dire
 * « les paragraphes de cette plateforme sont des `<p>` » — un fait de plateforme dans le socle
 * partagé, et surtout un fait que `renderedBodyShape()` autorise désormais chaque plateforme à
 * démentir. Une plateforme déclarant un autre conteneur voyait `decorateComment` y poser ses
 * badges pendant que `commentBodyText()` continuait de chercher sous un `<p>` : les badges
 * n'étaient plus retirés à la relecture, leur texte pouvait passer pour le corps, et les
 * anciens s'accumulaient au rendu suivant (revue Reefact, PR #66).
 *
 * Faire poser la marque par CELUI QUI ÉCRIT rend la divergence impossible, au lieu de la rendre
 * seulement détectable : les deux fonctions ne peuvent plus parler d'ensembles différents,
 * puisqu'elles parlent du même attribut.
 *
 * `:scope > …`, et non un descendant quelconque : un `.cct-badge` plus profond (citation, bloc
 * de code d'un autre commentaire cité) est du texte normal, pas notre propre badge, et le
 * retirer amputerait le corps relu. */
export const OWN_BADGES = ':scope > .cct-badge, :scope > .cct-badge-host > .cct-badge';

/** Texte d'un corps de commentaire, badges de l'extension EXCLUS (§5.5) : `decorateComment`
 * (extension/src/ui/badges.ts) insère un badge de label, suivi d'un badge par décoration
 * résolue (§3.3), dans l'élément que `getThreads()`/`getRenderedComments()` lisent ensuite.
 * Un rendu répété sur la même PR (résumé publié changé après coup, §5.5) relirait sinon
 * leur texte mêlé au corps réel, cassant la reconnaissance du préfixe par `analyze()` au
 * tour suivant — d'où `querySelectorAll` : un commentaire à plusieurs décorations pose
 * plusieurs badges, il faut tous les retirer, pas seulement le premier trouvé.
 *
 * Le sujet mis en avant (`.cct-subject`), lui, n'est JAMAIS retiré : ce wrapper n'ajoute
 * aucun texte, il enveloppe celui que l'auteur a écrit. */
export function commentBodyText(element: Element): string {
  if (!element.querySelector(OWN_BADGES)) return element.textContent ?? '';
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(OWN_BADGES).forEach((badge) => badge.remove());
  return clone.textContent ?? '';
}

/** closest() sur une chaîne : les candidats s'essaient DANS L'ORDRE, comme queryChain —
 * les joindre en un seul sélecteur laisserait un candidat de repli large l'emporter sur
 * le candidat précis d'une génération plus récente (§9.4). */
export function closestChain(el: Element, chain: SelectorChain): SelectorOutcome {
  for (const candidate of chain.candidates) {
    const element = el.closest(candidate);
    if (element) return { element, matched: candidate };
  }
  return { element: null, matched: null };
}

/** L'élément LUI-MÊME répond-il à l'un des candidats ? Distinct de `closestChain`, et la
 * distinction n'est pas un détail : `Element.closest()` commence par l'élément puis REMONTE,
 * si bien qu'il répondrait aussi pour un ancêtre portant le motif — réponse fausse quand la
 * question posée est « ce champ-ci porte-t-il cette marque, auquel cas son cadre est son
 * parent direct ? ». */
export function matchesChain(el: Element, chain: SelectorChain): SelectorOutcome {
  for (const candidate of chain.candidates) {
    if (el.matches(candidate)) return { element: el, matched: candidate };
  }
  return { element: null, matched: null };
}

/** Journal local de dégradation de sélecteurs (§9.4, CA-11) : jamais de dialogue, jamais
 * d'exception remontée — l'échec est tracé, la zone se désactive localement. */
export class SelectorLog {
  readonly failures: { chain: string; at: string }[] = [];
  #telemetry: ((event: { kind: 'selector-degradation'; chain: string }) => void) | null;
  // UNE entrée par chaîne, pas une par appel — et c'est un défaut constaté, pas une
  // optimisation. `getCompletionControl()` journalise dès qu'il ne trouve pas le bouton de
  // fusion, et il est appelé à chaque mutation du DOM : sur une PR fermée, où l'absence du
  // bouton est la NORME, une seule visite écrivait des dizaines d'entrées identiques. Le
  // journal étant plafonné (50 entrées côté extension), une PR fusionnée le remplissait
  // intégralement de `merge-button` et ÉVINÇAIT toute vraie dégradation : le diagnostic censé
  // révéler qu'un sélecteur a pourri était aveuglé par un non-événement.
  //
  // La question à laquelle ce journal répond est « QUELS sélecteurs ont échoué », jamais
  // « combien de fois » — un compte piloté par le rythme des mutations de la page ne mesure
  // rien. La déduplication vaut donc aussi pour la remontée télémétrique, qu'elle cesse
  // d'enfler pour la même raison.
  #seen = new Set<string>();

  constructor(telemetry: ((event: { kind: 'selector-degradation'; chain: string }) => void) | null = null) {
    this.#telemetry = telemetry;
  }

  /** Oublie ce qui a déjà été signalé, pour que la page SUIVANTE puisse l'être à son tour.
   *
   * `#seen` borne le BRUIT — `getCompletionControl()` journalise à chaque mutation du DOM —,
   * pas la durée de vie de l'onglet. Or GitHub navigue d'une PR à l'autre sans recharger :
   * une chaîne déjà signalée restait muette sur toutes les PR suivantes, si bien que l'entrée
   * gardait la page et l'horodatage de la PREMIÈRE. Un onglet ouvert sur dix PR n'en
   * rapportait qu'une, et c'était la plus ancienne (revue Codex, PR #70).
   *
   * L'appelant qui SAIT qu'on a changé de PR le dit ici. Le compte reste alors d'une entrée
   * par chaîne et par PR visitée — jamais par mutation, qui est ce que la déduplication
   * existe pour empêcher. La remontée télémétrique suit la même cadence, et c'est cohérent :
   * elle mesure alors sur combien de PR une chaîne a échoué, plutôt que le rythme des
   * mutations, qui ne mesure rien.
   *
   * Ce que ce geste ne fait PAS : vider `failures`, dont `degraded()` maintient la borne
   * lui-même — une entrée par chaîne, quel que soit le nombre d'oublis. */
  forgetSeen(): void {
    this.#seen.clear();
  }

  degraded(chain: SelectorChain): void {
    if (this.#seen.has(chain.name)) return;
    this.#seen.add(chain.name);
    // UNE entrée par chaîne, rafraîchie plutôt qu'ajoutée. `#seen` ne suffit plus à borner
    // ce tableau depuis qu'il s'oublie à chaque changement de PR : sans cette recherche, un
    // onglet promené sur cent PR y accumulerait cent lignes par chaîne pourrie, alors que le
    // dépôt s'interdit ailleurs de le laisser croître au rythme des observations
    // (`chromeSignatureOf`, extension/src/content-internal.ts) — revue Reefact, PR #70.
    //
    // C'est aussi la règle du journal PERSISTÉ (`appendToJournal`, dédupliqué par chaîne) :
    // une seule sémantique à tenir en tête des deux côtés, en mémoire comme sur le disque.
    const at = new Date().toISOString();
    const seenBefore = this.failures.find((f) => f.chain === chain.name);
    if (seenBefore) seenBefore.at = at;
    else this.failures.push({ chain: chain.name, at });
    // Remontée télémétrique agrégée uniquement si la télémétrie est activée (§10, CA-11).
    this.#telemetry?.({ kind: 'selector-degradation', chain: chain.name });
  }
}

// Localisation du préfixe dans la ligne BRUTE, pour la réécrire sans perdre sa tête.
// La DÉCISION « cette ligne porte-t-elle un préfixe » revient à matchPrefix() sur la
// ligne normalisée (§3.4.1 étapes 4-6, §3.4.2) — ce motif ne fait que retrouver, dans la
// ligne d'origine, les bornes de ce que la regex de référence a reconnu : tête tolérée
// (blancs, U+FEFF, emoji), label, décorations, deux-points et blancs suivants.
const RAW_PREFIX_LOCATOR = new RegExp(
  `^(?<head>[\\p{White_Space}\\uFEFF]*(?:${EMOJI_TOKEN_SOURCE}[\\p{White_Space}\\uFEFF]*)?)` +
    '(?<label>[A-Za-z]+)' +
    '(?:[\\p{White_Space}\\uFEFF]*\\([^)\\r\\n]*\\))?' +
    ':[\\p{White_Space}\\uFEFF]*',
  'u'
);

/** Insertion/remplacement de préfixe (§5.1, CA-02) — pur, testable sans DOM.
 * La ligne visée est la LIGNE DE PRÉFIXE du §3.4.1 (blocs délimités et citations
 * écartés) : citer du code en tête puis cliquer un label ne doit jamais réécrire la
 * citation. Le préfixe existant est reconnu comme la validation le reconnaît — ligne
 * normalisée par les étapes 4-6, regex de référence — et la tête tolérée de la ligne
 * (indentation, BOM, emoji) est conservée à la réécriture comme au retrait.
 * `changedAt` : position, dans la valeur d'ENTRÉE, où la modification commence — les
 * positions antérieures (une citation au-dessus) ne se décalent pas. */
export function computePrefixInsertion(
  currentValue: string,
  newPrefix: { label: string; decorations?: string[] },
  options: {
    toggle?: boolean;
    /** L'appelant a établi — configuration en main, alias compris — que le préfixe écrit
     * porte bien le label demandé. À défaut, les deux chaînes sont comparées. */
    sameLabel?: boolean;
  } = {}
): { nextValue: string; caret: number; delta: number; removed: boolean; changedAt: number } {
  // `decorations` distingue TROIS intentions, et un tableau seul ne pouvait en exprimer que
  // deux — d'où un défaut que l'usage réel a fini par trouver (retour utilisateur) :
  //
  //   • `undefined` — « je ne me prononce pas » : on pose un label, la décoration déjà
  //     écrite est CONSERVÉE. C'est CA-02 (`issue (blocking): x` + `todo` →
  //     `todo (blocking): x`), et c'est le cas des boutons de label et des raccourcis ;
  //   • `[]` — « aucune », le premier segment du sélecteur (§5.1) : la décoration est
  //     RETIRÉE ;
  //   • une liste non vide — elle remplace.
  //
  // Le tableau vide portait auparavant les deux premiers sens à la fois, et « conserver »
  // l'emportait : le segment « aucune » était donc un bouton sans effet, coché, sur un
  // commentaire décoré. Le §5.1 décrit pourtant bien « aucune » comme un choix.
  const given = newPrefix.decorations;
  const decorations = given !== undefined && given.length > 0 ? ` (${given.join(', ')})` : '';
  const prefixText = `${newPrefix.label}${decorations}: `;

  const lines = currentValue.split('\n');
  const split = splitBody(currentValue);
  const target = split.prefixLineIndex ?? -1;

  const recognized = split.prefixLine !== null ? matchPrefix(split.prefixLine) : null;
  const located = recognized && target >= 0 ? RAW_PREFIX_LOCATOR.exec(lines[target]!) : null;
  if (recognized && located && target >= 0) {
    const head = located.groups!['head']!;
    const rest = lines[target]!.slice(located[0].length);
    const start = lineStart(lines, target);
    const changedAt = start + head.length;
    // « Est-ce le MÊME label ? » est une question de CONFIGURATION, pas de chaînes : `bug:`
    // est le même label qu'`issue` si la configuration le déclare en alias, et il « en
    // hérite intégralement » (§3.2). Ce paquet ne voit aucune configuration — il ne peut
    // donc pas trancher, et une comparaison littérale répondait `false` sur un alias : le
    // second clic réécrivait `bug:` en `issue:` au lieu de retirer le préfixe (revue Codex,
    // PR #35, étendu aux alias sur demande).
    //
    // La décision revient donc à l'appelant, qui la prend avec `resolveLabel()` de `core/`,
    // et `toggle` veut dire ce qu'il dit : « retire ce préfixe ». Le repli littéral ne sert
    // qu'aux appelants sans configuration sous la main.
    const sameLabel =
      options.sameLabel ?? recognized.label.toLowerCase() === newPrefix.label.toLowerCase();
    if (options.toggle && sameLabel) {
      // Second clic sur un label déjà actif : retrait (§5.1) — le label seul décide,
      // pas l'état du sélecteur de décoration.
      lines[target] = head + rest;
      const nextValue = lines.join('\n');
      return { nextValue, caret: changedAt, delta: -(located[0].length - head.length), removed: true, changedAt };
    }
    // Remplacement : sujet conservé, et décoration conservée SI l'appelant ne s'est pas
    // prononcé (CA-02). Un `[]` explicite, lui, la retire.
    const keptDecorations =
      given === undefined && recognized.decorations !== null
        ? ` (${recognized.decorations})`
        : decorations;
    const replacement = `${newPrefix.label}${keptDecorations}: `;
    lines[target] = `${head}${replacement}${rest}`;
    const nextValue = lines.join('\n');
    const caret = changedAt + replacement.length;
    return {
      nextValue,
      caret,
      delta: head.length + replacement.length - located[0].length,
      removed: false,
      changedAt,
    };
  }

  if (target >= 0) {
    // Une ligne de préfixe existe mais ne porte pas de préfixe : le préfixe s'insère en
    // tête de CETTE ligne — jamais sur une citation ou un bloc situé au-dessus.
    lines[target] = prefixText + lines[target]!;
    const nextValue = lines.join('\n');
    const changedAt = lineStart(lines, target);
    return { nextValue, caret: changedAt + prefixText.length, delta: prefixText.length, removed: false, changedAt };
  }

  // Aucune ligne de préfixe (corps vide, tout cité ou tout en bloc) : nouvelle première
  // ligne, contenu existant conservé en dessous — le contenu existant se décale donc du
  // préfixe ET du saut de ligne ajouté.
  const nextValue = currentValue === '' ? prefixText : `${prefixText}\n${currentValue}`;
  const delta = currentValue === '' ? prefixText.length : prefixText.length + 1;
  return { nextValue, caret: prefixText.length, delta, removed: false, changedAt: 0 };
}

function lineStart(lines: string[], index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += lines[i]!.length + 1;
  return pos;
}
