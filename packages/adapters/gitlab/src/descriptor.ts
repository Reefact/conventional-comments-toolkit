// Fiche d'identité de GitLab (§9.2.3, `PlatformDescriptor`) — SANS DOM : le service worker et la
// page d'options l'importent par le sous-chemin `@cct/adapter-gitlab/descriptor`, sans embarquer
// l'adaptateur. Chaque valeur dit ce qui est mesuré (annexe C) ; ce qui ne l'est pas prend la
// réponse prudente du contrat, jamais une supposition.

import type { PlatformDescriptor } from '@cct/adapter-shared';

export const gitlabDescriptor = {
  id: 'gitlab',
  // `gitlab.com` est un hôte FIXE — le groupe et le projet vivent dans le chemin (§C.4) : il va au
  // catalogue. GitLab Dedicated a un hôte par client, dont la forme n'est pas mesurée (§C.1), et
  // un Self-Managed un domaine interne : l'un comme l'autre se saisissent, plateforme choisie.
  cloud: { origin: 'https://gitlab.com/*', label: 'GitLab.com' },
  // Seul l'hôte mesuré. Un motif du genre « commence par gitlab. » attraperait beaucoup
  // d'instances Self-Managed — et tout autre site qui suit la même convention : une supposition.
  inferHost: (host: string) => host === 'gitlab.com',
  // Aucune règle mesurée sur la lecture de configuration (§C.4) : la règle commune s'applique.
  configCredentials: () => null,
  // Les vues d'une merge request se distinguent par le CHEMIN — `/-/merge_requests/<n>` pour
  // l'Overview, `/-/merge_requests/<n>/diffs` pour Changes (URLs des captures) —, pas par un
  // paramètre de requête. Le choix Rapid Diffs / vue classique est une préférence mémorisée,
  // pas un paramètre d'URL (mesuré : même URL dans les deux vues).
  viewParams: [],
  // Pas de logo dessiné de mémoire, comme pour Azure DevOps : un caractère neutre plutôt qu'un
  // tracé approximatif de la marque.
  glyph: { text: 'GL' },
} as const satisfies PlatformDescriptor;
