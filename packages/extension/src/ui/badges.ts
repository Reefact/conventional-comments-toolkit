// Badges des commentaires publiés (§5.5) : rendu visuel du label puis, à sa droite, un badge
// par décoration résolue (§3.3) — sans jamais modifier le contenu stocké côté serveur.
//
// Rafraîchi sur changement de config, sans churn DOM sur un rendu inchangé : content-
// internal.ts appelle decorateComment() sur CHAQUE commentaire à CHAQUE passage de rendu
// (mutation observée), donc à chaque frappe ailleurs sur la page. Un signal comparable —
// pas fingerprint() de @cct/core, qui exclut délibérément badgeStyle/labels[].color de son
// domaine (§9.2.2 : seules les clés qui gouvernent le VERDICT, cosmétiques exclues) — est
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
} from '@cct/core';
import { ui } from './strings.js';

function labelBadge(label: { icon?: string; id: string; color?: string }, config: EffectiveConfig): HTMLElement {
  const badge = globalThis.document.createElement('span');
  badge.className = `cct-badge cct-badge-label cct-badge-${config.badgeStyle}`;
  badge.textContent = `${label.icon ?? ''} ${label.id}`.trim();
  if (label.color) badge.style.setProperty('--cct-label-color', label.color);
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

/** Tout ce qui détermine l'APPARENCE des badges d'un commentaire résolu — pas les mêmes
 * clés que fingerprint() (§9.2.2), qui répond à une question différente (deux composants
 * s'accordent-ils sur le VERDICT ?) et exclut pour cette raison badgeStyle/labels[].color/
 * icon. Deux appels avec la même signature doivent produire des badges identiques ; deux
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
    label: { id: a.resolved.label.id, icon: a.resolved.label.icon ?? null, color: a.resolved.label.color ?? null },
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

/** Tags correspondant à un CONSTRUCT DE BLOC Markdown, OU À UN ÉLÉMENT HTML BRUT documenté
 * comme syntaxe de commentaire valide par GitHub, dont la syntaxe de tête ne survit pas dans
 * le texte RENDU — pas seulement le bloc de code et la citation : une liste (`- x` / `1. x` →
 * `<li>`, puce/numéro perdu), un titre (`# x` → `<h1>`, dièse perdu) et une section repliable
 * (`<details>\n<summary>x</summary>...`, balises perdues) suivent exactement le même
 * mécanisme (revue Reefact, PR #40 — `- issue: fake` rendu en `<ul><li>issue: fake</li></ul>`
 * faisait masquer `issue: ` DANS l'élément de liste). Un tableau GFM (`| issue: fake |`) suit
 * le même principe, le `|` disparaissant de même.
 *
 * PAS un ensemble fermé pour autant (revue Reefact, PR #40 — corrigeant une affirmation trop
 * forte tenue ici même) : GitHub accepte du HTML brut sanitisé au milieu du Markdown, un
 * espace que cette énumération ne peut jamais clore complètement — `DETAILS`/`SUMMARY` en est
 * un exemple documenté, pas la preuve que la liste couvre désormais tout ce que GitHub
 * autorise. `UL`/`OL`/`TABLE` arrêtent la recherche au même titre que `LI` (ou une cellule)
 * qu'ils contiennent : aucun texte n'est jamais un enfant DIRECT du groupe, seul le point
 * d'arrêt le plus tôt rencontré importe — inutile d'énumérer aussi `TR`/`TD`/`TH`/`THEAD`/
 * `TBODY`.
 *
 * Une limite RESTE hors de portée de toute liste de tags, aussi complète soit-elle : une
 * ligne Markdown qui ne produit AUCUN nœud dans le rendu (définition de référence de lien
 * `[ref]: /url`, commentaire HTML `<!-- ... -->`) ne laisse tout simplement rien à intercepter
 * — voir la note de `firstTextNode()` à ce sujet, ce n'est pas un défaut de CETTE liste mais
 * une limite structurelle de toute analyse fondée sur le DOM rendu (comme l'angle mort de
 * `analyze()` sur un bloc de code sans fences, déjà noté plus haut — préexistant, hors
 * périmètre du masquage lui-même). */
const LOST_MARKER_TAGS = new Set([
  'PRE',
  'CODE',
  'BLOCKQUOTE',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TABLE',
  'DETAILS',
  'SUMMARY',
]);

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
 * chez un frère suivant) dès qu'un élément de `LOST_MARKER_TAGS` se présente avant tout texte
 * significatif (revue Reefact, PR #40) : `bodyText` vient de `commentBodyText()`, donc du DOM
 * RENDU, où la syntaxe de tête de ces constructs de bloc — ```` ``` ````/`~~~`/retrait de 4
 * espaces d'un bloc de code, `>` d'une citation, puce/numéro d'une liste, `#` d'un titre, `|`
 * d'un tableau — n'existe plus. `analyze()` peut alors traiter à tort ce contenu comme la
 * ligne de préfixe, alors que la même ligne, lue sur la source BRUTE, ne commence jamais par
 * une lettre ou un émoji et ne matcherait donc jamais `matchPrefix()`. Continuer la recherche
 * au-delà risquerait de masquer un fragment sans rapport qui commencerait, par coïncidence, de
 * la même façon ; s'arrêter net évite en plus, et surtout, d'écrire quoi que ce soit DANS l'un
 * de ces constructs affiché.
 *
 * `isRoot` excepte uniquement l'appel de DÉPART de cette vérification : c'est le conteneur de
 * commentaire de la PLATEFORME (`.comment-body`, un `<td>` sur GitHub réel), jamais lui-même
 * un construct Markdown rendu — le soumettre à la même règle romprait la recherche pour
 * CHAQUE commentaire le jour où son tag coïnciderait avec l'un de `LOST_MARKER_TAGS` (c'est
 * déjà le cas de `<td>`, si une cellule de tableau y figurait un jour). */
function firstTextNode(node: Node, isRoot = true): Text | typeof ABORT | null {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    return (node as Text).data.trim().length > 0 ? (node as Text) : null;
  }
  if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
    const element = node as Element;
    if (element.classList.contains('cct-badge')) return null;
    if (!isRoot && LOST_MARKER_TAGS.has(element.tagName)) return ABORT;
  }
  for (const child of node.childNodes) {
    const found = firstTextNode(child, false);
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
function applyPrefixVisibility(commentBodyElement: Element, prefixLine: string | null, bodyText: string): void {
  const existing = commentBodyElement.querySelector('.cct-hidden-prefix');
  if (prefixLine === null) {
    if (existing) {
      existing.replaceWith(globalThis.document.createTextNode(existing.textContent ?? ''));
      commentBodyElement.normalize();
    }
    return;
  }
  if (existing) return;
  const first = firstTextNode(commentBodyElement);
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
}

export function decorateComment(
  commentBodyElement: Element,
  bodyText: string,
  config: EffectiveConfig,
  platform: PlatformProfile,
  lang: string
): void {
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
  const stale = [...commentBodyElement.querySelectorAll(':scope > .cct-badge')] as HTMLElement[];
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
  applyPrefixVisibility(commentBodyElement, canHidePrefix ? a.prefixLine : null, bodyText);
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
  if (stale.length === 1 + expectedCount && stale[0]?.dataset['cctSig'] === signature) {
    return; // inchangé — aucune écriture DOM de badge ; le préfixe a déjà été réentretenu plus haut
  }

  const badge = labelBadge(a.resolved.label, config);
  badge.dataset['blocking'] = a.blocking ? 'true' : 'false';
  badge.dataset['cctSig'] = signature;
  for (const old of stale) old.remove();
  // prepend() insère tous les badges en une fois, dans l'ordre donné (label, puis les
  // décorations dans l'ordre d'écriture) — contrairement à insertAdjacentElement('afterbegin'),
  // répété, qui les aurait posés en ordre inverse.
  commentBodyElement.prepend(badge, ...decorationBadges(shown, hiddenDescriptive, config, lang));
}
