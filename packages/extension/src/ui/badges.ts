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
  type CommentAnalysis,
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

/** Repère la fin du préfixe structuré dans `rawLine` — un texte dont on n'est pas encore
 * certain qu'il correspond bien à la ligne que `analyze()` a reconnue, d'où la première
 * vérification. `prefixLine` est la ligne normalisée (§3.4.1, étapes 4-6) que porte déjà
 * `CommentAnalysis` ; retrouver la même frontière dans `rawLine` demande de défaire seulement
 * ce que la normalisation fait réellement : (a) retirer un bandeau d'espaces/BOM en bord de
 * ligne, (b) remplacer un à un chaque caractère d'espacement Unicode par un espace ordinaire
 * — jamais fusionné, jamais scindé, donc sans effet sur la position d'un caractère qui suit.
 * Un BOM interne (seul cas qui changerait la longueur ailleurs qu'en bord de ligne) fait
 * renoncer plutôt que risquer de masquer la mauvaise frontière. */
function hiddenPrefixEnd(rawLine: string, prefixLine: string): number | null {
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
  // Seule la portion structurée (`label (décorations): `), jamais la ligne entière : le SUJET
  // qui la suit peut être scindé sur un autre nœud DOM par la moindre mise en forme inline
  // (code, lien, gras, mention, référence…) — cas courant (revue Reefact, PR #40) — auquel cas
  // `rawLine` s'arrête net à la fin du préfixe, plus court que la ligne normalisée complète.
  const expectedPrefix = prefixLine.slice(0, normalizedEnd);
  // `rawLine` doit CORRESPONDRE à ce préfixe, pas seulement le contenir par coïncidence : sans
  // ce garde, un texte de tête sans rapport (bloc de code écarté par §3.4.1 étape 2, contenu
  // d'un élément imbriqué que le premier nœud de texte ne représente pas fidèlement) où le
  // label apparaîtrait par hasard produirait une frontière calculée sur du texte qui n'est pas
  // le préfixe. Les deux sens de `startsWith` couvrent : (a) le sujet continue dans CE nœud —
  // son normalisé est alors plus LONG que `expectedPrefix` ; (b) `rawLine` s'arrête pile à la
  // fin du préfixe — son bord de fin est alors rogné par le trim de `normalizePrefixLine`, donc
  // plus COURT que `expectedPrefix`.
  const normalizedRawLine = normalizePrefixLine(rawLine);
  if (!normalizedRawLine.startsWith(expectedPrefix) && !expectedPrefix.startsWith(normalizedRawLine)) return null;
  const leadingStrip = rawLine.length - rawLine.replace(/^[\p{White_Space}\uFEFF]+/u, '').length;
  const rawEnd = leadingStrip + expectedPrefix.length;
  if (rawEnd > rawLine.length || rawLine.slice(0, rawEnd).includes('\uFEFF')) return null;
  return rawEnd;
}

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
 * réel du commentaire. */
function firstTextNode(node: Node): Text | null {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    return (node as Text).data.trim().length > 0 ? (node as Text) : null;
  }
  if (node.nodeType === 1 /* Node.ELEMENT_NODE */ && (node as Element).classList.contains('cct-badge')) {
    return null;
  }
  for (const child of node.childNodes) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
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
  if (!first) return;
  const end = hiddenPrefixEnd(first.data, prefixLine);
  if (end === null) return;
  const trimmedHidden = first.data.slice(0, end).trim();
  const trimmedBody = bodyText.trim();
  // Ne jamais masquer la totalité du contenu visible d'un commentaire (sujet vide, aucune
  // autre ligne) : le lecteur verrait une bulle sans aucun texte, alors que rien n'empêche de
  // publier "issue:" seul (§3.5 signale E-EMPTY-SUBJECT, mais ne bloque pas la publication).
  // `startsWith`, pas une simple comparaison de longueur : une incohérence entre `first.data`
  // et `bodyText` (qui ne devrait plus se produire, mais que ce garde coûte peu à vérifier)
  // doit renoncer plutôt que masquer un fragment qui ne commence pas vraiment le commentaire.
  if (!trimmedBody.startsWith(trimmedHidden) || trimmedBody.slice(trimmedHidden.length).trim() === '') return;
  first.splitText(end); // `first` ne garde que le préfixe ; la suite devient un nœud frère, déjà en place
  const hidden = globalThis.document.createElement('span');
  hidden.className = 'cct-hidden-prefix';
  first.replaceWith(hidden);
  hidden.appendChild(first);
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
  // Inconditionnel, AVANT tout retour anticipé — chemin rapide compris (revue Reefact, PR #40) :
  // une réhydratation de plateforme peut remplacer le sous-arbre de texte natif (et donc effacer
  // le wrapper `.cct-hidden-prefix`) sans toucher aux badges CCT, restés en place à côté — même
  // risque que celui déjà pris en compte pour les badges de décoration eux-mêmes (revue Codex,
  // PR #38). Un simple retour sur signature/compte inchangés laisserait alors le préfixe
  // réapparu tel quel. Idempotent (firstTextNode ignore les `.cct-badge` déjà posés, encore
  // présents ici), donc gratuit quand rien n'a bougé.
  applyPrefixVisibility(commentBodyElement, a.resolved ? a.prefixLine : null, bodyText);
  if (!a.resolved) {
    // Un changement de configuration a pu rendre ce commentaire non résolu (label
    // désactivé, par exemple) : un badge qui décrivait un état qui n'existe plus ne doit
    // pas survivre à ce changement, même si aucun nouveau badge ne le remplace.
    for (const badge of stale) badge.remove();
    return;
  }
  const { shown, hiddenDescriptive } = selectDecorationsForRender(a.decorations);
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
