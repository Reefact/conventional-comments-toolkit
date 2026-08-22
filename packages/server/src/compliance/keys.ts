import type { PrRef } from '@cct/core';

/** Clé stable d'un dépôt : plateforme, hôte, portée. */
export function repoKey(ref: { platform: string; host: string; scope: string[] }): string {
  return `${ref.platform}:${ref.host}:${ref.scope.join('/')}`;
}

/** Clé stable d'une PR. */
export function prKey(pr: PrRef): string {
  return `${repoKey(pr)}#${pr.number}`;
}

/** Alias de chemin d'une PR, sans hôte — celui que la page de statut (§6.3.1) peut
 * reconstruire depuis sa seule URL. */
export function prPathAlias(pr: PrRef): string {
  return `${pr.platform}/${pr.scope.join('/')}#${pr.number}`;
}
