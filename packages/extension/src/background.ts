// Service worker MV3 (event page sur Firefox — §10, Compatibilité). Quatre rôles :
// répondre aux demandes de lecture de configuration des scripts de contenu quand la
// permission d'hôte vit ici, ENREGISTRER DYNAMIQUEMENT le script de contenu sur les
// hôtes accordés via `optional_host_permissions` (§2, §A.4, §B.4), PUBLIER la répartition
// de ces hôtes par plateforme à l'usage du script de contenu, et ouvrir la page d'options
// au clic sur l'icône de la barre d'outils.
//
// `content_scripts.matches` du manifeste est statique et ne liste que github.com : sans
// ce second rôle, accorder la permission sur dev.azure.com ou un GHES depuis la page
// d'options n'injecterait le script NULLE PART — l'adaptateur AzDO existe et est testé,
// mais resterait mort sur toute plateforme réelle. Aucun test unitaire ne peut le voir :
// tous instancient l'adaptateur directement, en court-circuitant ce mécanisme
// d'activation. Aucun secret, aucun jeton (§10).
//
// Le TROISIÈME rôle vit ici et pas dans le script de contenu pour une raison de contexte
// d'exécution, pas de commodité : `chrome.permissions` n'est PAS exposé aux scripts de
// contenu. Y appeler `getAll()` ne lève pas — l'objet est simplement absent, et toute
// répartition calculée là-bas serait silencieusement vide (revue Codex, PR #29). Le
// service worker croise donc les origines accordées avec leur étiquette de plateforme et
// dépose le résultat dans `chrome.storage.local`, la seule des trois API accessible aussi
// bien ici que dans la page d'options et le script de contenu.

import {
  EXTRA_HOSTS_KEY,
  HOST_PLATFORMS_KEY,
  hostnameOf,
  type ExtraHostsByPlatform,
  type HostPlatform,
} from './host-platform.js';

interface FetchConfigRequest {
  kind: 'cct-fetch-config';
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

chrome?.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const req = message as FetchConfigRequest;
  if (req?.kind !== 'cct-fetch-config') return;
  void (async () => {
    try {
      const res = await fetch(req.url, { credentials: 'include' });
      if (res.status === 404) return sendResponse({ status: 'absent' });
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

// L'hôte github.com est déjà couvert par l'entrée statique de `content_scripts` — ne
// jamais l'enregistrer dynamiquement en plus, sous peine d'injecter le script deux fois.
const STATICALLY_COVERED_ORIGIN = 'https://github.com/*';

/** Identifiant stable pour un origin — chrome.scripting exige un id sans caractère
 * spécial ; il sert aussi de clé pour désenregistrer proprement (§A.4, §B.4). */
export function scriptIdFor(origin: string): string {
  return `cct-${origin.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

export async function registerContentScriptForOrigin(origin: string): Promise<void> {
  if (origin === STATICALLY_COVERED_ORIGIN || !chrome?.scripting) return;
  const script: RegisteredContentScript = {
    id: scriptIdFor(origin),
    matches: [origin],
    js: ['content.js'],
    css: ['styles.css'],
    runAt: 'document_idle',
  };
  await new Promise<void>((resolve) => {
    chrome!.scripting!.registerContentScripts([script], () => resolve());
    // Un origin déjà enregistré (rechargement de l'extension, double octroi) lève une
    // erreur côté chrome.runtime.lastError : sans conséquence, le script est déjà là.
  });
}

export async function unregisterContentScriptForOrigin(origin: string): Promise<void> {
  if (origin === STATICALLY_COVERED_ORIGIN || !chrome?.scripting) return;
  await new Promise<void>((resolve) => {
    chrome!.scripting!.unregisterContentScripts({ ids: [scriptIdFor(origin)] }, () => resolve());
  });
}

/** Rattrape au démarrage les permissions déjà accordées (redémarrage du navigateur,
 * mise à jour de l'extension) : `registerContentScripts` ne survit pas à un rechargement
 * du service worker sans cet appel. */
export async function syncContentScriptsWithGrantedPermissions(): Promise<void> {
  if (!chrome?.permissions) return;
  const origins = await new Promise<string[]>((resolve) => {
    chrome!.permissions!.getAll((perms) => resolve(perms.origins ?? []));
  });
  for (const origin of origins) await registerContentScriptForOrigin(origin);
}

/** Étiquettes posées par la page d'options, et celles poussées par la politique
 * d'entreprise. La politique PRIME : un hôte qu'elle classe ne dépend pas d'un geste
 * interactif dans les réglages pour être reconnu — sans quoi le déploiement pré-autorisé
 * du §10 exigerait que chaque poste visite la page d'options, ce qu'il existe précisément
 * pour éviter (revue Codex, PR #29). `allowedHosts` de la politique reste accepté sous sa
 * forme historique — une liste de noms d'hôtes sans plateforme — et vaut alors, faute de
 * mieux, `github` : c'est la plateforme du domaine pré-déclarable, et le §A.4 est le cas
 * que cette clé sert en premier. Une entreprise qui déploie de l'Azure DevOps Server
 * emploie la forme objet, qui, elle, porte la plateforme. */
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
      chrome.storage.managed.get((items) => {
        const raw = items?.['allowedHosts'];
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
        resolve(tags);
      });
    } catch {
      resolve({});
    }
  });
  return { ...local, ...managed };
}

/** Croise les origines réellement accordées avec leur étiquette de plateforme et publie
 * le résultat pour le script de contenu, qui ne peut pas le calculer lui-même. */
export async function publishExtraHostsByPlatform(): Promise<ExtraHostsByPlatform> {
  const result: ExtraHostsByPlatform = { github: [], azdo: [] };
  if (!chrome?.permissions || !chrome?.storage?.local) return result;
  const [origins, tags] = await Promise.all([
    new Promise<string[]>((resolve) => {
      chrome!.permissions!.getAll((perms) => resolve(perms.origins ?? []));
    }),
    readPlatformTags(),
  ]);
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
  return result;
}

chrome?.permissions?.onAdded?.addListener((perms) => {
  for (const origin of perms.origins ?? []) void registerContentScriptForOrigin(origin);
  void publishExtraHostsByPlatform();
});
chrome?.permissions?.onRemoved?.addListener((perms) => {
  for (const origin of perms.origins ?? []) void unregisterContentScriptForOrigin(origin);
  void publishExtraHostsByPlatform();
});
// Une étiquette posée ou corrigée dans la page d'options doit republier la répartition :
// la permission, elle, n'a pas bougé, donc aucun `onAdded`/`onRemoved` ne se déclenche.
chrome?.storage?.onChanged?.addListener((changes, areaName) => {
  if ((areaName === 'local' && HOST_PLATFORMS_KEY in changes) || areaName === 'managed') {
    void publishExtraHostsByPlatform();
  }
});
void syncContentScriptsWithGrantedPermissions();
void publishExtraHostsByPlatform();
