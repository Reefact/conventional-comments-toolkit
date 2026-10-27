// Fiche d'identité de GitHub (§9.2.3, `PlatformDescriptor`) — SANS DOM : le service worker et la
// page d'options l'importent par le sous-chemin `@cct/adapter-github/descriptor`, sans embarquer
// l'adaptateur. Ce qui y figure vivait dans le code partagé de l'extension : suffixes d'hôte dans
// `host-platform.ts`, règle de `credentials` importée par le service worker depuis l'adaptateur,
// tracé du logo dans la page d'options.

import type { PlatformDescriptor } from '@cct/adapter-shared';

/** `credentials` d'une lecture de configuration — décidé PAR URL, et non une fois pour toutes.
 *
 * La route `raw` de github.com redirige vers `raw.githubusercontent.com` dès que le fichier
 * existe, cette origine répond `Access-Control-Allow-Origin: *`, et le navigateur refuse le
 * joker quand la requête porte des cookies. `include` y échoue donc toujours.
 *
 * `'same-origin'` plutôt que `'omit'`, et la différence n'est pas cosmétique — elle est
 * MESURÉE (`npm run check:content-script-cors`) : le PREMIER saut, de même origine que la
 * page, part AVEC la session, donc GitHub autorise ; la redirection franchit une origine, le
 * navigateur cesse alors d'envoyer les cookies, et le joker est accepté. La configuration
 * d'un dépôt PRIVÉ redevient ainsi lisible, sans permission d'hôte et sans relais — ce que
 * `'omit'`, écrit d'abord ici, sacrifiait sans rien obtenir en échange (revue Codex, PR #36,
 * round 4).
 *
 * Partout ailleurs, `include` reste la règle, et l'absence de mesure est ici l'argument, pas
 * une négligence : sur un GitHub Enterprise Server, nous n'avons
 * PAS observé de redirection hors origine. Le défaut se corrige là où il est démontré,
 * nulle part ailleurs. */
export function configCredentials(url: string): RequestCredentials {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'include';
  }
  // Hôte ET chemin : sur github.com, seule la route `raw` redirige. Une autre URL du même
  // domaine (page HTML, route d'API) n'a aucune raison de perdre sa session.
  return parsed.hostname === 'github.com' && parsed.pathname.includes('/raw/')
    ? 'same-origin'
    : 'include';
}

/** La route `raw` de github.com, et elle seule, porte une règle mesurée : voir
 * `configCredentials()` ci-dessus. Partout ailleurs, la plateforme ne se prononce pas. */
function rawRouteCredentials(url: string): RequestCredentials | null {
  const credentials = configCredentials(url);
  return credentials === 'include' ? null : credentials;
}

export const githubDescriptor = {
  id: 'github',
  cloud: { origin: 'https://github.com/*', label: 'GitHub.com' },
  // `ghe.com` et ses sous-domaines : GitHub Enterprise Cloud avec résidence des données (§A.4),
  // un sous-domaine par client, inconnu à la compilation.
  inferHost: (host: string) => host === 'github.com' || host === 'ghe.com' || host.endsWith('.ghe.com'),
  configCredentials: rawRouteCredentials,
  viewParams: [],
  // Marque GitHub — tracé d'Octicons (`mark-github`), la forme officielle.
  glyph: {
    viewBox: '0 0 16 16',
    path: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z',
  },
} as const satisfies PlatformDescriptor;
