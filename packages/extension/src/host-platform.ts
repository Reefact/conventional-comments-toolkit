// Partagé entre background.ts (service worker — seul contexte où `chrome.permissions`
// est exposé), la page d'options, et content-internal.ts (un CONTENT SCRIPT : Chrome n'y
// expose pas `chrome.permissions`, § « Content scripts » de la doc MV3 — un appel y
// résoudrait silencieusement des listes vides, ce que revue Codex de la PR #29 a signalé
// après coup). content-internal.ts ne fait donc jamais cet appel lui-même : il lit le
// résultat déjà calculé par background.ts dans `chrome.storage.local`, seule API des
// trois accessible dans les trois contextes.

/** Clé `chrome.storage.local` où la page d'options associe un hôte accordé à la
 * plateforme qui le sert. */
export const HOST_PLATFORMS_KEY = 'hostPlatforms';

/** Clé `chrome.storage.local` où background.ts publie le résultat déjà croisé
 * (`chrome.permissions.getAll()` × `HOST_PLATFORMS_KEY`), pour lecture par le script de
 * contenu. */
export const EXTRA_HOSTS_KEY = 'extraHostsByPlatform';

/** `'config'` : hôte de configuration d'organisation (`configUrl`) uniquement — accordé,
 * mais ne doit être reconnu par AUCUN adaptateur. Une classification à part entière,
 * distincte de « non classifié » (absence de clé), pour ne pas la faire réapparaître dans
 * le rattrapage de la page d'options à chaque rafraîchissement. */
export type HostPlatform = 'github' | 'azdo' | 'config';

export interface ExtraHostsByPlatform {
  github: string[];
  azdo: string[];
}

export const EMPTY_EXTRA_HOSTS: ExtraHostsByPlatform = { github: [], azdo: [] };

/** Hostname canonique d'une origine `chrome.permissions` (`"https://GHES.Example.Corp/*"`)
 * ou d'une saisie utilisateur — `URL` normalise la casse et l'IDN, ce que la clé stockée
 * DOIT porter pour rester comparable à celle que produit `chrome.permissions.getAll()`
 * (revue Codex : une saisie `GHES.Example.Corp` stockée telle quelle ne matchait plus
 * jamais l'origine accordée, normalisée en minuscules par le navigateur). `null` si
 * l'entrée n'est pas exploitable — défensif, `chrome.permissions` reste hors du contrôle
 * de ce module. */
export function hostnameOf(input: string): string | null {
  const bare = input.trim().replace(/\/\*$/, '').replace(/^https?:\/\//, '');
  if (bare === '') return null;
  try {
    return new URL(`https://${bare}`).hostname || null;
  } catch {
    return null;
  }
}
