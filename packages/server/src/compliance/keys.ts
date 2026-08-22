import type { PrRef } from '@cct/core';

/** Clé stable d'un dépôt : plateforme, hôte, portée. */
export function repoKey(ref: { platform: string; host: string; scope: string[] }): string {
  return `${ref.platform}:${ref.host}:${ref.scope.join('/')}`;
}

/** Clé stable d'une PR. */
export function prKey(pr: PrRef): string {
  return `${repoKey(pr)}#${pr.number}`;
}
