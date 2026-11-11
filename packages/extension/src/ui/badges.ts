// Badges des commentaires publiés (§5.5) : rendu visuel du label puis, à sa droite, un badge
// par décoration résolue (§3.3) — sans jamais modifier le contenu stocké côté serveur.
//
// Les badges partagent la LIGNE DU SUJET, à sa gauche, quand le préfixe structuré a pu être
// masqué : ils sont alors posés dans l'élément qui porte ce sujet, et le sujet lui-même passe en
// gras (`.cct-subject`). Cette ligne se lit alors comme un titre — « badges, puis de quoi il
// s'agit » — au lieu d'un bandeau de badges suivi d'un texte qui recommence à la ligne (demande
// Reefact). Quand le masquage est refusé (§9.4, projection avec perte ou premier niveau qui
// n'est pas un `<p>`), rien ne bouge : badges en tête du corps, texte intact en dessous.
//
// Rafraîchi sur changement de config, sans churn DOM sur un rendu inchangé : content-
// internal.ts appelle decorateComment() sur CHAQUE commentaire à CHAQUE passage de rendu
// (mutation observée), donc à chaque frappe ailleurs sur la page. Un signal comparable —
// qui couvre aussi ce qui ne change aucun verdict, `badgeStyle`, `labels[].color` — est
// calculé à partir de ce que analyze() vient de résoudre, et comparé à ce que le badge déjà
// posé porte : égal → aucune écriture DOM ; différent → badges retirés puis reposés, la
// seule fois où le retrait est un vrai changement, pas juste un rendu répété (revue Reefact
// et Codex, PR #37 — https://github.com/Reefact/conventional-comments-toolkit/pull/37).

import {
  analyze,
  matchPrefix,
  normalizePrefixLine,
  parseDecorations,
  type CommentAnalysis,
  type Diagnostic,
  type EffectiveConfig,
  type PlatformProfile,
  type ResolvedDecoration,
  type SessionMarker,
  t,
} from '@cct/core';
// Ce module ne nomme plus AUCUNE forme de corps rendu : `MARKDOWN_HTML_BODY_SHAPE` n'est plus
// importé ici. Il l'était pour deux replis — le défaut de `decorateComment()` et le bouche-trou
// que prenait `applyPrefixVisibility()` en défaisant —, tous deux retirés. Le rendu partagé
// reçoit désormais la forme, il ne l'invente jamais (revue Reefact, PR #66).
import { normalizeBodyShape, OWN_BADGES, type RenderedBodyShape } from '@cct/adapter-shared';
import { labelTooltip, ui } from './strings.js';

function labelBadge(
  label: { icon?: string; id: string; color?: string; description?: string },
  config: EffectiveConfig,
  lang: string
): HTMLElement {
  const badge = globalThis.document.createElement('span');
  badge.className = `cct-badge cct-badge-label cct-badge-${config.badgeStyle}`;
  badge.textContent = `${label.icon ?? ''} ${label.id}`.trim();
  if (label.color) badge.style.setProperty('--cct-label-color', label.color);
  // L'infobulle dit ce que le commentaire SIGNIFIE (§5.5), pas quand employer le label, ce que
  // fait le bouton : le badge est l'endroit où un lecteur rencontre un label qu'il ne connaît pas
  // — `ack`, `polish` —, bien plus souvent qu'en écrivant. `lang` et `description` entrent dans
  // badgeSignature(), si bien qu'un changement de langue ou de configuration la rafraîchit.
  const tooltip = labelTooltip(lang, label, 'badge');
  if (tooltip !== null) badge.title = tooltip;
  return badge;
}

function decorationBadge(decoration: ResolvedDecoration, config: EffectiveConfig): HTMLElement {
  const badge = globalThis.document.createElement('span');
  const modifier = !decoration.known
    ? 'custom' // libre, non déclarée (decorations.allowFree) — contour pointillé
    : decoration.forces === 'blocking'
      ? 'blocking'
      : decoration.forces === 'non-blocking'
        ? 'nonblocking'
        : null; // connue mais purement descriptive (§3.3)
  badge.className = ['cct-badge', 'cct-badge-deco', modifier ? `cct-badge-deco-${modifier}` : null, `cct-badge-${config.badgeStyle}`]
    .filter((c): c is string => c !== null)
    .join(' ');
  badge.textContent = decoration.id;
  return badge;
}

// Ni parseDecorations() ni analyze() ne bornent le nombre de décorations distinctes du
// préfixe (§3.3) : avec decorations.allowFree (le défaut), un commentaire adversarial peut
// en écrire des milliers dans la longueur qu'un corps de commentaire autorise, pour poser
// autant de nœuds DOM sur la page de CHAQUE lecteur, à CHAQUE passage de rendu (revue
// Codex, PR #38). Rendu plafonné ici — c'est un choix d'affichage, pas une règle de
// validation (§3.3 : le corps reste conforme, seul l'AFFICHAGE tronque).
const MAX_RENDERED_DECORATIONS = 12;

function overflowBadge(count: number, config: EffectiveConfig, lang: string): HTMLElement {
  const badge = globalThis.document.createElement('span');
  badge.className = `cct-badge cct-badge-deco cct-badge-${config.badgeStyle}`;
  badge.textContent = `+${count}`;
  badge.title = ui(lang, 'badge.decoration.overflow', { count });
  return badge;
}

/** Sélectionne ce qui sera effectivement rendu, une fois pour toutes — utilisé à la fois
 * pour bâtir les badges et pour la signature (revue Codex, PR #38) : cette dernière ne doit
 * JAMAIS sérialiser `a.decorations` en entier, sous peine de porter, dans un attribut DOM
 * persistant, la même taille non bornée que le rendu vient d'éliminer — un commentaire à
 * des milliers de décorations libres continuerait de peser des dizaines de Ko par
 * commentaire, malgré un affichage plafonné à 12 badges. Seules les décorations DESCRIPTIVES
 * (`forces: null`) sont repliées au-delà de MAX_RENDERED_DECORATIONS — jamais une porteuse
 * (`blocking`/`non-blocking`) : son nombre est borné par la configuration
 * (`decorations.known`, que l'auteur du commentaire ne contrôle pas), jamais par un préfixe
 * adversarial, et la replier dans un badge « +N » sans couleur effacerait le seul signal que
 * les badges existent pour porter — le caractère bloquant. L'ordre d'écriture est conservé
 * parmi les entrées gardées ; seules des descriptives EN EXCÈS sont retirées. */
function selectDecorationsForRender(decorations: ResolvedDecoration[]): {
  shown: ResolvedDecoration[];
  hiddenDescriptive: number;
} {
  const shown: ResolvedDecoration[] = [];
  let shownDescriptive = 0;
  let hiddenDescriptive = 0;
  for (const d of decorations) {
    if (d.forces !== null || shownDescriptive < MAX_RENDERED_DECORATIONS) {
      shown.push(d);
      if (d.forces === null) shownDescriptive++;
    } else {
      hiddenDescriptive++;
    }
  }
  return { shown, hiddenDescriptive };
}

function decorationBadges(
  shown: ResolvedDecoration[],
  hiddenDescriptive: number,
  config: EffectiveConfig,
  lang: string
): HTMLElement[] {
  const badges = shown.map((d) => decorationBadge(d, config));
  if (hiddenDescriptive > 0) badges.push(overflowBadge(hiddenDescriptive, config, lang));
  return badges;
}

/** Tout ce qui détermine l'APPARENCE des badges d'un commentaire résolu — `badgeStyle`,
 * `labels[].color` et `icon` compris, qui ne changent aucun verdict. Deux appels avec la même signature doivent produire des badges identiques ; deux
 * appels avec une signature différente peuvent en produire des différents. Prend `shown`/
 * `hiddenDescriptive` — déjà bornés par selectDecorationsForRender() — jamais le tableau
 * `decorations` brut d'analyze(), pour rester elle-même bornée (revue Codex, PR #38). */
function badgeSignature(
  a: CommentAnalysis & { resolved: NonNullable<CommentAnalysis['resolved']> },
  shown: ResolvedDecoration[],
  hiddenDescriptive: number,
  config: EffectiveConfig,
  lang: string
): string {
  return JSON.stringify({
    style: config.badgeStyle,
    label: {
      id: a.resolved.label.id,
      icon: a.resolved.label.icon ?? null,
      color: a.resolved.label.color ?? null,
      description: a.resolved.label.description ?? null,
    },
    blocking: a.blocking,
    decorations: shown,
    hiddenDescriptive,
    // Le badge de dépassement porte une infobulle localisée (ui()) : un changement de
    // langue en direct doit la rafraîchir comme n'importe quel autre changement d'apparence.
    lang,
  });
}

/** Repère la portion structurée à masquer dans `rawLine` — un texte dont on n'est pas encore
 * certain qu'il correspond bien à la ligne que `analyze()` a reconnue, d'où la première
 * vérification. `prefixLine` est la ligne normalisée (§3.4.1, étapes 4-6) que porte déjà
 * `CommentAnalysis` ; retrouver la même frontière dans `rawLine` demande de défaire seulement
 * ce que la normalisation fait réellement : (a) retirer un bandeau d'espaces/BOM en bord de
 * ligne, (b) remplacer un à un chaque caractère d'espacement Unicode par un espace ordinaire
 * — jamais fusionné, jamais scindé, donc sans effet sur la position d'un caractère qui suit.
 * Un BOM interne (seul cas qui changerait la longueur ailleurs qu'en bord de ligne) fait
 * renoncer plutôt que risquer de masquer la mauvaise frontière.
 *
 * `start` peut être non nul : un émoji de tête (`🔥 issue: x`) est TOLÉRÉ en entrée mais
 * IGNORÉ pour l'analyse (§3.1, `PrefixMatch.emoji`) — ce n'est pas une partie de « label
 * (décorations): » et il ne doit donc jamais entrer dans le span masqué. Le badge affiche
 * `resolved.label.icon`, une icône de CONFIGURATION, potentiellement absente ou différente de
 * l'émoji réellement écrit par l'auteur : le masquer donnerait l'impression que l'un a
 * remplacé l'autre, alors qu'ils n'ont aucun rapport (revue Reefact, PR #40). */
function hiddenPrefixSpan(rawLine: string, prefixLine: string): { start: number; end: number } | null {
  const m = matchPrefix(prefixLine);
  if (!m) return null;
  const labelStart = prefixLine.indexOf(m.label);
  if (labelStart < 0) return null;
  let searchFrom = labelStart + m.label.length;
  if (m.decorations !== null) {
    const parenClose = prefixLine.indexOf(')', searchFrom);
    if (parenClose < 0) return null;
    searchFrom = parenClose + 1;
  }
  const colonIdx = prefixLine.indexOf(':', searchFrom);
  if (colonIdx < 0) return null;
  let normalizedEnd = colonIdx + 1;
  while (normalizedEnd < prefixLine.length && (prefixLine[normalizedEnd] === ' ' || prefixLine[normalizedEnd] === '\t')) {
    normalizedEnd++;
  }
  // La validation porte sur la ligne ENTIÈRE reconnue (émoji toléré compris, depuis l'index 0) —
  // seule la frontière de DÉPART du masquage, plus bas, exclut cet émoji. Le SUJET qui suit
  // peut être scindé sur un autre nœud DOM par la moindre mise en forme inline (code, lien,
  // gras, mention, référence…) — cas courant (revue Reefact, PR #40) — auquel cas `rawLine`
  // s'arrête net à la fin du préfixe, plus court que la ligne normalisée complète.
  const expectedFullMatch = prefixLine.slice(0, normalizedEnd);
  // `rawLine` doit CORRESPONDRE à ce préfixe, pas seulement le contenir par coïncidence : sans
  // ce garde, un texte de tête sans rapport (bloc de code écarté par §3.4.1 étape 2, contenu
  // d'un élément imbriqué que le premier nœud de texte ne représente pas fidèlement) où le
  // label apparaîtrait par hasard produirait une frontière calculée sur du texte qui n'est pas
  // le préfixe. Les deux sens de `startsWith` couvrent : (a) le sujet continue dans CE nœud —
  // son normalisé est alors plus LONG que `expectedFullMatch` ; (b) `rawLine` s'arrête pile à
  // la fin du préfixe — son bord de fin est alors rogné par le trim de `normalizePrefixLine`,
  // donc plus COURT que `expectedFullMatch`.
  const normalizedRawLine = normalizePrefixLine(rawLine);
  if (!normalizedRawLine.startsWith(expectedFullMatch) && !expectedFullMatch.startsWith(normalizedRawLine)) return null;
  const leadingStrip = rawLine.length - rawLine.replace(/^[\p{White_Space}\uFEFF]+/u, '').length;
  const rawEnd = leadingStrip + normalizedEnd;
  if (rawEnd > rawLine.length || rawLine.slice(0, rawEnd).includes('\uFEFF')) return null;
  // `labelStart` n'est non nul QUE si `prefixLine` porte un \u00E9moji de t\u00EAte : la ligne est d\u00E9j\u00E0
  // bord-trim\u00E9e (\u00A73.4.1), donc sans \u00E9moji `m.label` commence forc\u00E9ment \u00E0 l'index 0. Repousser
  // `leadingStrip` (espaces bruts en t\u00EAte de `rawLine`, sans rapport avec un \u00E9moji) dans le
  // d\u00E9part du span uniquement quand un \u00E9moji existe r\u00E9ellement \u00E9vite de faire r\u00E9appara\u00EEtre,
  // pour tout pr\u00E9fixe SANS \u00E9moji, un n\u0153ud \u00AB t\u00EAte vide \u00BB scind\u00E9 pour rien.
  const rawLabelStart = labelStart > 0 ? leadingStrip + labelStart : 0;
  return { start: rawLabelStart, end: rawEnd };
}

/** Signale, depuis `firstTextNode()`, un abandon qui doit remonter jusqu'à la racine de la
 * recherche — jamais retomber sur un nœud frère suivant. Un simple `null` ne le peut pas : il
 * signifie déjà « rien trouvé dans cette branche, essayer la suivante », le sens normal et
 * voulu pour un `.cct-badge` (notre propre décoration, le vrai contenu la suit) ou un nœud de
 * texte purement blanc. `ABORT` porte le sens opposé et incompatible : « aucune conclusion de
 * cette recherche ne serait fiable, n'en cherche pas d'autre » (revue Reefact, PR #40— un
 * `return null` sur `<pre>` remonte, dans l'appelant, un `found` faux comme un autre, dont la
 * boucle `if (found) return found;` poursuit alors sur le frère suivant : exactement le
 * contraire de l'abandon voulu). */
const ABORT = Symbol('firstTextNode.abort');

/** Premier nœud de texte SIGNIFICATIF (au moins un caractère non blanc) du sous-arbre, en
 * profondeur — celui qui porte le début du corps réellement affiché. `.trim()`, pas une
 * simple longueur non nulle : le HTML rendu par GitHub porte une indentation entre la balise
 * de bloc (`<td class="comment-body">`) et le `<p>` qu'elle contient — un nœud de texte
 * purement blanc, enfant DIRECT du conteneur, avant même le `<p>` (mesuré sur une vraie PR,
 * pas une supposition). Un nœud non vide mais purement blanc n'est ni la ligne de préfixe ni
 * une partie utile de son calcul : le sauter pour atteindre le nœud suivant est correct,
 * jamais une perte d'information.
 *
 * Ignore aussi tout `.cct-badge` déjà posé : appelée AVANT le retrait des anciens badges
 * (revue Reefact, PR #40 — l'entretien du masquage doit survivre au chemin rapide, où les
 * badges existants ne sont ni retirés ni reconstruits), le premier nœud de texte du sous-arbre
 * PEUT être celui d'un badge — son propre texte ("issue", "blocking"…) n'est jamais le corps
 * réel du commentaire.
 *
 * Renonce ENTIÈREMENT (`ABORT`, jamais un simple `null` qui laisserait la recherche reprendre
 * chez un frère suivant) dès que le PREMIER niveau d'élément rencontré n'est pas un `<p>`, ou
 * qu'un DEUXIÈME niveau apparaît avant tout texte significatif — une ALLOW-LIST, pas une
 * deny-list (revue Reefact, PR #40, qui a fait tomber trois versions successives de cette
 * dernière : une énumération explicite de constructs de bloc — `PRE`/`CODE`/`BLOCKQUOTE`/`LI`/
 * `UL`/`OL`/`H1`-`H6`/`TABLE` —, étendue à `DETAILS`/`SUMMARY` pour couvrir aussi le HTML brut
 * documenté par GitHub, puis à une règle de profondeur pour couvrir en plus le Markdown INLINE
 * — gras, lien, emphase — dont l'ensemble de tags concevables est ouvert ; il restait pourtant
 * un HTML brut de PREMIER niveau non couvert, `<div>issue: fake</div>` rendu littéralement en
 * `<div>issue: fake</div>`, `DIV` n'étant dans AUCUNE version de la deny-list. Aucune de ces
 * trois versions n'était fausse dans ce qu'elle couvrait — chacune ratait seulement un membre
 * de plus d'un ensemble qui n'est, de fait, jamais fermé : GitHub accepte du HTML brut
 * sanitisé arbitraire en tête de commentaire, pas seulement les quelques constructs Markdown
 * ou HTML déjà rencontrés en revue.
 *
 * `<p>` est le seul conteneur dont on sait, MESURÉ à plusieurs reprises sur github.com (pas
 * supposé), qu'il enveloppe une ligne de texte Markdown ordinaire sans y avoir consommé de
 * syntaxe de tête — le paragraphe n'a lui-même aucun marqueur à perdre. Tout le reste (bloc de
 * code, citation, liste, titre, tableau, section repliable, `<div>` ou tout autre HTML brut, ou
 * une seconde balise imbriquée sous ce `<p>` — gras, lien, emphase…) est refusé, sans avoir
 * besoin d'en connaître le nom : `bodyText` vient de `commentBodyText()`, donc du DOM RENDU, où
 * la syntaxe de tête d'un construct qui N'EST PAS un paragraphe simple a de bonnes chances
 * d'avoir disparu, et `analyze()` peut alors traiter à tort ce contenu comme la ligne de
 * préfixe alors que la même ligne, lue sur la source BRUTE, ne matcherait jamais
 * `matchPrefix()`. S'arrêter net évite, en plus d'une correspondance fausse, d'écrire quoi que
 * ce soit DANS un tel élément affiché — le texte "issue: use `Foo`" (finding #1, plus haut)
 * reste accepté parce que son PREMIER nœud de texte, "issue: use ", est un enfant DIRECT du
 * `<p>` ; `<code>Foo</code>` le suit en frère, jamais en ancêtre.
 *
 * N'exclut PAS de renoncer aussi sur des plateformes ou des DOM légitimes qu'aucune mesure
 * n'a encore couverts (Azure DevOps, notamment — jamais vérifié en direct dans ce dépôt) : mais
 * y renoncer est TOUJOURS l'issue sûre — le repli de rendu du §5.5, et non une dégradation de
 * sélecteur : rien n'a échoué à être détecté, c'est le masquage qui s'abstient. Il n'est qu'un
 * affinage cosmétique du rendu, et son absence laisse le texte complet visible, jamais corrompu. Élargir cette
 * allow-list à un autre tag qu'un jour mesuré confirmerait coûte une ligne ; la resserrer après
 * l'avoir élargie à tort, une fois qu'un utilisateur a vu un texte corrompu, ne coûte jamais
 * rien de comparable.
 *
 * `isRoot` excepte uniquement l'appel de DÉPART de cette vérification : c'est le conteneur de
 * commentaire de la PLATEFORME (`.comment-body`, un `<td>` sur GitHub réel), jamais lui-même
 * un `<p>` de rendu Markdown — le soumettre à la même règle romprait la recherche pour CHAQUE
 * commentaire (`<td>` n'est pas `<p>`), et compterait à tort le conteneur de la plateforme
 * comme le premier niveau autorisé, privant le VRAI premier niveau du sien. */
function firstTextNode(
  node: Node,
  shape: RenderedBodyShape,
  isRoot = true,
  depth = 0
): Text | typeof ABORT | null {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    return (node as Text).data.trim().length > 0 ? (node as Text) : null;
  }
  if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
    const element = node as Element;
    if (element.classList.contains('cct-badge')) return null;
    // Une ligne de marqueur masquée (§3.6) n'est pas le début du corps affiché : un marqueur
    // AU-DESSUS de la ligne de préfixe laisse celle-ci en tête de ce que le lecteur voit.
    if (isHiddenSession(element)) return null;
    if (!isRoot && (depth >= 1 || !shape.paragraphTags.includes(element.tagName))) return ABORT;
  }
  const nextDepth = isRoot ? depth : depth + 1;
  for (const child of node.childNodes) {
    const found = firstTextNode(child, shape, false, nextDepth);
    if (found === ABORT) return ABORT; // remonte l'abandon jusqu'à la racine, jamais un frère suivant
    if (found) return found;
  }
  return null;
}

/** La projection en badges est-elle SANS PERTE pour ce préfixe — seule condition sous laquelle
 * le masquer est correct (revue Reefact, PR #40) ? `a.decorations` (§3.5, doc de
 * `CommentAnalysis`) est délibérément une projection FILTRÉE : une décoration syntaxiquement
 * valide mais REJETÉE (`E-UNKNOWN-DECORATION`, `decorations.allowFree` à `false`) n'y figure
 * jamais, et `selectDecorationsForRender()` replie ensuite les descriptives en excès de
 * `MAX_RENDERED_DECORATIONS` dans un badge « +N » sans leurs noms. Dans les deux cas, masquer
 * le texte ferait disparaître une information — la décoration rejetée, ou le nom d'une
 * décoration repliée — que les badges affichés ne portent PAS. `shown` (déjà borné par
 * `selectDecorationsForRender`), jamais `a.decorations` seul : c'est ce qui sera VISIBLE PAR
 * SON NOM qui compte, pas ce qui a été résolu en amont.
 *
 * `diagnostics` couvre un troisième cas, différent des deux premiers : `a.resolved`/`shown`
 * sont déjà sous forme CANONIQUE (§3.1), donc `ISSUE: x`, `issue (Blocking): x`,
 * `issue(blocking): x` ou `issue (blocking, blocking): x` produisent les MÊMES badges propres
 * qu'une saisie parfaite — rien n'est rejeté ni replié, les deux vérifications ci-dessus
 * passeraient. Pourtant `W-CASE`/`W-DECORATION-STYLE` (§3.5.2) existent précisément parce que
 * la CASSE ou la PONCTUATION écrites comptent : les masquer avec le texte remplacerait de fait
 * la saisie fautive par une saisie propre qu'elle n'était pas — et `config.severities` peut
 * promouvoir l'un ou l'autre en `error`, rendant le commentaire bloquant sans que la vue
 * publiée ne montre plus pourquoi (revue Reefact, PR #40). `a.diagnostics` déjà filtré par
 * `severities` (`off` n'y figure jamais, §3.5.2) : un `W-*` désactivé par configuration ne
 * bloque donc pas le masquage, conformément à ce choix. */
function isLosslessBadgeProjection(prefixLine: string, shown: ResolvedDecoration[], diagnostics: Diagnostic[]): boolean {
  if (diagnostics.some((d) => d.code === 'W-CASE' || d.code === 'W-DECORATION-STYLE')) return false;
  const match = matchPrefix(prefixLine);
  if (!match) return false; // ne devrait pas arriver si le label est résolu ; on renonce prudemment sinon
  if (match.decorations === null) return true; // aucune décoration écrite : rien à perdre
  const parsed = parseDecorations(match.decorations);
  // Une erreur de syntaxe (parenthèses vides, élément vide entre deux virgules, caractère
  // invalide, espace interne — §3.3, E-DECORATION-SYNTAX) ne produit ni ne modifie AUCUN badge :
  // ce n'est pas une décoration qui disparaîtrait de l'affichage, c'est la PREUVE du défaut
  // elle-même — la virgule ou la parenthèse fautive — qui disparaîtrait avec le texte (revue
  // Reefact, PR #40 — "issue (): x", "issue (blocking,): x").
  if (parsed.syntaxIssues.length > 0) return false;
  const written = new Set(parsed.canonical);
  const shownIds = new Set(shown.map((d) => d.id));
  for (const id of written) {
    if (!shownIds.has(id)) return false;
  }
  return true;
}

/** Sujet mis en avant (§5.5) : ce qui suit le préfixe sur la PREMIÈRE ligne est enveloppé ici,
 * pour être rendu en gras SUR la ligne des badges, à leur droite — demande Reefact, qui trouvait
 * le sujet relégué sous un bandeau de badges alors qu'il en est la suite de lecture immédiate.
 * Deux gestes indissociables, dont c'est le premier : ce wrapper porte le gras, et
 * `decorateComment` pose ensuite les badges DANS le même élément que lui, ce qui les met en flux
 * inline avec le sujet plutôt qu'au-dessus.
 *
 * `<span>`, jamais `<strong>` : la mise en avant est COSMÉTIQUE — rien au §3.1 ne donne au sujet
 * l'« importance forte » que `<strong>` annonce, et l'ajouter mettrait dans l'arbre
 * d'accessibilité une emphase que l'auteur n'a pas écrite (§10). Le poids visuel se lit à l'œil,
 * l'information, elle, est déjà portée par les badges. */
const SUBJECT_CLASS = 'cct-subject';
/** Marque posée par `decorateComment` sur l'élément où il écrit ses badges, quand ce n'est pas
 * le corps lui-même. C'est la moitié DOM d'`OWN_BADGES` (adapter-shared). */
const BADGE_HOST_CLASS = 'cct-badge-host';

/** Nœuds du sujet, dans l'ordre : depuis le frère qui suit le préfixe masqué jusqu'à la fin de
 * la PREMIÈRE ligne. Deux frontières, parce que le corps rendu en connaît deux : un `<br>` —
 * ce que devient une simple fin de ligne dans un commentaire GitHub — et une fin de ligne
 * littérale à l'intérieur d'un nœud de texte, quand le corps tient d'un seul tenant (le cas des
 * DOM de test, et de toute plateforme qui ne réécrit pas les sauts de ligne). Sans la seconde,
 * un corps « issue: sujet\ndiscussion » d'un seul nœud verrait « discussion » passer en gras
 * avec le sujet.
 *
 * La mise en forme inline du sujet (`code`, lien, gras, mention) est gardée telle quelle, en
 * frères successifs : le sujet la traverse, c'est le cas courant, pas un cas limite.
 *
 * Mais un saut de ligne peut vivre DANS cette mise en forme, et non à côté : `**sujet  \ncorps**`
 * rend `<strong>sujet<br>corps</strong>`, un seul frère dont le `<br>` est interne (revue
 * Reefact, PR #45). Prendre ce frère en entier passerait « corps » en gras avec le sujet, et
 * `markSubjectBreak()` ne verrait ensuite aucun `<br>` après le wrapper : ni la borne ni la
 * respiration. On RENONCE alors entièrement — tableau vide, donc aucun wrapper, aucun
 * déplacement de badge, le commentaire rendu comme avant ce rendu.
 *
 * Renoncer plutôt que scinder le frère fautif : le scinder demanderait de cloner un élément de
 * l'AUTEUR pour en répartir le contenu de part et d'autre du saut — un `<a>` dupliqué devient
 * deux liens, et le §9.4 dit ce que vaut un affinage cosmétique face à ce risque. Renoncer
 * plutôt que s'arrêter AVANT ce frère, aussi : le début de la ligne passerait en gras et sa fin
 * non, sur une même ligne — une mise en avant qui désignerait un fragment au lieu du sujet. */
function subjectNodes(hidden: Element, shape: RenderedBodyShape): ChildNode[] {
  const nodes: ChildNode[] = [];
  for (let node = hidden.nextSibling; node !== null; node = node.nextSibling) {
    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const element = node as Element;
      if (element.tagName === shape.lineBreakTag) break;
      // Une ligne de marqueur masquée commence une autre ligne : le sujet s'arrête avant elle.
      if (isHiddenSession(element)) break;
      // borne interne : on ne sait pas border proprement
      if (element.querySelector(shape.lineBreakTag) !== null) return [];
    }
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      const newline = (node as Text).data.indexOf('\n');
      if (newline === 0) break; // la ligne s'arrête avant ce nœud : rien à en prendre
      if (newline > 0) {
        (node as Text).splitText(newline); // la suite devient un frère, hors du sujet
        nodes.push(node);
        break;
      }
    }
    nodes.push(node);
  }
  return nodes;
}

/** Respiration entre la ligne du sujet et la suite du commentaire (demande Reefact : « un saut
 * de ligne entre la ligne des badges + sujet et le body »), posée UNIQUEMENT quand le corps
 * reprend sur la ligne suivante du MÊME paragraphe — c'est-à-dire quand un `<br>` clôt le sujet.
 * Un corps qui reprend au paragraphe SUIVANT est déjà séparé par la marge de bloc de la
 * plateforme : y ajouter quoi que ce soit doublerait un écart qui existe (« s'il y en a déjà un,
 * pas besoin d'en rajouter un autre »).
 *
 * Un NŒUD, et non une règle CSS sur le `<br>` ni sur le sujet — les deux idées naturelles ont
 * été essayées dans un vrai Chromium avant d'écrire cette ligne, et toutes deux échouent :
 *   - une marge sur le `<br>`, avec ou sans `display: block`, ne déplace RIEN (mesuré : 21 px
 *     entre les deux lignes, avec comme sans la règle) ;
 *   - `display: inline-block` + `margin-bottom` sur `.cct-subject` fonctionne sur un sujet
 *     court, mais fait basculer un sujet LONG tout entier SOUS les badges — la boîte
 *     rétrécie-à-la-demande prend la largeur du bloc conteneur, ne tient plus sur la ligne
 *     entamée, et passe à la suivante. C'est exactement la mise en page que ce rendu existe
 *     pour éviter.
 * `spikes/subject-line.mjs` rejoue ces mesures pour que le jour où l'une des deux deviendrait
 * vraie, ce soit constaté et non deviné. */
const SUBJECT_BREAK_CLASS = 'cct-subject-break';

/** Le bloc VISIBLE qui suit `block` : ni la mention de session, ni un paragraphe réduit à un
 * marqueur masqué (§3.6). Resserrer la marge du sujet au-dessus d'un tel bloc rapprocherait la
 * mention, qui doit rester à un écart entier. */
function nextVisibleBlock(block: Element): Element | null {
  for (let next = block.nextElementSibling; next !== null; next = next.nextElementSibling) {
    if (isOwn(next) || isHiddenSession(next)) continue;
    return next;
  }
  return null;
}

/** Pose ou retire l'espaceur selon ce que le DOM porte VRAIMENT après le sujet, à chaque
 * passage : un `<br>` peut apparaître ou disparaître d'une édition à l'autre, et l'espaceur ne
 * doit jamais survivre au saut de ligne qui le justifiait. Purement décoratif, sans texte :
 * `commentBodyText()` relit le même corps avec ou sans lui. */
function markSubjectBreak(wrapper: Element, shape: RenderedBodyShape, body: Element): void {
  const next = wrapper.nextSibling;
  // Un saut de ligne que ne suit plus rien de VISIBLE — la ligne d'après était un marqueur de
  // session, masqué (§3.6) — ne fait reprendre aucun corps : l'espaceur ferait un écart sous rien.
  const lineBreak =
    next !== null &&
    next.nodeType === 1 &&
    (next as Element).tagName === shape.lineBreakTag &&
    significantSibling(next, 'nextSibling') !== null
      ? (next as Element)
      : null;
  const host = wrapper.parentElement;
  const existing = host?.querySelector(`:scope > .${SUBJECT_BREAK_CLASS}`) ?? null;
  // L'écart entre la ligne du sujet et le corps : deux tiers d'écart de paragraphe, que le corps
  // reprenne au paragraphe suivant ou à la ligne suivante (demande Reefact, #163) — les deux
  // écritures se rendent à l'identique.
  const headerGap = cssLength(paragraphGapPx(body, shape), HEADER_GAP_RATIO);
  if (lineBreak === null) {
    existing?.remove();
    // Le corps reprend au paragraphe suivant : la marge de la PLATEFORME sépare déjà, et c'est
    // elle qu'il faut resserrer, sur le paragraphe du sujet lui-même — une règle de notre feuille
    // ne l'emporterait pas à coup sûr sur celle de la plateforme. Seulement si un bloc suit : la
    // marge d'un dernier bloc n'écarte rien, et la poser en ajouterait.
    if (host !== null && host !== body && nextVisibleBlock(host) !== null) {
      setHeaderMargin(host as HTMLElement, headerGap);
    } else if (host !== null) {
      releaseHeaderMargin(host);
    }
    return;
  }
  if (host !== null) releaseHeaderMargin(host);
  if (existing !== null && existing.previousSibling === lineBreak) {
    // déjà en place : seul l'écart peut avoir changé
    const spacer = existing as HTMLElement;
    if (spacer.style.getPropertyValue(PARAGRAPH_GAP_VAR) !== headerGap) spacer.style.setProperty(PARAGRAPH_GAP_VAR, headerGap);
    return;
  }
  existing?.remove();
  const spacer = globalThis.document.createElement('span');
  spacer.className = SUBJECT_BREAK_CLASS;
  spacer.style.setProperty(PARAGRAPH_GAP_VAR, headerGap);
  lineBreak.after(spacer);
}

/** Enveloppe le sujet, si ce n'est pas déjà fait. Idempotent, et réentretenu à chaque passage
 * comme le masquage lui-même : une réhydratation de plateforme peut emporter ce wrapper sans
 * toucher aux badges. Un sujet VIDE (`issue:` seul, §3.5 E-EMPTY-SUBJECT) ne reçoit rien —
 * un span vide n'a rien à mettre en gras. */
function wrapSubject(hidden: Element, shape: RenderedBodyShape, body: Element): void {
  const next = hidden.nextSibling;
  if (next !== null && next.nodeType === 1 && (next as Element).classList.contains(SUBJECT_CLASS)) {
    markSubjectBreak(next as Element, shape, body); // wrapper déjà là : seul l'espaceur reste à réentretenir
    return;
  }
  const nodes = subjectNodes(hidden, shape);
  if (nodes.length === 0) return;
  const wrapper = globalThis.document.createElement('span');
  wrapper.className = SUBJECT_CLASS;
  hidden.after(wrapper);
  for (const node of nodes) wrapper.appendChild(node);
  markSubjectBreak(wrapper, shape, body);
}

/** Rend les enfants d'un wrapper à son parent, à leur place exacte, et referme la coupure —
 * jamais deux nœuds de texte adjacents, que `hiddenPrefixSpan()` ne saurait plus border. */
function unwrapInPlace(wrapper: Element): void {
  const parent = wrapper.parentNode;
  if (!parent) return;
  while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
  wrapper.remove();
  parent.normalize();
}

/** Rend visible un préfixe masqué, et referme la coupure derrière lui. */
function revealPrefix(hidden: Element): void {
  const parent = hidden.parentNode;
  hidden.replaceWith(globalThis.document.createTextNode(hidden.textContent ?? ''));
  parent?.normalize();
}

/** Défait l'enveloppe du sujet et l'espaceur qui l'accompagne. Les wrappers vont par paire et ne
 * se voient jamais l'un sans l'autre : un `.cct-subject` resté seul — préfixe démasqué par une
 * réhydratation, sujet non — serait avalé par le wrapper que le passage suivant construit (il
 * n'est ni un `<br>` ni une fin de ligne, donc il APPARTIENT au sujet au sens de
 * `subjectNodes()`), et le sujet se retrouverait emballé deux fois. */
function unwrapSubject(commentBodyElement: Element): void {
  releaseHeaderMargin(commentBodyElement);
  for (const spacer of [...commentBodyElement.querySelectorAll(`.${SUBJECT_BREAK_CLASS}`)]) spacer.remove();
  const wrapper = commentBodyElement.querySelector(`.${SUBJECT_CLASS}`);
  if (wrapper) unwrapInPlace(wrapper);
}

/** Défait TOUT ce que `decorateComment()` a posé sur une page — badges, espaceur, sujet mis en
 * avant, préfixe masqué — quand l'extension quitte le contexte qui les justifiait : plus de PR,
 * ou `mode: off` (§7 : « extension entièrement inactive »).
 *
 * Ne retirer que les badges, comme le faisait `clearBadges()`, laissait le préfixe structuré
 * INVISIBLE sans plus rien pour en porter l'information : une extension qui se déclare inactive
 * continuait de masquer une partie du texte de l'auteur, jusqu'au rechargement de la page. Le
 * défaisage doit couvrir tout ce que le rendu pose, pas seulement ce qui se voit. */
export function clearCommentDecorations(root: ParentNode): void {
  revealSession(root);
  for (const badge of [...root.querySelectorAll('.cct-badge')]) badge.remove();
  // La marque de l'hôte part avec les badges qu'elle désignait : la laisser ferait relire comme
  // « nôtre » un élément où plus rien n'est à nous.
  for (const h of [...root.querySelectorAll(`.${BADGE_HOST_CLASS}`)]) h.classList.remove(BADGE_HOST_CLASS);
  for (const spacer of [...root.querySelectorAll(`.${SUBJECT_BREAK_CLASS}`)]) spacer.remove();
  releaseHeaderMargin(root);
  // Le sujet AVANT le préfixe : les deux vivent dans le même parent, et défaire le sujet
  // d'abord laisse `revealPrefix()` recoller la ligne entière d'un seul `normalize()`.
  for (const wrapper of [...root.querySelectorAll(`.${SUBJECT_CLASS}`)]) unwrapInPlace(wrapper);
  for (const hidden of [...root.querySelectorAll('.cct-hidden-prefix')]) revealPrefix(hidden);
}

/** Masque le préfixe structuré du corps AFFICHÉ (§5.5) — jamais le corps STOCKÉ côté serveur,
 * qu'aucune de ces écritures n'atteint : ce nœud est purement client, ajouté au rendu, jamais
 * renvoyé à la plateforme. Le formulaire d'édition d'un commentaire existant est un sous-arbre
 * DISTINCT du DOM de la plateforme (§A.2 : `.js-comment-edit-form` ou son équivalent React),
 * jamais dérivé de ce corps rendu — rouvrir l'édition réaffiche donc le texte complet, préfixe
 * compris, sans le concours de cette fonction ni aucun risque qu'elle l'ait altéré.
 *
 * Le calcul se fait sur `first.data` LUI-MÊME, jamais sur une ligne dérivée de `bodyText` par
 * découpage de chaînes : sur une vraie page GitHub, le texte que `analyze()` reconnaît comme
 * « première ligne » peut être réparti sur DEUX nœuds DOM frères (l'indentation entre la
 * balise de bloc et son `<p>`, puis le `<p>` lui-même) sans qu'aucun élément ne les sépare
 * autrement — un décalage calculé sur la chaîne concaténée aurait scindé le sujet quelques
 * caractères trop loin, silencieusement (vérifié sur PR #40, jamais vu par les tests jsdom :
 * leurs corps sont toujours un nœud de texte unique).
 *
 * Idempotent : un wrapper déjà posé n'est jamais refait ni doublé (`bodyText` est immuable une
 * fois le commentaire publié, la frontière ne peut donc pas changer sous lui) ; une fois retiré
 * — résolution perdue sur un changement de configuration en direct, §8.1.1 — le texte redevient
 * un nœud ordinaire, `normalize()` referme la coupure plutôt que de laisser deux nœuds de texte
 * adjacents. */
function applyPrefixVisibility(
  commentBodyElement: Element,
  /** Le masquage DEMANDÉ, ou `null` pour DÉFAIRE celui qui serait en place.
   *
   * Les deux données voyagent ensemble parce qu'elles ne se séparent pas : masquer exige une
   * forme de corps rendu, défaire n'en exige aucune. Séparées, l'appelant devait en fournir
   * une même quand il renonçait, et il y passait `MARKDOWN_HTML_BODY_SHAPE` — une hypothèse
   * GitHub que ce corps de fonction ne lit jamais, mais que la prochaine relecture aurait
   * prise pour un fait (revue Reefact, PR #66). Le couple la rend inexprimable. */
  masking: { prefixLine: string; shape: RenderedBodyShape } | null,
  bodyText: string
): void {
  const existing = commentBodyElement.querySelector('.cct-hidden-prefix');
  if (masking === null) {
    if (existing) {
      // Le sujet part avec le préfixe : sa mise en avant ne se lit qu'avec les badges, qui
      // disparaissent au même instant. Avant `replaceWith`, pour que le `normalize()` final
      // referme les DEUX coupures d'un coup.
      unwrapSubject(commentBodyElement);
      revealPrefix(existing);
    }
    return;
  }
  const { prefixLine, shape } = masking;
  if (existing) {
    wrapSubject(existing, shape, commentBodyElement); // réentretien, comme le masquage lui-même : gratuit si rien n'a bougé
    return;
  }
  // Un `.cct-subject` sans son préfixe masqué, avant de reconstruire : `wrapSubject()`
  // l'emballerait tel quel dans le nouveau wrapper, une couche de plus à chaque passage.
  unwrapSubject(commentBodyElement);
  const first = firstTextNode(commentBodyElement, shape);
  if (!first || first === ABORT) return;
  const span = hiddenPrefixSpan(first.data, prefixLine);
  if (span === null) return;
  const hiddenText = first.data.slice(span.start, span.end);
  // Ne jamais masquer la totalité du contenu visible d'un commentaire (sujet vide, aucune
  // autre ligne, aucun émoji de tête) : le lecteur verrait une bulle sans aucun texte, alors
  // que rien n'empêche de publier "issue:" seul (§3.5 signale E-EMPTY-SUBJECT, mais ne bloque
  // pas la publication). `replace()`, pas `startsWith` : `bodyText` peut commencer par un
  // émoji de tête (§3.1) qui reste VISIBLE, hors de `hiddenText` — retirer ce dernier de
  // `bodyText`, où qu'il commence, dit correctement si quelque chose d'autre resterait visible
  // (l'émoji conservé compris).
  if (bodyText.replace(hiddenText, '').trim() === '') return;
  let target = first;
  if (span.start > 0) {
    // `first` ne garde que l'émoji toléré (§3.1), VISIBLE — jamais dans le span masqué, qui
    // ne couvre que « label (décorations): » (revue Reefact, PR #40). `target` porte la suite,
    // déjà en place comme nœud frère.
    target = first.splitText(span.start);
  }
  target.splitText(span.end - span.start); // `target` ne garde que le préfixe ; la suite devient un nœud frère
  const hidden = globalThis.document.createElement('span');
  hidden.className = 'cct-hidden-prefix';
  target.replaceWith(hidden);
  hidden.appendChild(target);
  wrapSubject(hidden, shape, commentBodyElement);
}

// ————— Marqueur de session (§3.6, §5.5) —————
//
// Chaque ligne `[session:<valeur>]` reconnue est masquée LÀ OÙ ELLE EST dans le corps AFFICHÉ, sans
// laisser de trace — ni ligne vide, ni paragraphe blanc, ni écart doublé —, et une seule mention,
// `<icône> session: <valeur en minuscules>`, est posée tout en BAS du corps : sous un pied de
// signature, quand le marqueur le précède (#169). Même discipline que le masquage du préfixe :
// rien n'est écrit côté plateforme, tout se défait, et dans le doute on renonce — le corps reste
// alors entier, marqueurs compris, lisible tel qu'écrit.

/** Une ligne de marqueur, masquée : notre `<span>`, qui garde le texte d'origine dans
 * `textContent`, si bien que la relecture du corps (`commentBodyText()`) retrouve le marqueur tel
 * qu'écrit et que la reconnaissance est stable d'un passage à l'autre. Il emporte le saut de
 * ligne qui la termine, quand il y en a un : sans lui, une ligne vide resterait à sa place. */
const HIDDEN_SESSION_CLASS = 'cct-hidden-session';
/** Un paragraphe de la plateforme réduit au seul marqueur, masqué EN ENTIER : masquer son seul
 * texte laisserait un paragraphe vide, dont les marges font un écart de trop. Une classe posée sur
 * un élément de la PLATEFORME, comme la marge resserrée du sujet : retirée avec le reste. */
const HIDDEN_SESSION_BLOCK_CLASS = 'cct-hidden-session-block';
/** Ce que l'extension AFFICHE, en bas du corps. Il ajoute du texte : `commentBodyText()` l'exclut. */
const SESSION_CLASS = 'cct-session';
/** Le texte de la mention, dans son propre `<span>` EN LIGNE : c'est lui, et lui seul, qui porte
 * l'infobulle et le curseur. Posés sur le bloc, ils valaient aussi pour l'écart au-dessus de la
 * mention (`--cct-session-gap`, un `padding`) : l'infobulle s'ouvrait sur une bande vide. */
const SESSION_TEXT_CLASS = 'cct-session-text';

/** Le texte de la mention : l'identifiant — jamais sa description, montrée au survol —, ou
 * `#ERROR` quand le corps porte plusieurs marqueurs — aucune session n'est alors désignée
 * (§3.6), et `W-SESSION-MULTIPLE` dit pourquoi. */
function sessionText(marker: SessionMarker, config: EffectiveConfig): string {
  return `${config.sessionIcon} session: ${marker.value === null ? '#ERROR' : marker.value.toLowerCase()}`;
}

/** Une écriture de l'extension sans texte d'auteur : badge, mention, espaceur du sujet. */
const isOwn = (node: Node): boolean =>
  node.nodeType === 1 &&
  ((node as Element).classList.contains('cct-badge') ||
    (node as Element).classList.contains(SESSION_CLASS) ||
    (node as Element).classList.contains(SUBJECT_BREAK_CLASS));

/** Une ligne de marqueur déjà masquée par nous — span ou paragraphe. Ce qui la suit ou la précède
 * se lit comme si elle n'existait pas : c'est la définition même de « sans trace ». */
const isHiddenSession = (node: Node): boolean =>
  node.nodeType === 1 &&
  ((node as Element).classList.contains(HIDDEN_SESSION_CLASS) ||
    (node as Element).classList.contains(HIDDEN_SESSION_BLOCK_CLASS));

const isBlank = (node: Node): boolean => node.nodeType === 3 && (node as Text).data.trim() === '';

/** Frère significatif voisin — ni blanc, ni écriture de l'extension, ni ligne masquée. */
function significantSibling(node: Node, direction: 'previousSibling' | 'nextSibling'): ChildNode | null {
  for (let n = node[direction]; n !== null; n = n[direction]) {
    if (isBlank(n) || isOwn(n) || isHiddenSession(n)) continue;
    return n;
  }
  return null;
}

/** Une ligne de marqueur trouvée dans le corps rendu : un paragraphe entier, ou une plage d'un
 * nœud de texte — `[start, end)` — suivie, le cas échéant, du saut de ligne déclaré qui la termine. */
type MarkerHit =
  | { kind: 'block'; block: Element; raw: string }
  | { kind: 'range'; node: Text; start: number; end: number; lineBreak: Element | null; raw: string }
  | {
      kind: 'span';
      node: Text;
      start: number;
      endNode: Text;
      end: number;
      lineBreak: Element | null;
      raw: string;
    };

/** La description d'un marqueur, mise en italique (§3.6) : un `<em>` qui ne contient que du
 * texte. C'est la SEULE mise en forme admise sur la ligne d'un marqueur — mesurée identique sur
 * les trois plateformes, quelle que soit son écriture dans le source
 * (docs/session-marker-rendering-fr.md). */
const isItalicDescription = (n: Node | null): n is Element =>
  n !== null &&
  n.nodeType === 1 &&
  (n as Element).tagName === 'EM' &&
  n.childNodes.length > 0 &&
  [...n.childNodes].every((c) => c.nodeType === 3);

/** Le texte qui précède l'italique se termine par le tiret cadratin bordé de blancs, et celui qui
 * le suit commence par le crochet fermant : `[session:id — <em>phrase</em>]`, rien d'autre. */
const ENDS_WITH_SEPARATOR = /\s\u2014\s+$/u;

/** Les lignes du corps rendu qui sont des marqueurs, dans l'ordre du document. Allow-list, comme
 * `firstTextNode()` : un marqueur n'est cherché que dans un paragraphe déclaré par la plateforme,
 * ou dans du texte posé directement dans le corps, et sa ligne doit être un nœud de texte ENFANT
 * DIRECT de ce bloc, bornée de part et d'autre par le bord du bloc, un saut de ligne déclaré, ou
 * une fin de ligne littérale du même nœud. Un bloc de code, une citation, une liste, une mise en
 * forme inline sur la ligne : rien n'y est cherché — à une exception près, la description en
 * italique (`isItalicDescription`), où la ligne est texte, `<em>`, texte. Le texte vient du DOM rendu, où la syntaxe de
 * ces constructions a pu disparaître — `analyze()` peut donc reconnaître un marqueur que la
 * source écrivait dans un bloc de code ; ce n'est que dans un paragraphe simple que la ligne
 * rendue est la ligne écrite. */
function markerHits(body: Element, raws: ReadonlySet<string>, shape: RenderedBodyShape): MarkerHit[] {
  const hits: MarkerHit[] = [];
  const isBreak = (n: Node | null): boolean => n !== null && n.nodeType === 1 && (n as Element).tagName === shape.lineBreakTag;
  const isParagraph = (n: Node | null): boolean =>
    n !== null && n.nodeType === 1 && shape.paragraphTags.includes((n as Element).tagName);

  const scan = (container: Element, inBody: boolean): void => {
    // Dans le corps lui-même, un paragraphe voisin borne la ligne autant qu'un saut déclaré.
    const bounds = (n: Node | null): boolean => n === null || isBreak(n) || (inBody && isParagraph(n));
    for (const child of [...container.childNodes]) {
      if (child.nodeType !== 3) continue;
      const node = child as Text;
      const segments = node.data.split('\n');
      let offset = 0;
      for (let k = 0; k < segments.length; k++) {
        const segment = segments[k]!;
        const at = offset;
        offset += segment.length + 1;
        const raw = segment.trim();
        if (!raws.has(raw)) continue;
        // Dernière ligne ÉCRITE du nœud : seuls des blancs la suivent dans ce nœud.
        const last = k === segments.length - 1 || node.data.slice(at + segment.length).trim() === '';
        if (k === 0 && !bounds(significantSibling(node, 'previousSibling'))) continue;
        const next = last ? significantSibling(node, 'nextSibling') : null;
        if (last && !bounds(next)) continue;
        if (!last) {
          // Au milieu du nœud : la ligne part avec la fin de ligne qui la termine.
          hits.push({ kind: 'range', node, start: at, end: at + segment.length + 1, lineBreak: null, raw });
        } else if (isBreak(next)) {
          // Un saut déclaré la termine : il part avec elle.
          hits.push({ kind: 'range', node, start: at, end: node.data.length, lineBreak: next as Element, raw });
        } else {
          // Dernière ligne de son bloc : les blancs qui la précèdent dans ce nœud partent avec elle
          // — une plateforme qui préserverait les blancs les afficherait (revue Reefact, PR #163).
          // Le saut déclaré qui la précède, lui, reste : en fin de bloc, il ne fait aucune ligne.
          const start = k === 0 ? 0 : node.data.slice(0, at).trimEnd().length;
          hits.push({ kind: 'range', node, start, end: node.data.length, lineBreak: null, raw });
        }
      }
    }
    // La description en italique : la ligne va de la dernière ligne du texte qui précède l'`<em>`
    // à la première ligne du texte qui le suit, avec les mêmes bornes qu'une ligne d'un seul nœud.
    for (const em of [...container.children]) {
      if (!isItalicDescription(em)) continue;
      const before = em.previousSibling;
      const after = em.nextSibling;
      if (before === null || before.nodeType !== 3 || after === null || after.nodeType !== 3) continue;
      const head = before as Text;
      const tail = after as Text;
      const at = head.data.lastIndexOf('\n') + 1;
      const opening = head.data.slice(at);
      const cut = tail.data.indexOf('\n');
      const closing = cut === -1 ? tail.data : tail.data.slice(0, cut);
      if (!ENDS_WITH_SEPARATOR.test(opening) || !closing.trimStart().startsWith(']')) continue;
      const raw = `${opening}${em.textContent ?? ''}${closing}`.trim();
      if (!raws.has(raw)) continue;
      const first = at === 0;
      if (first && !bounds(significantSibling(head, 'previousSibling'))) continue;
      const last = cut === -1 || tail.data.slice(cut).trim() === '';
      const next = last ? significantSibling(tail, 'nextSibling') : null;
      if (last && !bounds(next)) continue;
      if (!last) {
        hits.push({ kind: 'span', node: head, start: at, endNode: tail, end: cut + 1, lineBreak: null, raw });
      } else if (isBreak(next)) {
        hits.push({ kind: 'span', node: head, start: at, endNode: tail, end: tail.data.length, lineBreak: next as Element, raw });
      } else {
        const start = first ? 0 : head.data.slice(0, at).trimEnd().length;
        hits.push({ kind: 'span', node: head, start, endNode: tail, end: tail.data.length, lineBreak: null, raw });
      }
    }
  };

  for (const child of [...body.childNodes]) {
    if (!isParagraph(child)) continue;
    const block = child as Element;
    const content = [...block.childNodes].filter((n) => !isBlank(n) && !isOwn(n));
    if (content.length === 1 && content[0]!.nodeType === 3 && raws.has((content[0] as Text).data.trim())) {
      hits.push({ kind: 'block', block, raw: (content[0] as Text).data.trim() });
      continue;
    }
    // Un paragraphe réduit au marqueur décrit en italique : masqué en entier, lui aussi.
    if (
      content.length === 3 &&
      content[0]!.nodeType === 3 &&
      isItalicDescription(content[1]!) &&
      content[2]!.nodeType === 3 &&
      ENDS_WITH_SEPARATOR.test((content[0] as Text).data) &&
      (content[2] as Text).data.trim() === ']' &&
      raws.has((block.textContent ?? '').trim())
    ) {
      hits.push({ kind: 'block', block, raw: (block.textContent ?? '').trim() });
      continue;
    }
    scan(block, false);
  }
  scan(body, true);
  // `scan(body)` vient en dernier : remettre les lignes dans l'ordre du document.
  return hits.sort((x, y) => {
    const a = x.kind === 'block' ? x.block : x.node;
    const b = y.kind === 'block' ? y.block : y.node;
    if (a === b) return (x as { start: number }).start - (y as { start: number }).start;
    return a.compareDocumentPosition(b) & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */ ? -1 : 1;
  });
}

/** Masque une ligne trouvée. Appelée de la DERNIÈRE à la première : scinder un nœud de texte à
 * partir de la fin laisse valables les positions de ce qui le précède. */
function hideHit(hit: MarkerHit): void {
  if (hit.kind === 'block') {
    hit.block.classList.add(HIDDEN_SESSION_BLOCK_CLASS);
    return;
  }
  const { node, start, end, lineBreak } = hit;
  // Une ligne sur plusieurs nœuds (description en italique) se termine dans `endNode`.
  const endNode = hit.kind === 'span' ? hit.endNode : node;
  if (end < endNode.data.length) endNode.splitText(end);
  const line = start > 0 ? node.splitText(start) : node;
  const wrapper = globalThis.document.createElement('span');
  wrapper.className = HIDDEN_SESSION_CLASS;
  line.replaceWith(wrapper);
  wrapper.appendChild(line);
  if (hit.kind === 'span') {
    while (wrapper.nextSibling !== null && wrapper.lastChild !== endNode) wrapper.appendChild(wrapper.nextSibling);
  }
  if (lineBreak !== null) {
    while (wrapper.nextSibling !== null && wrapper.nextSibling !== lineBreak) wrapper.appendChild(wrapper.nextSibling);
    wrapper.appendChild(lineBreak);
  }
}

/** Variable portée par l'espaceur du sujet : sa hauteur, deux tiers d'écart de paragraphe. */
const PARAGRAPH_GAP_VAR = '--cct-paragraph-gap';
/** Variable portée par la mention de session : ce qu'il faut ajouter au-dessus d'elle. */
const SESSION_GAP_VAR = '--cct-session-gap';

/** Part de l'écart de paragraphe entre la ligne du sujet et le corps (demande Reefact, #163) : le
 * corps rapproché d'un tiers se lit avec son titre, comme un seul bloc. Le pied, une métadonnée,
 * garde l'écart entier. */
const HEADER_GAP_RATIO = 2 / 3;

/** Écart normal par corps, une fois mesuré : il tient à la feuille de style de la plateforme, pas
 * au commentaire, et la sonde qui le lit écrit dans le DOM — la relancer à chaque passage de rendu
 * ferait de chaque passage la cause du suivant. */
const paragraphGapCache = new WeakMap<Element, number | null>();

/** L'écart normal entre deux paragraphes du corps, en pixels, tel que la PAGE l'applique — jamais
 * supposé, il diffère d'une plateforme à l'autre. Lu sur un paragraphe SONDE, posé en tête du
 * corps puis retiré dans la même tâche : un paragraphe existant ne suffit pas, le seul paragraphe
 * d'un commentaire écrit d'un bloc est aussi le dernier, que les plateformes privent de marge
 * (`.markdown-body > *:last-child` sur GitHub). La sonde n'est jamais la dernière.
 *
 * Sans marge lisible — plateforme qui n'en met pas —, la taille de police du CORPS en tient lieu,
 * en pixels : un `em` résolu plus tard sur la mention, écrite plus petit, donnerait un autre écart
 * que celui de l'en-tête. `null` : pas de mise en page du tout (aucune fenêtre). */
function paragraphGapPx(body: Element, shape: RenderedBodyShape): number | null {
  if (paragraphGapCache.has(body)) return paragraphGapCache.get(body)!;
  const view = body.ownerDocument.defaultView;
  const tag = shape.paragraphTags[0];
  let gap: number | null = null;
  if (view && tag) {
    const probe = body.ownerDocument.createElement(tag.toLowerCase());
    body.insertBefore(probe, body.firstChild);
    const margin = Number.parseFloat(view.getComputedStyle(probe).marginBottom);
    probe.remove();
    const font = Number.parseFloat(view.getComputedStyle(body).fontSize);
    gap = Number.isFinite(margin) && margin > 0 ? margin : Number.isFinite(font) && font > 0 ? font : null;
  }
  paragraphGapCache.set(body, gap);
  return gap;
}

/** Une longueur CSS, arrondie au centième : la valeur relue sur un style est sérialisée par le
 * navigateur, et une comparaison au caractère près avec un flottant non arrondi réécrirait le
 * style à chaque passage — chaque écriture déclenchant le passage suivant. */
function cssLength(px: number | null, factor: number): string {
  return px === null ? `${Math.round(factor * 100) / 100}em` : `${Math.round(px * factor * 100) / 100}px`;
}

/** Marge basse d'origine du paragraphe du sujet, gardée pour être rendue telle quelle : la marge
 * resserrée est un style posé sur un élément de la PLATEFORME, et il doit pouvoir disparaître sans
 * trace (valeur vide quand le paragraphe n'en portait aucune). */
const HEADER_MARGIN_ATTR = 'data-cct-header-margin';

function setHeaderMargin(host: HTMLElement, value: string): void {
  if (!host.hasAttribute(HEADER_MARGIN_ATTR)) host.setAttribute(HEADER_MARGIN_ATTR, host.style.marginBottom);
  if (host.style.marginBottom !== value) host.style.marginBottom = value;
}

/** Rend leur marge d'origine aux paragraphes du sujet resserrés sous `root`, `root` compris. */
function releaseHeaderMargin(root: ParentNode): void {
  const marked = [...root.querySelectorAll(`[${HEADER_MARGIN_ATTR}]`)] as HTMLElement[];
  if (root instanceof Element && root.hasAttribute(HEADER_MARGIN_ATTR)) marked.push(root as HTMLElement);
  for (const host of marked) {
    host.style.marginBottom = host.getAttribute(HEADER_MARGIN_ATTR) ?? '';
    host.removeAttribute(HEADER_MARGIN_ATTR);
    if (host.getAttribute('style') === '') host.removeAttribute('style');
  }
}

/** Ce qu'il faut AJOUTER au-dessus de la mention pour qu'elle soit à un écart de paragraphe, et un
 * seul, du texte qui la précède, quelle que soit l'écriture (demande Reefact, #163) : l'écart
 * normal, moins celui qui existe déjà. La mention est le dernier enfant du corps ; ce qui la
 * précède, lignes masquées sautées, est :
 * - un bloc : sa marge existe déjà — l'écart entier d'ordinaire, un bloc n'étant plus le dernier ;
 * - du texte posé directement dans le corps : rien n'existe, l'écart entier ;
 * - rien : elle est seule dans le corps, rien au-dessus, rien à ajouter.
 * Un `padding-top`, posé par la feuille de style : une marge fusionnerait avec celle du bloc
 * précédent au lieu de s'y ajouter. Relu à chaque passage, sans sonde : la marge du bloc
 * précédent peut changer après coup (sujet resserré ou non), et l'écart doit la suivre. */
function sessionGap(body: Element, shown: Element, shape: RenderedBodyShape): string {
  const previous = significantSibling(shown, 'previousSibling');
  if (previous === null) return '0px';
  let existing = 0;
  if (previous.nodeType === 1) {
    const value = Number.parseFloat(body.ownerDocument.defaultView?.getComputedStyle(previous as Element).marginBottom ?? '');
    existing = Number.isFinite(value) ? value : 0;
  }
  const gap = paragraphGapPx(body, shape);
  if (gap === null) return existing > 0 ? '0px' : '1em';
  return cssLength(Math.max(0, gap - existing), 1);
}

/** Défait la projection : lignes d'origine rendues à leur place, mention retirée. */
function revealSession(root: ParentNode): void {
  for (const shown of [...root.querySelectorAll(`.${SESSION_CLASS}`)]) shown.remove();
  for (const hidden of [...root.querySelectorAll(`.${HIDDEN_SESSION_CLASS}`)]) unwrapInPlace(hidden);
  for (const block of [...root.querySelectorAll(`.${HIDDEN_SESSION_BLOCK_CLASS}`)]) {
    block.classList.remove(HIDDEN_SESSION_BLOCK_CLASS);
    if (block.classList.length === 0) block.removeAttribute('class');
  }
}

/** Les lignes masquées et la mention sont-elles DÉJÀ celles qu'il faut ? Mêmes lignes, dans le même
 * ordre, et la mention encore à sa place, dernier enfant significatif du corps. */
function sessionProjectionHolds(body: Element, marker: SessionMarker): boolean {
  const hidden = [...body.querySelectorAll(`.${HIDDEN_SESSION_CLASS}, .${HIDDEN_SESSION_BLOCK_CLASS}`)];
  if (hidden.length !== marker.lines.length) return false;
  if (hidden.some((h, i) => (h.textContent ?? '').trim() !== marker.lines[i]!.raw)) return false;
  const shown = body.querySelector(`:scope > .${SESSION_CLASS}`);
  if (shown === null) return false;
  for (let n = shown.nextSibling; n !== null; n = n.nextSibling) if (!isBlank(n)) return false;
  return true;
}

/** Pose, réentretient ou défait le masquage des lignes de marqueur (§5.5), et pose la mention.
 * `marker` à `null`, ou une forme de corps non mesurée : on défait — c'est ce qui rend le marqueur
 * à un corps qui n'en porte plus, et à une plateforme qui cesse de répondre. Idempotent.
 *
 * Appelée AVANT le masquage du préfixe : le sujet mis en avant et sa respiration se règlent sur
 * ce qui reste VISIBLE, lignes masquées sautées. L'écart de la mention, lui, se règle APRÈS
 * (`placeSessionGap`), sur les marges que ce masquage vient de fixer. */
function applySessionProjection(
  body: Element,
  marker: SessionMarker | null,
  config: EffectiveConfig,
  lang: string,
  shape: RenderedBodyShape | null
): void {
  if (marker === null || shape === null) {
    revealSession(body);
    return;
  }
  if (!sessionProjectionHolds(body, marker)) {
    revealSession(body); // marqueurs changés, ou affichage emporté par la plateforme : reconstruire
    const raws = new Set(marker.lines.map((line) => line.raw));
    const hits = markerHits(body, raws, shape);
    // Toutes les lignes, ou aucune : n'en masquer qu'une partie ferait mentir la mention.
    if (hits.length !== marker.lines.length || hits.some((hit, i) => hit.raw !== marker.lines[i]!.raw)) return;
    for (const hit of [...hits].reverse()) hideHit(hit);
    const created = globalThis.document.createElement('span');
    created.className = SESSION_CLASS;
    body.appendChild(created);
  }
  const shown = body.querySelector(`:scope > .${SESSION_CLASS}`) as HTMLElement;
  let text = shown.firstElementChild as HTMLElement | null;
  if (shown.childNodes.length !== 1 || text === null || !text.classList.contains(SESSION_TEXT_CLASS)) {
    text = globalThis.document.createElement('span');
    text.className = SESSION_TEXT_CLASS;
    shown.replaceChildren(text);
  }
  const expected = sessionText(marker, config);
  if (text.textContent !== expected) text.textContent = expected; // icône changée
  // Au survol : le doublon dit pourquoi aucune session n'est affichée — le diagnostic lui-même
  // n'est montré qu'à la saisie, avec les autres (§5.3) —, un marqueur seul montre sa
  // description, telle qu'écrite (§3.6).
  const title =
    marker.value === null
      ? t(lang, 'diag.W-SESSION-MULTIPLE', { count: marker.lines.length })
      : (marker.description ?? '');
  if (title === '') text.removeAttribute('title');
  else if (text.title !== title) text.title = title;
}

/** Règle l'écart au-dessus de la mention, une fois les marges du corps fixées. */
function placeSessionGap(body: Element, shape: RenderedBodyShape | null): void {
  const shown = body.querySelector(`:scope > .${SESSION_CLASS}`) as HTMLElement | null;
  if (shown === null || shape === null) return;
  const gap = sessionGap(body, shown, shape);
  if (shown.style.getPropertyValue(SESSION_GAP_VAR) !== gap) shown.style.setProperty(SESSION_GAP_VAR, gap);
}

export function decorateComment(
  commentBodyElement: Element,
  bodyText: string,
  config: EffectiveConfig,
  platform: PlatformProfile,
  lang: string,
  /** La forme du HTML rendu par la plateforme (§5.5), ou `null` si elle n'a pas été MESURÉE.
   *
   * OBLIGATOIRE, et le défaut nommé qui vivait ici a été retiré. Il se justifiait par les
   * appels de TEST qui ne s'intéressent pas au sujet — plus de cent —, ce qui oubliait à qui
   * d'autre profite un défaut : un futur appel de PRODUCTION omettant de consulter
   * l'adaptateur compilait, et recevait `<p>` / `<br>`. L'hypothèse GitHub que cette PR sort
   * du code partagé rentrait par la porte laissée ouverte au bout du chemin (revue Reefact,
   * PR #66). Le compilateur pose maintenant la question à l'appelant, comme le contrat la pose
   * à l'adaptateur.
   *
   * Les tests qui ne portent pas sur la forme passent par `test/helpers/decorate.ts` : le
   * raccourci existe toujours, mais il vit du côté des tests, où son coût est une ligne. */
  rawShape: RenderedBodyShape | null
): void {
  // Normalisé ICI, à l'entrée unique du module, et pas aux trois comparaisons qui l'emploient :
  // une normalisation répartie s'oublie au quatrième site. `tagName` rend `P` en HTML, un
  // adaptateur peut légitimement écrire `'p'` (revue Reefact, PR #65).
  const shape = rawShape === null ? null : normalizeBodyShape(rawShape);
  const a = analyze(
    {
      body: bodyText,
      platform,
      isSystemGenerated: false,
      zone: 'thread-root',
      canCarryBlockingState: true,
    },
    config
  );
  // Calculé AVANT le retour anticipé sur `!a.resolved` : `isLosslessBadgeProjection()` (ci-
  // dessous) a besoin de `shown` pour savoir ce qui sera VISIBLE PAR SON NOM, que le label soit
  // résolu ou non ne change rien à cette question — un tableau vide quand il ne l'est pas.
  const { shown, hiddenDescriptive } = a.resolved
    ? selectDecorationsForRender(a.decorations)
    : { shown: [] as ResolvedDecoration[], hiddenDescriptive: 0 };
  // Masquer n'est correct que si CETTE projection est sans perte (revue Reefact, PR #40) : une
  // décoration syntaxiquement valide mais REJETÉE (E-UNKNOWN-DECORATION), ou repliée dans le
  // badge « +N » au-delà de MAX_RENDERED_DECORATIONS, ne doit jamais disparaître à la fois du
  // texte ET des badges — ce serait perdre l'information, pas seulement la déplacer.
  const canHidePrefix =
    a.resolved !== null && a.prefixLine !== null && isLosslessBadgeProjection(a.prefixLine, shown, a.diagnostics);
  // Inconditionnel, AVANT tout retour anticipé — chemin rapide compris (revue Reefact, PR #40) :
  // une réhydratation de plateforme peut remplacer le sous-arbre de texte natif (et donc effacer
  // le wrapper `.cct-hidden-prefix`) sans toucher aux badges CCT, restés en place à côté — même
  // risque que celui déjà pris en compte pour les badges de décoration eux-mêmes (revue Codex,
  // PR #38). Un simple retour sur signature/compte inchangés laisserait alors le préfixe
  // réapparu tel quel. Idempotent (firstTextNode ignore les `.cct-badge` déjà posés, encore
  // présents ici), donc gratuit quand rien n'a bougé.
  // `shape === null` : la plateforme n'a pas MESURÉ la forme de son corps rendu (§9.2.3). Le
  // masquage du préfixe et la mise en avant du sujet renoncent alors entièrement — c'est le seul
  // repli honnête : deviner quelle balise borne une ligne, c'est risquer de faire glisser une
  // partie de la discussion dans le sujet mis en avant. Les badges, eux, sont posés plus bas :
  // ils ne dépendent d'aucune de ces deux balises, et le corps s'affiche entier.
  //
  // Ce renoncement n'est PAS une dégradation de sélecteur, et rien n'est journalisé ici. Le §9.4
  // trace un ÉCHEC DE DÉTECTION — un sélecteur qu'on croyait bon ne ramène plus rien ; ici la
  // plateforme a répondu, et sa réponse est qu'elle ne sait pas. Confondre les deux mettrait une
  // plateforme entière en échec permanent et écrirait une entrée par commentaire rendu, à chaque
  // mutation de la page, noyant les vraies dégradations — c'est le défaut déjà payé sur
  // `merge-button`. Le commentaire d'ici a d'abord dit le contraire (revue Reefact, PR #65).
  //
  // `masking` à `null`, et un APPEL quand même — jamais un simple saut : c'est ce `null` qui
  // DÉFAIT un masquage antérieur. Sans cet appel, une plateforme passant de « mesurée » à
  // « inconnue » (configuration, mise à jour) laisserait en place un préfixe masqué que plus
  // rien n'entretient.
  //
  // Le couple `{ prefixLine, shape }` plutôt que deux arguments : masquer exige les deux,
  // défaire n'exige ni l'un ni l'autre. Séparés, le cas « je renonce » devait tout de même
  // produire une forme, et il y passait la forme Markdown — inutilisée, mais écrite.
  const masking =
    shape !== null && canHidePrefix && a.prefixLine !== null ? { prefixLine: a.prefixLine, shape } : null;
  // Le marqueur de session est une métadonnée, affichée quel que soit le verdict — y compris sur
  // un commentaire sans label résolu, d'où sa place AVANT le retour anticipé ci-dessous. Ses
  // lignes sont masquées AVANT le préfixe, qui se règle sur ce qui reste visible ; l'écart de la
  // mention APRÈS, sur les marges que le préfixe vient de fixer.
  applySessionProjection(commentBodyElement, a.session, config, lang, shape);
  applyPrefixVisibility(commentBodyElement, masking, bodyText);
  placeSessionGap(commentBodyElement, shape);
  // Où poser les badges — LU dans le DOM que la ligne ci-dessus vient d'établir, jamais déduit
  // de `canHidePrefix` seul, qui dit ce qu'on VOULAIT faire, pas ce qui a été fait (les replis
  // de `applyPrefixVisibility` renoncent sans le dire à l'appelant). Préfixe masqué → l'élément
  // qui le porte : le `<p>` de la première ligne, ou le corps lui-même quand son texte y vit
  // sans paragraphe. Les badges y sont alors en flux INLINE avec le sujet mis en gras, donc sur
  // SA ligne, à sa gauche. Masquage refusé (§9.4) → en tête du corps, au-dessus du texte, comme
  // avant : sans frontière de préfixe fiable, il n'y a pas non plus de sujet à border.
  // Les badges suivent le SUJET, pas le préfixe masqué : c'est sa ligne qu'ils rejoignent. Les
  // deux coïncident presque toujours — le wrapper naît juste après le masquage, dans le même
  // parent —, sauf quand `subjectNodes()` renonce (borne de ligne interne à un frère, sujet
  // vide). Se régler sur le préfixe y poserait les badges en flux inline devant un sujet qui
  // n'a pas été mis en avant : la moitié d'un agencement, jamais demandée.
  const subject = commentBodyElement.querySelector(`.${SUBJECT_CLASS}`);
  const host = subject?.parentElement ?? commentBodyElement;
  // Les DEUX emplacements, jamais le seul emplacement courant : quand le masquage vient de
  // disparaître, les badges du rendu précédent sont restés dans le `<p>` que `host` ne désigne
  // plus, et un balayage limité à `host` les y laisserait orphelins — un badge décrivant un état
  // qui n'existe plus, survivant au changement même qui l'a aboli. `OWN_BADGES` est celui-là
  // même que `commentBodyText()` exclut de la relecture (adapter-shared) : les deux fonctions
  // doivent parler du MÊME ensemble de nœuds, sous peine qu'un badge compte comme du corps.
  const stale = [...commentBodyElement.querySelectorAll(OWN_BADGES)] as HTMLElement[];
  if (!a.resolved) {
    // Un changement de configuration a pu rendre ce commentaire non résolu (label
    // désactivé, par exemple) : un badge qui décrivait un état qui n'existe plus ne doit
    // pas survivre à ce changement, même si aucun nouveau badge ne le remplace.
    for (const badge of stale) badge.remove();
    return;
  }
  const signature = badgeSignature({ ...a, resolved: a.resolved }, shown, hiddenDescriptive, config, lang);
  // Compte attendu SANS construire les badges : decorateComment() tourne pour CHAQUE
  // commentaire à CHAQUE passage de rendu, y compris ceux déjà à jour — leur bâtir jusqu'à
  // 13 éléments DOM détachés avant de les jeter aussitôt serait un coût réel sur une PR à
  // beaucoup de commentaires (revue Codex, PR #38). decorationBadges() n'est appelée que
  // dans la branche qui écrit réellement dans le DOM, ci-dessous.
  const expectedCount = shown.length + (hiddenDescriptive > 0 ? 1 : 0);
  // La signature seule ne suffit pas : elle n'est portée QUE par le badge de label (stale[0]),
  // donc une réhydratation de plateforme qui efface un badge de DÉCORATION sans toucher au
  // label laisserait stale[0] intact et ce court-circuit renoncerait à réparer le manquant
  // (revue Codex, PR #38). Le compte de badges effectivement présents doit donc correspondre
  // à ce que CE rendu produirait, pas seulement la signature du premier.
  // `parentElement === host` en plus de la signature et du compte : le masquage du préfixe a pu
  // apparaître ou disparaître sous des badges par ailleurs identiques (label et décorations
  // inchangés, seule une décoration REJETÉE ou un W-CASE ayant basculé, §5.5) — les badges sont
  // alors au bon nombre, à la bonne signature, et au MAUVAIS endroit.
  if (
    stale.length === 1 + expectedCount &&
    stale[0]?.parentElement === host &&
    stale[0]?.dataset['cctSig'] === signature
  ) {
    return; // inchangé — aucune écriture DOM de badge ; le préfixe a déjà été réentretenu plus haut
  }

  const badge = labelBadge(a.resolved.label, config, lang);
  badge.dataset['blocking'] = a.blocking ? 'true' : 'false';
  badge.dataset['cctSig'] = signature;
  for (const old of stale) old.remove();
  // prepend() insère tous les badges en une fois, dans l'ordre donné (label, puis les
  // décorations dans l'ordre d'écriture) — contrairement à insertAdjacentElement('afterbegin'),
  // répété, qui les aurait posés en ordre inverse.
  // MARQUER l'hôte quand ce n'est pas le corps lui-même : `OWN_BADGES` (adapter-shared) s'y
  // règle pour retrouver ces badges à la relecture. Sans cette marque il cherchait sous un
  // `<p>`, ce qui cessait d'être vrai dès qu'une plateforme déclarait un autre conteneur de
  // paragraphe (`renderedBodyShape()`). Retirée par `clearCommentDecorations`.
  if (host !== commentBodyElement) host.classList.add(BADGE_HOST_CLASS);
  host.prepend(badge, ...decorationBadges(shown, hiddenDescriptive, config, lang));
}
