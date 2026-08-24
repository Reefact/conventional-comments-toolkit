// Service worker MV3 (event page sur Firefox — §10, Compatibilité). Trois rôles :
// répondre aux demandes de lecture de configuration des scripts de contenu quand la
// permission d'hôte vit ici, ENREGISTRER DYNAMIQUEMENT le script de contenu sur les
// hôtes accordés via `optional_host_permissions` (§2, §A.4, §B.4), et ouvrir la page
// d'options au clic sur l'icône de la barre d'outils.
//
// `content_scripts.matches` du manifeste est statique et ne liste que github.com : sans
// ce second rôle, accorder la permission sur dev.azure.com ou un GHES depuis la page
// d'options n'injecterait le script NULLE PART — l'adaptateur AzDO existe et est testé,
// mais resterait mort sur toute plateforme réelle. Aucun test unitaire ne peut le voir :
// tous instancient l'adaptateur directement, en court-circuitant ce mécanisme
// d'activation. Aucun secret, aucun jeton (§10).

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

chrome?.permissions?.onAdded?.addListener((perms) => {
  for (const origin of perms.origins ?? []) void registerContentScriptForOrigin(origin);
});
chrome?.permissions?.onRemoved?.addListener((perms) => {
  for (const origin of perms.origins ?? []) void unregisterContentScriptForOrigin(origin);
});
void syncContentScriptsWithGrantedPermissions();
