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

import { analyze, type CommentAnalysis, type EffectiveConfig, type PlatformProfile, type ResolvedDecoration } from '@cct/core';
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

/** Badges de décoration à poser. Seules les décorations DESCRIPTIVES (`forces: null`) sont
 * repliées au-delà de MAX_RENDERED_DECORATIONS — jamais une porteuse (`blocking`/
 * `non-blocking`) : son nombre est borné par la configuration (`decorations.known`, que
 * l'auteur du commentaire ne contrôle pas), jamais par un préfixe adversarial, et la replier
 * dans un badge « +N » sans couleur effacerait le seul signal que les badges existent pour
 * porter — le caractère bloquant (revue Codex, PR #38). L'ordre d'écriture est conservé
 * parmi les entrées gardées ; seules des descriptives EN EXCÈS sont retirées. */
function decorationBadges(decorations: ResolvedDecoration[], config: EffectiveConfig, lang: string): HTMLElement[] {
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
  const badges = shown.map((d) => decorationBadge(d, config));
  if (hiddenDescriptive > 0) badges.push(overflowBadge(hiddenDescriptive, config, lang));
  return badges;
}

/** Tout ce qui détermine l'APPARENCE des badges d'un commentaire résolu — pas les mêmes
 * clés que fingerprint() (§9.2.2), qui répond à une question différente (deux composants
 * s'accordent-ils sur le VERDICT ?) et exclut pour cette raison badgeStyle/labels[].color/
 * icon. Deux appels avec la même signature doivent produire des badges identiques ; deux
 * appels avec une signature différente peuvent en produire des différents. */
function badgeSignature(
  a: CommentAnalysis & { resolved: NonNullable<CommentAnalysis['resolved']> },
  config: EffectiveConfig,
  lang: string
): string {
  return JSON.stringify({
    style: config.badgeStyle,
    label: { id: a.resolved.label.id, icon: a.resolved.label.icon ?? null, color: a.resolved.label.color ?? null },
    blocking: a.blocking,
    decorations: a.decorations,
    // Le badge de dépassement porte une infobulle localisée (ui()) : un changement de
    // langue en direct doit la rafraîchir comme n'importe quel autre changement d'apparence.
    lang,
  });
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
  if (!a.resolved) {
    // Un changement de configuration a pu rendre ce commentaire non résolu (label
    // désactivé, par exemple) : un badge qui décrivait un état qui n'existe plus ne doit
    // pas survivre à ce changement, même si aucun nouveau badge ne le remplace.
    for (const badge of stale) badge.remove();
    return;
  }
  const signature = badgeSignature({ ...a, resolved: a.resolved }, config, lang);
  const decoBadges = decorationBadges(a.decorations, config, lang);
  // La signature seule ne suffit pas : elle n'est portée QUE par le badge de label (stale[0]),
  // donc une réhydratation de plateforme qui efface un badge de DÉCORATION sans toucher au
  // label laisserait stale[0] intact et ce court-circuit renoncerait à réparer le manquant
  // (revue Codex, PR #38). Le compte de badges effectivement présents doit donc correspondre
  // à ce que CE rendu produirait, pas seulement la signature du premier.
  if (stale.length === 1 + decoBadges.length && stale[0]?.dataset['cctSig'] === signature) {
    return; // inchangé — aucune écriture DOM
  }

  const badge = labelBadge(a.resolved.label, config);
  badge.dataset['blocking'] = a.blocking ? 'true' : 'false';
  badge.dataset['cctSig'] = signature;
  for (const old of stale) old.remove();
  // prepend() insère tous les badges en une fois, dans l'ordre donné (label, puis les
  // décorations dans l'ordre d'écriture) — contrairement à insertAdjacentElement('afterbegin'),
  // répété, qui les aurait posés en ordre inverse.
  commentBodyElement.prepend(badge, ...decoBadges);
}
