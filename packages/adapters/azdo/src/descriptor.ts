// Fiche d'identité d'Azure DevOps (§9.2.3, `PlatformDescriptor`) — SANS DOM : le service worker
// et la page d'options l'importent par le sous-chemin `@cct/adapter-azdo/descriptor`, sans
// embarquer l'adaptateur. Ce qui y figure vivait dans le code partagé de l'extension : suffixes
// d'hôte dans `host-platform.ts`, paramètre de vue dans `page-mark.ts`, glyphe dans la page
// d'options.

import type { PlatformDescriptor } from '@cct/adapter-shared';

export const azdoDescriptor = {
  id: 'azdo',
  // `dev.azure.com` est un hôte FIXE — l'organisation vit dans le chemin (§B.4). Une
  // organisation historique `{org}.visualstudio.com`, elle, se saisit : la mettre au catalogue
  // demanderait l'accès à toutes les organisations à la fois.
  cloud: { origin: 'https://dev.azure.com/*', label: 'Azure DevOps Services' },
  inferHost: (host: string) => host === 'dev.azure.com' || host.endsWith('.visualstudio.com'),
  // Aucune règle mesurée : la règle commune (`include`) s'applique.
  configCredentials: () => null,
  // `?_a=files` et `?_a=overview` sont deux écrans d'une même PR, deux DOM (revue Reefact, PR #70).
  viewParams: ['_a'],
  // Pas de logo dessiné de mémoire : leur marque EST un infini stylisé, et un caractère neutre
  // vaut mieux qu'un tracé approximatif.
  glyph: { text: '∞' },
} as const satisfies PlatformDescriptor;
