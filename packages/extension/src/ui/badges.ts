// Badges des commentaires publiés (§5.5) : rendu visuel du label puis, à sa droite, un badge
// par décoration résolue (§3.3) — sans jamais modifier le contenu stocké côté serveur.

import { analyze, type EffectiveConfig, type PlatformProfile, type ResolvedDecoration } from '@cct/core';

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

export function decorateComment(
  commentBodyElement: Element,
  bodyText: string,
  config: EffectiveConfig,
  platform: PlatformProfile
): void {
  if (commentBodyElement.querySelector('.cct-badge')) return; // idempotent
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
  if (!a.resolved) return;
  const badge = labelBadge(a.resolved.label, config);
  badge.dataset['blocking'] = a.blocking ? 'true' : 'false';
  // prepend() insère tous les badges en une fois, dans l'ordre donné (label, puis les
  // décorations dans l'ordre d'écriture) — contrairement à insertAdjacentElement('afterbegin'),
  // répété, qui les aurait posés en ordre inverse.
  commentBodyElement.prepend(badge, ...a.decorations.map((d) => decorationBadge(d, config)));
}
