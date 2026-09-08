// Service worker MV3 (event page sur Firefox — §10, Compatibilité). Quatre rôles :
// répondre aux demandes de lecture de configuration des scripts de contenu quand la
// permission d'hôte vit ici, ENREGISTRER DYNAMIQUEMENT le script de contenu sur les
// hôtes accordés via `optional_host_permissions` (§2, §A.4, §B.4), PUBLIER la répartition
// de ces hôtes par plateforme à l'usage du script de contenu, et ouvrir la page d'options
// au clic sur l'icône de la barre d'outils.
//
// Le manifeste ne déclare AUCUN `content_scripts` : ce second rôle est donc le seul chemin
// d'injection qui existe, github.com compris. Sans lui, l'extension serait morte partout —
// et aucun test unitaire ne peut le voir, tous instanciant l'adaptateur directement, en
// court-circuitant ce mécanisme d'activation. Aucun secret, aucun jeton (§10).
//
// Ce rôle a DEUX moitiés, et n'en avoir qu'une laissait le parcours principal cassé :
// l'enregistrement dynamique ne sert que les chargements SUIVANTS, jamais un document déjà
// chargé. L'onglet depuis lequel on ouvre les réglages pour s'autoriser est précisément
// celui-là. `injectIntoOpenTabs()` est la seconde moitié.
//
// Le TROISIÈME rôle vit ici et pas dans le script de contenu pour une raison de contexte
// d'exécution, pas de commodité : `chrome.permissions` n'est PAS exposé aux scripts de
// contenu. Y appeler `getAll()` ne lève pas — l'objet est simplement absent, et toute
// répartition calculée là-bas serait silencieusement vide (revue Codex, PR #29). Le
// service worker croise donc les origines accordées avec leur étiquette de plateforme et
// dépose le résultat dans `chrome.storage.local`, la seule des trois API accessible aussi
// bien ici que dans la page d'options et le script de contenu.

import { vetFloor, vettedConfigUrl, type Floor } from '@cct/core';
import { configCredentials } from '@cct/adapter-github';
import {
  EMPTY_EXTRA_HOSTS,
  EXTRA_HOSTS_KEY,
  HOST_PLATFORMS_KEY,
  hostnameOf,
  parseManagedHostTags,
  type ExtraHostsByPlatform,
  type HostPlatform,
} from './host-platform.js';

interface FetchConfigRequest {
  kind: 'cct-fetch-config';
  /** L'URL que l'appelant croit devoir lire. Elle est CONFRONTÉE au `configUrl` que ce
   * worker dérive lui-même du canal de plancher, jamais fetchée sur parole — voir le
   * gestionnaire ci-dessous. */
  url: string;
}

interface RegisteredContentScript {
  id: string;
  matches: string[];
  js: string[];
  css: string[];
  runAt: 'document_idle';
}

declare const chrome: {
  runtime: {
    onMessage: {
      addListener: (
        cb: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void
      ) => void;
    };
    lastError?: { message?: string } | null;
    openOptionsPage?: () => void;
    onInstalled?: { addListener: (cb: (details: { reason?: string }) => void) => void };
  };
  action?: {
    onClicked: { addListener: (cb: () => void) => void };
  };
  permissions?: {
    getAll: (cb: (perms: { origins?: string[] }) => void) => void;
    onAdded?: { addListener: (cb: (perms: { origins?: string[] }) => void) => void };
    onRemoved?: { addListener: (cb: (perms: { origins?: string[] }) => void) => void };
  };
  scripting?: {
    registerContentScripts: (scripts: RegisteredContentScript[], cb: () => void) => void;
    unregisterContentScripts: (filter: { ids: string[] }, cb: () => void) => void;
    getRegisteredContentScripts?: (cb: (scripts: { id: string }[]) => void) => void;
    updateContentScripts?: (scripts: RegisteredContentScript[], cb: () => void) => void;
    executeScript?: (
      injection: { target: { tabId: number }; files?: string[]; func?: () => unknown },
      cb?: (results?: { result?: unknown }[]) => void
    ) => void;
    insertCSS?: (
      injection: { target: { tabId: number }; files: string[] },
      cb?: () => void
    ) => void;
  };
  tabs?: {
    query: (filter: { url: string[] }, cb: (tabs: { id?: number }[]) => void) => void;
  };
  storage?: {
    local?: {
      get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, cb?: () => void) => void;
    };
    managed?: { get: (cb: (items: Record<string, unknown>) => void) => void };
    onChanged?: {
      addListener: (
        cb: (changes: Record<string, unknown>, areaName: string) => void
      ) => void;
    };
  };
} | undefined;

/** Plancher poussé par la politique d'entreprise (§8.1.1) — MÊME source que celle que lit
 * le script de contenu (`readManagedFloor()` de content-internal.ts). Le worker la relit
 * pour son propre compte plutôt que de faire confiance au message reçu. */
async function readManagedFloor(): Promise<Floor | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.managed) return resolve(null);
      chrome.storage.managed.get((items) => {
        const floor = items?.['floor'];
        resolve(floor && typeof floor === 'object' ? (floor as Floor) : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** Lecture du `configUrl` d'organisation POUR le script de contenu (§8.1.1, §10).
 *
 * Ce relais n'est pas une commodité : c'est le SEUL chemin qui fonctionne. « Content
 * scripts initiate requests on behalf of the web origin that the content script has been
 * injected into and therefore content scripts are also subject to the same origin policy »
 * (doc Chrome, « Cross-origin network requests ») — une permission d'hôte ne change rien à
 * cela. Un `configUrl` hébergé ailleurs que sur la plateforme affichée est donc
 * inaccessible depuis le script de contenu, quelle que soit la permission accordée, et
 * échouait en pratique en état dégradé permanent. Le fetch se fait ici, où l'origine est
 * celle de l'extension et où la permission d'hôte porte réellement.
 *
 * `getRepoConfig()` reste appelée directement par les adaptateurs, et DOIT le rester :
 * elle vise l'origine de la page affichée, donc ne pose aucune question de CORS — et la
 * passer par ici exigerait une permission d'hôte sur github.com que le manifeste ne
 * déclare plus (PR #28).
 *
 * **L'URL reçue est confrontée, pas suivie.** La même doc conseille de ne pas laisser un
 * script de contenu désigner la cible d'une requête privilégiée. `configUrl` provient
 * exclusivement du canal de plancher (§8.1.1), que ce worker sait lire : il dérive donc la
 * cible lui-même et n'accepte le message que si les deux coïncident. Sans ce contrôle, un
 * script de contenu injecté sur un hôte accordé pourrait employer le worker comme relais
 * authentifié vers n'importe quel autre hôte accordé. La comparaison est une égalité de
 * chaînes : les deux côtés lisent la MÊME valeur au même endroit, toute divergence est un
 * défaut et non une variante d'écriture à rattraper. */
chrome?.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const req = message as FetchConfigRequest;
  if (req?.kind !== 'cct-fetch-config') return;
  void (async () => {
    try {
      // Le plancher VÉRIFIÉ, comme côté script de contenu : un plancher de version non
      // supportée ne désigne aucun document d'organisation (§8.1.5).
      const vetted = vettedConfigUrl(vetFloor(await readManagedFloor()));
      if (vetted === null || vetted !== req.url) {
        return sendResponse({ status: 'unreachable', reason: 'url not vetted by floor' });
      }
      // `configCredentials()` et non `include` : ce worker n'échappe pas au CORS sur la CIBLE
      // d'une redirection, qui n'est pas dans ses permissions d'hôte. Mesuré
      // (`npm run check:relay-cors`) : depuis un service worker MV3 ayant la permission de
      // l'origine de départ seulement, `include` LÈVE dès qu'on est redirigé vers une origine
      // en `ACAO: *` — le mur exact du script de contenu, à un contexte près (revue Codex,
      // PR #36, round 4). La même fonction décide donc des deux côtés : sur la route `raw` de
      // github.com, pas de cookies ; partout ailleurs — un `configUrl` interne, la raison
      // d'être du relais — `include`, et la session avec.
      //
      // ATTENTION à ce que `same-origin` veut dire ICI. Dans une page github.com, il
      // authentifie le premier saut ; dans ce worker, l'origine est `chrome-extension://`,
      // donc il n'envoie AUCUN cookie, nulle part. La lecture relayée d'un `configUrl` sur la
      // route `raw` de github.com est donc anonyme — et l'enchaînement manuel qui sauverait le
      // cas n'existe pas : mesuré, `redirect: 'manual'` rend une réponse `opaqueredirect` dont
      // `Location` est `null`, impossible à suivre soi-même (revue Codex, PR #36, round 5).
      const credentials = configCredentials(vetted);
      const res = await fetch(vetted, { credentials });
      if (res.status === 404) {
        // Conséquence : sur un dépôt PRIVÉ, ce 404 est le masque de GitHub, pas un fichier
        // manquant — et le rendre `absent` ferait appliquer les niveaux inférieurs en
        // AFFIRMANT avoir lu le niveau 2. Même refus de conclure que dans `getOrgConfig()`,
        // pour la même raison : la réponse est indiscernable d'un accès refusé.
        return sendResponse(
          credentials === 'include'
            ? { status: 'absent' }
            : { status: 'unreachable', reason: "HTTP 404 (absence indiscernable d'un accès refusé)" }
        );
      }
      if (!res.ok) return sendResponse({ status: 'unreachable', reason: `HTTP ${res.status}` });
      sendResponse({ status: 'found', text: await res.text() });
    } catch (e) {
      sendResponse({ status: 'unreachable', reason: String(e) });
    }
  })();
  return true; // réponse asynchrone
});

// Le bouton de la barre d'outils (`action` du manifeste) n'ouvre aucun popup : son seul
// rôle est d'amener aux réglages en un clic, depuis n'importe quel onglet — sinon la
// page d'options ne s'atteint que par chrome://extensions puis « Détails ». Sans ce
// gestionnaire, l'icône serait un bouton inerte, ce qui se lit comme une extension
// cassée. `action` est absent sur un navigateur qui ignorerait la clé, et
// `openOptionsPage` derrière une garde : le service worker ne doit jamais échouer au
// démarrage pour un bouton.
chrome?.action?.onClicked.addListener(() => {
  chrome?.runtime.openOptionsPage?.();
});

/** Amène aux réglages au PREMIER lancement, et après une mise à jour qui laisserait
 * l'extension sans aucun domaine.
 *
 * Depuis qu'aucun hôte n'est pré-déclaré dans le manifeste, une extension fraîchement
 * installée ne fait rien nulle part tant que personne n'a autorisé un domaine. Rien ne le
 * signale : ni erreur, ni icône barrée — juste une extension qui a l'air cassée. C'est aussi
 * la seule migration possible pour un utilisateur existant, `permissions.request()` exigeant
 * un geste humain que le service worker ne peut pas produire.
 *
 * `update` est traité, sous DEUX conditions, et il en fallait bien deux (revue Reefact et
 * Codex, PR #62) :
 *
 * 1. **Une seule fois.** La migration est un événement ponctuel, pas un état. Prendre
 *    « aucun domaine servi » pour déclencheur permanent revenait à rouvrir un onglet à
 *    CHAQUE mise à jour du store à quelqu'un qui a délibérément choisi de n'autoriser
 *    aucun domaine — il aurait vu la même invitation refusée revenir indéfiniment. Un
 *    marqueur dit ce que la condition ne peut pas dire : la proposition a déjà été faite.
 * 2. **Aucun hôte SERVI**, et non « aucune permission ». Les deux diffèrent exactement là
 *    où ça compte : une origine accordée depuis `chrome://extensions` sans étiquette, ou
 *    étiquetée `config` seule, n'active aucun adaptateur. `servedOrigins()` est le même
 *    croisement que celui qui décide de l'injection — les faire diverger ici aurait
 *    déclaré la migration inutile à quelqu'un qui n'a de script de contenu nulle part.
 *
 * Les autres raisons (`chrome_update`, `shared_module_update`) ne concernent pas cette
 * extension et n'ouvrent rien. */
export const MIGRATION_PROMPTED_KEY = 'migrationPrompted';

/** Les origines actuellement accordées. Extraite parce que deux appelants la lisent
 * maintenant, et qu'un second `getAll()` recopié serait la première étape vers deux lectures
 * qui divergent. */
function grantedOrigins(): Promise<string[]> {
  return new Promise((resolve) => {
    if (!chrome?.permissions) return resolve([]);
    chrome.permissions.getAll((perms) => resolve(perms?.origins ?? []));
  });
}

async function alreadyPrompted(): Promise<boolean> {
  return new Promise((resolve) => {
    const local = chrome?.storage?.local;
    // Pas de stockage : ne PAS ouvrir. Se tromper dans ce sens coûte une invitation
    // manquée ; dans l'autre, un onglet à chaque mise à jour, indéfiniment.
    if (!local) return resolve(true);
    local.get([MIGRATION_PROMPTED_KEY], (items) => resolve(items?.[MIGRATION_PROMPTED_KEY] === true));
  });
}

chrome?.runtime?.onInstalled?.addListener((details) => {
  const reason = details?.reason;
  if (reason === 'install') return void chrome?.runtime.openOptionsPage?.();
  if (reason !== 'update') return;
  void (async () => {
    if (await alreadyPrompted()) return;
    const origins = await grantedOrigins();
    const tags = await readPlatformTags();
    if (servedOrigins(origins, tags).length > 0) return;
    // Le marqueur est posé AVANT d'ouvrir, et pas après : une ouverture qui échoue ne doit
    // pas laisser la question rejouable à chaque mise à jour.
    chrome?.storage?.local?.set({ [MIGRATION_PROMPTED_KEY]: true }, () =>
      chrome?.runtime.openOptionsPage?.()
    );
  })();
});

/** Préfixe de tout ce que cette extension enregistre — la seule façon de reconnaître NOS
 * enregistrements parmi ceux que `getRegisteredContentScripts()` rend. */
const SCRIPT_ID_PREFIX = 'cct-';

/** **UN SEUL** script enregistré, portant TOUS les hôtes servis dans son `matches`.
 *
 * Le choix n'est pas cosmétique, et deux défauts distincts l'imposent (revue Reefact,
 * PR #60). Un enregistrement PAR ORIGINE créait autant de scripts que d'octrois, et deux
 * motifs peuvent parfaitement couvrir la même page — le motif large (toutes origines
 * https, ce que le manifeste déclare en `optional_host_permissions`) accordé depuis
 * `chrome://extensions` et `https://github.com` ajouté ici, ou un `*.corp.example`
 * pré-autorisé par politique et le `ghes.corp.example` qu'il contient. Chaque
 * enregistrement injectant pour son compte, `content.js` partait deux fois sur ces pages,
 * et `bootstrap()` n'étant pas idempotent, l'interface s'y dédoublait. Un script unique
 * s'injecte une fois par document, quel que soit le nombre de ses motifs qui matchent.
 *
 * Et un identifiant unique fait disparaître la question de sa fabrication : un identifiant
 * PAR ORIGINE devait être injectif, ce qu'un slug puis un slug + FNV-1a 32 bits ne
 * garantissaient toujours pas — deux hôtes construits pour entrer en collision partagent
 * encore leur empreinte, et donc leur enregistrement. Il n'y a plus de nom à dériver. */
const SCRIPT_ID = `${SCRIPT_ID_PREFIX}hosts`;

/** Les origines réellement SERVIES : accordées **et** classées `github`/`azdo`.
 *
 * L'enregistrement suivait jusqu'ici la seule permission, alors que l'activation, elle,
 * suit la classification (`selectPlatform`). L'écart n'était pas théorique : un octroi
 * large — toutes origines https, ce que le manifeste déclare en
 * `optional_host_permissions` — faisait
 * enregistrer un script sur TOUTES les pages https, où il ne pouvait ensuite rien faire,
 * faute d'étiquette. Aligner les deux, c'est n'injecter que là où un adaptateur tournera.
 *
 * `config` en est exclu à dessein : cet hôte n'est accordé que pour lire un `configUrl`,
 * lecture qui vit dans ce worker. Aucun script de contenu n'y a affaire. */
function servedOrigins(origins: string[], tags: Record<string, HostPlatform>): string[] {
  return origins.filter((origin) => {
    const host = hostnameOf(origin);
    return host !== null && (tags[host] === 'github' || tags[host] === 'azdo');
  });
}

/** Amène l'enregistrement à l'état voulu — inscrit, mis à jour, ou retiré s'il ne reste
 * rien à servir. `matches` vide n'est pas une option : `registerContentScripts` la refuse,
 * et c'est heureux, un script sans motif ne voulant rien dire. */
async function applyRegistration(matches: string[]): Promise<void> {
  const scripting = chrome?.scripting;
  if (!scripting) return;
  const registered = await listRegisteredScripts();
  const ours = registered.some((script) => script.id === SCRIPT_ID);

  // Le ménage vise ce que les versions ANTÉRIEURES ont laissé : elles nommaient un script
  // par origine, sous des identifiants que plus rien ici ne sait reconstruire. Un
  // enregistrement dynamique survivant à une mise à jour de l'extension, ces orphelins
  // continueraient d'injecter à côté du nôtre — le dédoublement, encore.
  const stale = registered
    .map((script) => script.id)
    .filter((id) => id.startsWith(SCRIPT_ID_PREFIX) && id !== SCRIPT_ID);
  if (stale.length > 0) {
    await new Promise<void>((resolve) => scripting.unregisterContentScripts({ ids: stale }, () => resolve()));
  }

  if (matches.length === 0) {
    if (ours) {
      await new Promise<void>((resolve) =>
        scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }, () => resolve())
      );
    }
    return;
  }

  const script: RegisteredContentScript = {
    id: SCRIPT_ID,
    matches,
    js: ['content.js'],
    css: ['styles.css'],
    runAt: 'document_idle',
  };
  await new Promise<void>((resolve) => {
    // `update` plutôt que désenregistrer-puis-réenregistrer : ce dernier ouvrirait, à chaque
    // changement d'étiquette, une fenêtre où plus aucun hôte n'est servi.
    if (ours && scripting.updateContentScripts) {
      scripting.updateContentScripts([script], () => resolve());
    } else {
      scripting.registerContentScripts([script], () => resolve());
    }
  });

  await injectIntoOpenTabs(matches);
}

/** Injecte dans les onglets DÉJÀ OUVERTS que l'enregistrement vient de couvrir.
 *
 * Un enregistrement dynamique ne s'applique qu'aux chargements SUIVANTS : un document déjà
 * chargé ne reçoit rien. Mesuré dans un vrai Chromium (`spikes/open-tab-injection.mjs`),
 * pas rappelé — l'onglet resté ouvert garde son titre intact après
 * `registerContentScripts`, et ne le change qu'après `executeScript`.
 *
 * C'est le parcours PRINCIPAL du produit qui en dépend, pas un cas de bord : on arrive sur
 * la page d'options depuis un onglet de plateforme, par l'icône de la barre d'outils ; c'est
 * cet onglet-là qui vient d'être autorisé, et il serait resté inerte jusqu'à un
 * rechargement. Le `watchExtraHosts()` du script de contenu ne rattrape pas ce premier
 * octroi : depuis que l'injection suit la classification, aucun script de contenu n'est
 * présent dans cet onglet pour observer quoi que ce soit.
 *
 * Aucune permission nouvelle : `tabs.query` filtre sur `url` sans la permission `tabs` dès
 * lors qu'une permission d'HÔTE couvre les onglets visés — ce qui est exactement le cas ici,
 * `matches` ne contenant que des origines accordées. Même chose pour `executeScript`, dont
 * c'est la condition. La mesure ci-dessus vérifie les deux.
 *
 * Le double emploi avec l'enregistrement est assumé et rendu inoffensif à l'ARRIVÉE : le
 * point d'entrée du script de contenu pose un marqueur dans son monde isolé et ne bootstrape
 * qu'une fois. Le résoudre ici — en interrogeant chaque onglet avant d'injecter — supposerait
 * de savoir ce qu'il contient déjà, ce qui demande précisément une injection. */
/** Le script de contenu est-il déjà présent dans cet onglet ?
 *
 * La sonde lit le marqueur que pose le point d'entrée du script de contenu, et elle le voit
 * parce que `executeScript({func})` s'exécute dans le MÊME monde isolé que le script —
 * mesuré, la réponse valant `false` sur un onglet nu et `true` sur un onglet injecté. C'est
 * ce qui permet de poser la question sans rien injecter d'abord.
 *
 * Un échec vaut « déjà présent » plutôt que « absent » : sur une page où l'injection est
 * refusée, réessayer à chaque réveil ne réussira pas davantage, et se tromper dans ce sens
 * ne coûte qu'un onglet non rattrapé — l'autre sens accumule les feuilles de style, ce que
 * cette fonction existe pour empêcher. Le marqueur côté script de contenu reste la garde de
 * dernier recours : deux publications rapprochées peuvent sonder avant que l'une ait
 * injecté. */
async function hasContentScript(tabId: number): Promise<boolean> {
  const executeScript = chrome?.scripting?.executeScript;
  if (!executeScript) return true;
  return new Promise((resolve) => {
    try {
      executeScript(
        { target: { tabId }, func: () => (globalThis as Record<string, unknown>)['__cctContentScriptLoaded'] === true },
        (results) => {
          if (chrome?.runtime?.lastError) return resolve(true);
          resolve(results?.[0]?.result === true);
        }
      );
    } catch {
      resolve(true);
    }
  });
}

async function injectIntoOpenTabs(matches: string[]): Promise<void> {
  const scripting = chrome?.scripting;
  if (!scripting?.executeScript || !chrome?.tabs?.query || matches.length === 0) return;

  const tabs = await new Promise<{ id?: number }[]>((resolve) => {
    try {
      chrome.tabs!.query({ url: matches }, (found) => resolve(found ?? []));
    } catch {
      resolve([]);
    }
  });

  for (const tab of tabs) {
    const tabId = tab.id;
    if (typeof tabId !== 'number') continue;
    // Cet onglet a-t-il DÉJÀ le script ? Sans cette question, le rattrapage repasse sur
    // tous les onglets servis à chaque réveil du worker et à chaque republication.
    // `bootstrap()` y serait protégée par son marqueur, mais PAS la feuille de style :
    // `insertCSS` est une insertion, pas un « ensure », et trois insertions identiques
    // demandent trois `removeCSS` pour disparaître — mesuré, pas supposé
    // (`spikes/open-tab-injection.mjs`). Un onglet de longue vie accumulait donc une copie
    // de `styles.css` par réveil.
    if (await hasContentScript(tabId)) continue;
    // Un onglet peut disparaître, ou refuser l'injection (page d'erreur, document
    // interdit). Chaque cible est donc indépendante : un échec n'annule pas les autres, et
    // `lastError` est lu pour que Chrome ne le signale pas comme non traité.
    if (scripting.insertCSS) {
      await new Promise<void>((resolve) => {
        try {
          scripting.insertCSS!({ target: { tabId }, files: ['styles.css'] }, () => {
            void chrome?.runtime?.lastError;
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }
    await new Promise<void>((resolve) => {
      try {
        scripting.executeScript!({ target: { tabId }, files: ['content.js'] }, () => {
          void chrome?.runtime?.lastError;
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }
}

function listRegisteredScripts(): Promise<{ id: string }[]> {
  return new Promise((resolve) => {
    const get = chrome?.scripting?.getRegisteredContentScripts;
    if (!get) return resolve([]);
    try {
      get((scripts) => resolve(scripts ?? []));
    } catch {
      resolve([]);
    }
  });
}

/** Conservé pour l'appel de démarrage : l'enregistrement ne survit pas à un rechargement du
 * service worker sans être reposé. Il n'a plus de calcul propre — la publication de la
 * répartition et l'enregistrement partent des MÊMES origines et des MÊMES étiquettes, et
 * les faire diverger est exactement ce qui a produit l'injection sur des hôtes que rien
 * n'activait. */
export async function syncContentScriptsWithGrantedPermissions(): Promise<void> {
  await publishExtraHostsByPlatform();
}

/** Étiquettes posées par la page d'options, et celles poussées par la politique
 * d'entreprise. La politique PRIME : un hôte qu'elle classe ne dépend pas d'un geste
 * interactif dans les réglages pour être reconnu — sans quoi le déploiement pré-autorisé
 * du §10 exigerait que chaque poste visite la page d'options, ce qu'il existe précisément
 * pour éviter (revue Codex, PR #29). Seule la forme `{host, platform}` d'`allowedHosts`
 * classe quoi que ce soit — `parseManagedHostTags()` dit pourquoi une entrée sans
 * plateforme explicite reste NON classée plutôt que devinée. Ce commentaire affirmait
 * l'inverse (« vaut alors, faute de mieux, `github` ») bien après que le code eut cessé de
 * le faire : une description d'un comportement disparu, que rien ne signalait. */
async function readPlatformTags(): Promise<Record<string, HostPlatform>> {
  const local = await new Promise<Record<string, HostPlatform>>((resolve) => {
    if (!chrome?.storage?.local) return resolve({});
    chrome.storage.local.get([HOST_PLATFORMS_KEY], (items) =>
      resolve((items[HOST_PLATFORMS_KEY] as Record<string, HostPlatform> | undefined) ?? {})
    );
  });
  const managed = await new Promise<Record<string, HostPlatform>>((resolve) => {
    if (!chrome?.storage?.managed) return resolve({});
    try {
      chrome.storage.managed.get((items) => resolve(parseManagedHostTags(items?.['allowedHosts'])));
    } catch {
      resolve({});
    }
  });
  return { ...local, ...managed };
}

/** Croise les origines réellement accordées avec leur étiquette de plateforme et publie
 * le résultat pour le script de contenu, qui ne peut pas le calculer lui-même.
 *
 * **Sérialisée** (voir `publishExtraHostsByPlatform`) : autoriser un hôte puis l'étiqueter
 * déclenche coup sur coup `permissions.onAdded` et `storage.onChanged`. Lancées librement,
 * la première publication peut lire l'ancienne carte d'étiquettes et n'écrire qu'APRÈS la
 * seconde, réinstallant une liste périmée d'où le nouvel hôte est absent — le script de
 * contenu le rejetterait alors jusqu'au prochain événement ou redémarrage du worker
 * (revue Codex, PR #29). */
async function computeAndStoreExtraHosts(): Promise<ExtraHostsByPlatform> {
  const result: ExtraHostsByPlatform = { github: [], azdo: [] };
  if (!chrome?.permissions || !chrome?.storage?.local) return result;
  const [origins, tags] = await Promise.all([grantedOrigins(), readPlatformTags()]);
  for (const origin of origins) {
    const host = hostnameOf(origin);
    if (!host) continue;
    // `config` est une classification à part entière : l'hôte est accordé pour lire un
    // configUrl, et ne doit être reconnu par AUCUN adaptateur. Un hôte SANS étiquette
    // n'est pas deviné non plus — la page d'options invite à le classer.
    if (tags[host] === 'github') result.github.push(host);
    else if (tags[host] === 'azdo') result.azdo.push(host);
  }
  await new Promise<void>((resolve) => {
    chrome!.storage!.local!.set({ [EXTRA_HOSTS_KEY]: result }, () => resolve());
  });
  // MÊME source pour les deux : ce qui est injecté et ce qui est activé se déduisent du même
  // croisement, dans le même passage. Les séparer, c'était laisser l'un injecter là où
  // l'autre ne ferait rien.
  await applyRegistration(servedOrigins(origins, tags));
  return result;
}

/** Oublie l'étiquette d'un hôte dont la permission vient d'être retirée.
 *
 * La page d'options le faisait déjà pour son bouton « Retirer », et c'était le seul chemin
 * couvert : une révocation depuis `chrome://extensions` laissait l'étiquette derrière elle.
 * Réautoriser le même hôte par ce même biais retrouvait alors silencieusement l'ancienne
 * classification et rallumait l'adaptateur, au lieu de faire passer le domaine par
 * « Domaines non configurés » comme n'importe quel octroi venu d'ailleurs (revue Reefact,
 * PR #60). Le cycle se ferme ici, où le retrait est observé quelle qu'en soit l'origine.
 *
 * Les étiquettes de POLITIQUE ne vivent pas dans cette clé : rien à y purger, et rien à
 * défaire d'une décision d'administration. */
async function forgetPlatformTags(origins: string[]): Promise<void> {
  const local = chrome?.storage?.local;
  if (!local) return;
  const hosts = origins.map(hostnameOf).filter((host): host is string => host !== null);
  if (hosts.length === 0) return;
  const tags = await new Promise<Record<string, HostPlatform>>((resolve) => {
    local.get([HOST_PLATFORMS_KEY], (items) =>
      resolve((items[HOST_PLATFORMS_KEY] as Record<string, HostPlatform> | undefined) ?? {})
    );
  });
  const remaining = Object.fromEntries(
    Object.entries(tags).filter(([host]) => !hosts.includes(host))
  );
  if (Object.keys(remaining).length === Object.keys(tags).length) return;
  await new Promise<void>((resolve) => {
    local.set({ [HOST_PLATFORMS_KEY]: remaining }, () => resolve());
  });
}

/** File d'attente d'un seul écrivain — même motif que la page d'options. Chaque appel
 * attend l'achèvement du précédent : la dernière publication est donc toujours celle qui
 * a lu l'état le plus récent, et c'est elle qui reste écrite. */
let publishQueue: Promise<ExtraHostsByPlatform> = Promise.resolve(EMPTY_EXTRA_HOSTS);

export function publishExtraHostsByPlatform(): Promise<ExtraHostsByPlatform> {
  const next = publishQueue.then(computeAndStoreExtraHosts, computeAndStoreExtraHosts);
  publishQueue = next.catch(() => EMPTY_EXTRA_HOSTS);
  return next;
}

// Un octroi ne demande rien de particulier : la publication recalcule tout, enregistrement
// compris, à partir des permissions et des étiquettes du moment.
chrome?.permissions?.onAdded?.addListener(() => {
  void publishExtraHostsByPlatform();
});
// Un RETRAIT demande une chose de plus : oublier l'étiquette avant de republier, pour que
// la répartition se calcule sur un état déjà nettoyé.
chrome?.permissions?.onRemoved?.addListener((perms) => {
  void forgetPlatformTags(perms.origins ?? []).then(() => publishExtraHostsByPlatform());
});
// Une étiquette posée ou corrigée dans la page d'options doit republier la répartition :
// la permission, elle, n'a pas bougé, donc aucun `onAdded`/`onRemoved` ne se déclenche.
chrome?.storage?.onChanged?.addListener((changes, areaName) => {
  if ((areaName === 'local' && HOST_PLATFORMS_KEY in changes) || areaName === 'managed') {
    void publishExtraHostsByPlatform();
  }
});
// Un SEUL appel : `syncContentScriptsWithGrantedPermissions()` n'a plus de calcul propre,
// elle délègue à la publication, qui pose l'enregistrement dans le même passage.
void syncContentScriptsWithGrantedPermissions();
