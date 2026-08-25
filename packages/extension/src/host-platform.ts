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
 * de ce module.
 *
 * **Un joker de tête est CONSERVÉ** : `https://*.ghe.com/*` rend `*.ghe.com`, et c'est
 * voulu. Chrome accorde des permissions sur ce motif (§A.4 — GitHub Enterprise Cloud with
 * data residency donne à chaque client un sous-domaine de `ghe.com`, inconnu à la
 * compilation), et `hostMatchesAny()` d'`@cct/adapter-shared` sait le confronter à un
 * hôte concret. Le réduire à `ghe.com` ferait reconnaître le domaine nu et lui seul,
 * c'est-à-dire l'exact inverse de ce que l'octroi couvre. */
export function hostnameOf(input: string): string | null {
  const bare = input.trim().replace(/\/\*$/, '').replace(/^https?:\/\//, '');
  if (bare === '') return null;
  try {
    return new URL(`https://${bare}`).hostname || null;
  } catch {
    return null;
  }
}

/** Étiquettes de plateforme poussées par la politique d'entreprise (`allowedHosts` de
 * `chrome.storage.managed`, §10, §A.4, §B.4). Lue à l'identique par le service worker
 * — qui publie la répartition — et par la page d'options, qui doit afficher un hôte
 * classé par la politique comme tel, et non comme « à classer » : elle proposerait sinon
 * une correction locale que `readPlatformTags()` laisse justement la politique écraser,
 * donc restant sans effet (revue Codex, PR #29).
 *
 * Forme historique acceptée — une liste de noms d'hôtes sans plateforme — valant alors
 * `github`, la plateforme du domaine pré-déclarable et le cas que cette clé sert en
 * premier. Une entreprise qui déploie de l'Azure DevOps Server emploie la forme objet
 * `{host, platform}`, qui porte la plateforme explicitement. */
export function parseManagedHostTags(raw: unknown): Record<string, HostPlatform> {
  const tags: Record<string, HostPlatform> = {};
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry === 'string') {
      const host = hostnameOf(entry);
      if (host) tags[host] = 'github';
    } else if (entry && typeof entry === 'object') {
      const { host: rawHost, platform } = entry as { host?: unknown; platform?: unknown };
      const host = typeof rawHost === 'string' ? hostnameOf(rawHost) : null;
      if (host && (platform === 'github' || platform === 'azdo' || platform === 'config')) {
        tags[host] = platform;
      }
    }
  }
  return tags;
}
