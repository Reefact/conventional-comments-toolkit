// Partagé entre background.ts (service worker — seul contexte où `chrome.permissions`
// est exposé), la page d'options, et content-internal.ts (un CONTENT SCRIPT : Chrome n'y
// expose pas `chrome.permissions`, § « Content scripts » de la doc MV3 — un appel y
// résoudrait silencieusement des listes vides, ce que revue Codex de la PR #29 a signalé
// après coup). content-internal.ts ne fait donc jamais cet appel lui-même : il lit le
// résultat déjà calculé par background.ts dans `chrome.storage.local`, seule API des
// trois accessible dans les trois contextes.

import { hostMatchesPattern as matchesHostPattern } from '@cct/adapter-shared';

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
 * c'est-à-dire l'exact inverse de ce que l'octroi couvre.
 *
 * **Le joker est retiré AVANT `URL`, et remis après.** Il ne suffisait pas de le laisser
 * traverser : `new URL('https://*.ghe.com').hostname` rend `*.ghe.com` sous Node — donc
 * dans toute cette suite de tests — mais `%2A.ghe.com` dans Chromium, MESURÉ (l'assertion
 * correspondante de `npm run smoke:mv3` le rejoue dans un vrai navigateur). L'étiquette
 * était donc stockée sous `%2A.ghe.com`, un motif que `matchScore()` ne voit plus comme un
 * joker faute de `*.` en tête : il le traite comme un hôte exact, que rien n'égale jamais.
 * La résidence de données n'a ainsi jamais fonctionné hors des tests, et aucun d'eux ne
 * pouvait le voir — ils tournaient dans le seul environnement où l'affirmation est vraie. */
export function hostnameOf(input: string): string | null {
  // Le retrait du schéma est INSENSIBLE À LA CASSE : un schéma est valide en majuscules, et
  // une saisie collée depuis une barre d'adresse peut l'être. Sans le drapeau `i`, le
  // schéma survivait, `new URL('https://HTTPS://GHES.Example.Corp')` parsait `https`
  // comme nom d'hôte, et la page d'options demandait la permission pour `https://https/*`
  // en l'étiquetant — un échec qui rend un résultat plausible plutôt que de lever (revue
  // Codex, PR #29).
  const bare = input.trim().replace(/\/\*$/, '').replace(/^https?:\/\//i, '');
  if (bare === '') return null;
  const wildcard = bare.startsWith('*.');
  const rest = wildcard ? bare.slice(2) : bare;
  // Un motif qui ne désigne AUCUN hôte concret ne rend pas un hôte. Le cas qui compte est
  // `https://*/*` — l'octroi large — et il n'est pas hypothétique : c'est le motif que ce
  // manifeste déclare en `optional_host_permissions`, donc le plus large que le navigateur
  // puisse accorder pour cette extension. Sans ce refus, `*` traversait `URL` et rendait un
  // nom d'hôte fantôme (`%2A` dans Chromium) que `hostMatchesPattern()` ne fait
  // correspondre à rien : la page d'options le listait comme un domaine à classer, et le
  // classer n'activait aucun adaptateur. Rendre `null` le fait ignorer partout — la page
  // d'options comme le calcul de la répartition sautent déjà les hôtes non exploitables —
  // et les cartes du catalogue restent proposées, un clic suffisant alors à classer un
  // domaine concret que l'octroi large couvre déjà (revue Codex, PR #60).
  if (rest === '' || rest.includes('*')) return null;
  try {
    const hostname = new URL(`https://${rest}`).hostname;
    if (!hostname) return null;
    return wildcard ? `*.${hostname}` : hostname;
  } catch {
    return null;
  }
}

/** Un site cloud du catalogue : domaine fixe, connu à la compilation, et plateforme déjà
 * décidée — de quoi l'autoriser d'un seul clic, sans rien saisir ni choisir.
 *
 * `origin` est le motif présenté à `chrome.permissions.request()`, et c'est LUI qui décide
 * de ce que l'octroi couvre : `hostnameOf()` en tire la clé d'étiquette, joker compris. */
export interface CloudPlatform {
  id: string;
  label: string;
  origin: string;
  platform: HostPlatform;
}

/** Les hôtes que la page d'options peut proposer d'un seul clic. **Aucun n'est pré-déclaré
 * dans le manifeste** : tous passent par `optional_host_permissions`, `github.com` comme
 * les autres.
 *
 * `github.com` y échappait — `content_scripts` l'injectait statiquement. La différence qui
 * compte est étroite, et deux formulations successives l'ont manquée avant celle-ci (revues
 * Reefact, PR #61) : ni « révocable par rien » — le navigateur garde ses propres contrôles
 * d'accès aux sites —, ni « invisible pour l'extension », car `getAll()` rend bel et bien
 * les permissions du manifeste. Ce qui est vrai, et MESURÉ par `npm run smoke:mv3` :
 * `permissions.remove()` refuse une permission requise (« You cannot remove required
 * permissions. »), là où il retire un octroi optionnel. L'extension ne peut donc pas rendre
 * ce que le manifeste exige — donc pas bâtir un consentement qu'on reprend depuis le
 * produit. L'exception se payait par ailleurs en cas particuliers dispersés : un
 * court-circuit dans `selectPlatform()`, un autre dans `registerContentScriptForOrigin()`,
 * et une ligne « plateforme non précisée » affichée pour un octroi superflu sur un domaine
 * où le choix n'était de toute façon jamais lu. Un seul mécanisme supprime les trois.
 *
 * **Le critère d'entrée est l'hôte CONCRET, pas la plateforme ni l'offre cloud.** Un
 * suffixe connu ne suffit pas : `{organisation}.visualstudio.com` donne un sous-domaine par
 * organisation, et l'inscrire ici ferait demander `https://*.visualstudio.com/*`, donc
 * l'accès à toutes les organisations sur URLs historiques quand un poste n'en sert qu'une.
 * Ce catalogue l'a porté, contredisant son propre commentaire, qui reconnaissait déjà le
 * cas comme « inconnu à la compilation, même situation que `*.ghe.com` » (revue Reefact,
 * PR #61). Ces hôtes-là se saisissent dans la zone des domaines auto-hébergés, où
 * `inferPlatform()` pré-remplit déjà Azure DevOps sur ce suffixe.
 *
 * `dev.azure.com` reste ici : l'organisation y vit dans le CHEMIN, c'est donc un hôte fixe,
 * et l'autoriser est le minimum possible pour ce domaine. */
export const CLOUD_PLATFORMS: readonly CloudPlatform[] = [
  { id: 'github', label: 'GitHub.com', origin: 'https://github.com/*', platform: 'github' },
  {
    id: 'azdo',
    label: 'Azure DevOps Services',
    origin: 'https://dev.azure.com/*',
    platform: 'azdo',
  },
];

/** Plateforme évidente pour un domaine de PRODUIT connu — pré-remplissage de la page
 * d'options, jamais une décision prise à la place de la personne : le menu reste
 * modifiable, et un domaine auto-hébergé (le cas courant ici) n'est pas devinable, ce qui
 * laisse le menu vide plutôt que de risquer une étiquette fausse.
 *
 * Vit ici, et non dans la page d'options, parce que c'est une règle sur les hôtes — et
 * parce que `options.ts` touche `chrome` au chargement du module, donc ne s'importe pas
 * hors du contexte d'une page d'extension. */
export function inferPlatform(host: string): HostPlatform | null {
  if (host === 'dev.azure.com' || host.endsWith('.visualstudio.com')) return 'azdo';
  if (host === 'github.com' || host === 'ghe.com' || host.endsWith('.ghe.com')) return 'github';
  return null;
}

/** Quelle plateforme doit servir cet hôte, au vu de la répartition publiée — ou `null` si
 * aucune ne le doit.
 *
 * C'est ici, et pas dans `matchesHost()` des adaptateurs, que se décide l'activation :
 * l'adaptateur répond « je sais parler à cet hôte », question utile une fois qu'il est
 * choisi, mais qui ne dit rien du DROIT d'y être. Réduire les deux à un booléen
 * « un adaptateur matche » perdait justement les deux informations qui comptent — par quel
 * droit, et lequel — d'où une révocation muette sur les hôtes Azure intégrés, et un
 * reclassement d'hôte qui laissait l'onglet sur l'ancien adaptateur.
 *
 * **Aucun hôte n'est privilégié**, `github.com` compris : il doit figurer dans la
 * répartition comme n'importe quel autre. C'est ce qui met son activation sous le contrôle
 * du même octroi que les autres — donc retirable depuis la page d'options, et suivie par
 * `permissions.onRemoved`. */
export function selectPlatform(
  hostname: string,
  extra: ExtraHostsByPlatform
): 'github' | 'azdo' | null {
  const github = matchScore(hostname, extra.github);
  const azdo = matchScore(hostname, extra.azdo);
  if (github === azdo) return null; // aucun des deux, ou égalité : voir ci-dessous
  return github > azdo ? 'github' : 'azdo';
}

/** Force de la meilleure correspondance de `hostname` dans `patterns` ; `0` si aucune.
 *
 * **Règle de CE produit, pas une sémantique du navigateur** — la distinction compte, et
 * ce fichier a déjà porté une règle inventée présentée comme une règle de Chrome. Chrome,
 * lui, ne classe pas ses motifs par spécificité : il répond oui ou non, motif par motif.
 * Le besoin d'un départage naît d'ici, parce que deux plateformes peuvent revendiquer le
 * même hôte.
 *
 * Le départage : une entrée EXACTE l'emporte sur un joker, et entre deux jokers le suffixe
 * le plus long gagne. Autrement dit, la classification la plus précise l'emporte sur la
 * plus large — sans quoi un `*.corp.example` étiqueté GitHub écrasait un
 * `azdo.corp.example` explicitement étiqueté Azure DevOps, simplement parce que la liste
 * GitHub était consultée en premier (revue Codex, PR #29).
 *
 * À égalité stricte, `selectPlatform` ne tranche pas et rend `null` : deux plateformes
 * revendiquant un hôte avec la même précision est une configuration contradictoire, et la
 * règle de ce dépôt est de ne jamais deviner — un hôte non classé n'active rien, ce qui se
 * voit et se corrige, là où un choix arbitraire se manifesterait par une interface
 * subtilement fausse. */
function matchScore(hostname: string, patterns: readonly string[]): number {
  let best = 0;
  for (const pattern of patterns) {
    if (!matchesHostPattern(hostname, pattern)) continue;
    // Exact : score maximal, indépendant de la longueur. Joker : longueur du suffixe, de
    // sorte que `*.a.b.example` batte `*.b.example` sur un hôte que les deux couvrent.
    const score = pattern.startsWith('*.') ? pattern.length - 2 : Number.MAX_SAFE_INTEGER;
    if (score > best) best = score;
  }
  return best;
}

/** Étiquettes de plateforme poussées par la politique d'entreprise (`allowedHosts` de
 * `chrome.storage.managed`, §10, §A.4, §B.4). Lue à l'identique par le service worker
 * — qui publie la répartition — et par la page d'options, qui doit afficher un hôte
 * classé par la politique comme tel, et non comme « à classer » : elle proposerait sinon
 * une correction locale que `readPlatformTags()` laisse justement la politique écraser,
 * donc restant sans effet (revue Codex, PR #29).
 *
 * **Seule la forme `{host, platform}` est reconnue, et deux raisons l'imposent** (revue
 * Codex, PR #29) :
 *
 * 1. Le validateur de schéma de politique de Chrome exige que « chaque schéma porte un
 *    `$ref` ou exactement un `type` » (doc « Manifest for managed storage »). Un `items`
 *    en `anyOf`, sans `type`, viole cette règle : le schéma peut être rejeté, et
 *    `allowedHosts` n'être jamais publié — voire la politique entière de l'extension.
 *    Une seule forme est donc déclarable, pas deux.
 * 2. Faire valoir `github` à une chaîne nue RÉÉCRIRAIT le sens des politiques existantes :
 *    le schéma d'avant décrivait déjà ce tableau comme contenant « domaines GHES / Azure
 *    DevOps Server et hôte de configUrl ». Une entrée Azure DevOps Server s'y retrouverait
 *    classée GitHub — et, GitHub étant consulté en premier, l'adaptateur GitHub gagnerait
 *    sur une page Azure DevOps.
 *
 * Une entrée sans plateforme explicite reste donc NON CLASSÉE — jamais devinée, comme un
 * hôte accordé sans étiquette côté utilisateur. */
export function parseManagedHostTags(raw: unknown): Record<string, HostPlatform> {
  const tags: Record<string, HostPlatform> = {};
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || typeof entry !== 'object') continue;
    const { host: rawHost, platform } = entry as { host?: unknown; platform?: unknown };
    const host = typeof rawHost === 'string' ? hostnameOf(rawHost) : null;
    if (host && (platform === 'github' || platform === 'azdo' || platform === 'config')) {
      tags[host] = platform;
    }
  }
  return tags;
}
