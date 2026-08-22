// Badges des commentaires publiés (§5.5) : rendu visuel du label, sans jamais modifier
// le contenu stocké côté serveur.

import { analyze, type EffectiveConfig, type PlatformProfile } from '@cct/core';

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
  const label = a.resolved.label;
  const badge = globalThis.document.createElement('span');
  badge.className = `cct-badge cct-badge-${config.badgeStyle}`;
  badge.textContent = `${label.icon ?? ''} ${label.id}`.trim();
  if (label.color) badge.style.setProperty('--cct-label-color', label.color);
  badge.dataset['blocking'] = a.blocking ? 'true' : 'false';
  commentBodyElement.insertAdjacentElement('afterbegin', badge);
}
