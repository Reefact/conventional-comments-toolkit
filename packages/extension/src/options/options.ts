// Page d'options : demande d'optional_host_permissions (§A.4, §B.4), préférences locales
// limitées (§8.1.2 — jamais le mode ni les labels), affichage de l'état dégradé (§5.4)
// et du journal local de dégradation de sélecteurs (§9.4).

import {
  HOST_PLATFORMS_KEY,
  hostnameOf,
  inferPlatform,
  parseManagedHostTags,
  type HostPlatform,
} from '../host-platform.js';

interface ChromePermissions {
  request: (perms: { origins: string[] }, cb: (granted: boolean) => void) => void;
  getAll: (cb: (perms: { origins?: string[] }) => void) => void;
}

declare const chrome: {
  permissions?: ChromePermissions;
  storage?: {
    sync?: {
      get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>) => void;
    };
    local?: {
      get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, cb?: () => void) => void;
    };
    managed?: { get: (cb: (items: Record<string, unknown>) => void) => void };
  };
} | undefined;

const PLATFORM_LABELS: Record<HostPlatform, string> = {
  github: 'GitHub Enterprise Server / GHE Cloud',
  azdo: 'Azure DevOps Server',
  config: "Configuration d'organisation uniquement",
};

function readHostPlatforms(): Promise<Record<string, HostPlatform>> {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve({});
    chrome.storage.local.get([HOST_PLATFORMS_KEY], (items) => {
      resolve((items[HOST_PLATFORMS_KEY] as Record<string, HostPlatform> | undefined) ?? {});
    });
  });
}

/** Étiquettes poussées par la politique d'entreprise. Cette page DOIT les lire — et pas
 * seulement la carte locale : un hôte classé par la politique s'afficherait sinon comme
 * « plateforme non précisée », et le sélecteur de rattrapage proposé n'écrirait qu'une
 * valeur locale que `readPlatformTags()` (background.ts) laisse justement la politique
 * écraser. La correction offerte serait donc sans effet (revue Codex, PR #29). */
function readManagedHostPlatforms(): Promise<Record<string, HostPlatform>> {
  return new Promise((resolve) => {
    if (!chrome?.storage?.managed) return resolve({});
    try {
      chrome.storage.managed.get((items) => resolve(parseManagedHostTags(items?.['allowedHosts'])));
    } catch {
      resolve({});
    }
  });
}

/** File d'attente d'un seul écrivain : deux classements enchaînés sans attendre auraient
 * chacun lu la même carte d'origine puis écrit leur propre copie, la seconde écrasant la
 * première (revue Codex, PR #29). Sérialiser sur une promesse partagée garantit que
 * chaque lecture-modification-écriture voit le résultat de la précédente. */
let writeQueue: Promise<unknown> = Promise.resolve();

function setHostPlatform(host: string, platform: HostPlatform): Promise<void> {
  const next = writeQueue.then(async () => {
    if (!chrome?.storage?.local) return;
    const tags = await readHostPlatforms();
    await new Promise<void>((resolve) => {
      chrome!.storage!.local!.set({ [HOST_PLATFORMS_KEY]: { ...tags, [host]: platform } }, () =>
        resolve()
      );
    });
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

/** github.com est couvert par `content_scripts` (§2) et jamais renvoyé par
 * `chrome.permissions.getAll()` en tant qu'octroi optionnel : rien à étiqueter pour lui. */
async function refreshHosts(): Promise<void> {
  const list = document.getElementById('host-list');
  if (!list || !chrome?.permissions) return;
  const [perms, localTags, managedTags] = await Promise.all([
    new Promise<{ origins?: string[] }>((resolve) => chrome!.permissions!.getAll(resolve)),
    readHostPlatforms(),
    readManagedHostPlatforms(),
  ]);
  list.textContent = '';
  for (const origin of perms.origins ?? []) {
    const host = hostnameOf(origin);
    const li = document.createElement('li');
    if (!host) {
      li.textContent = origin;
      list.appendChild(li);
      continue;
    }
    // Même préséance qu'au calcul de la répartition (background.ts) : la politique prime.
    // L'afficher en lecture seule, car aucune correction locale ne pourrait la changer.
    const fromPolicy = managedTags[host];
    if (fromPolicy) {
      li.textContent = `${host} — ${PLATFORM_LABELS[fromPolicy] ?? fromPolicy} (politique d'entreprise)`;
      list.appendChild(li);
      continue;
    }
    const known = localTags[host];
    if (known) {
      // `config` est une classification délibérée, pas une absence : l'afficher comme
      // telle, sans la renvoyer au rattrapage à chaque rafraîchissement (revue Codex).
      li.textContent = `${host} — ${PLATFORM_LABELS[known] ?? known}`;
      list.appendChild(li);
      continue;
    }
    // Octroi antérieur à cette étiquette (ou jamais confirmé) : ni GithubClientAdapter ni
    // AzdoClientAdapter ne reconnaît ce domaine tant qu'il n'est pas associé (§2). Un
    // sélecteur de rattrapage évite d'exiger un nouveau geste `permissions.request`.
    li.append(`${host} — plateforme non précisée : `);
    const select = document.createElement('select');
    for (const [value, label] of Object.entries(PLATFORM_LABELS)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    }
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = 'Confirmer';
    confirm.addEventListener('click', () => {
      void setHostPlatform(host, select.value as HostPlatform).then(() => void refreshHosts());
    });
    li.append(select, confirm);
    list.appendChild(li);
  }
}

const hostInput = document.getElementById('host-input') as HTMLInputElement | null;
const platformSelect = document.getElementById('host-platform') as HTMLSelectElement | null;
const addState = document.getElementById('host-add-state');

hostInput?.addEventListener('input', () => {
  if (!platformSelect || platformSelect.value !== '') return; // ne pas écraser un choix fait
  const inferred = inferPlatform(hostnameOf(hostInput.value) ?? '');
  if (inferred) platformSelect.value = inferred;
});

document.getElementById('host-add')?.addEventListener('click', () => {
  // Canonicaliser AVANT de demander la permission ET d'écrire l'étiquette : le navigateur
  // normalise l'origine accordée (casse, IDN), et une clé stockée sous la saisie brute
  // (`GHES.Example.Corp`) ne serait plus jamais retrouvée (revue Codex, PR #29).
  const host = hostnameOf(hostInput?.value ?? '');
  if (!chrome?.permissions) return;
  if (!host) {
    if (addState) addState.textContent = 'Domaine invalide.';
    return;
  }
  // Aucun repli implicite : sans choix explicite, on ne devine pas. Un défaut silencieux
  // étiquetait un domaine Azure DevOps en `github`, et un repli sur `config` n'activerait
  // aucun adaptateur — deux façons de casser l'installation sans rien dire.
  const platform = platformSelect?.value as HostPlatform | '' | undefined;
  if (!platform) {
    if (addState) addState.textContent = 'Choisissez la plateforme servie par ce domaine.';
    platformSelect?.focus();
    return;
  }
  chrome.permissions.request({ origins: [`https://${host}/*`] }, (granted) => {
    if (!granted) {
      if (addState) addState.textContent = 'Permission refusée.';
      return;
    }
    void setHostPlatform(host, platform).then(() => {
      if (addState) addState.textContent = '';
      void refreshHosts();
    });
  });
});

const language = document.getElementById('language') as HTMLSelectElement | null;
chrome?.storage?.sync?.get(['language'], (items) => {
  if (language && typeof items['language'] === 'string') language.value = items['language'];
});
language?.addEventListener('change', () => {
  chrome?.storage?.sync?.set({ language: language.value || null });
});

// Raccourcis directs (§5.2) — préférence locale (§8.1.2), format « Alt+I=issue » par
// ligne ; « Alt+I= » sans label désactive le raccourci par défaut. La clé stockée est
// celle que le script de contenu lit (`directShortcuts`).
const shortcutsArea = document.getElementById('direct-shortcuts') as HTMLTextAreaElement | null;
const shortcutsState = document.getElementById('direct-shortcuts-state');
chrome?.storage?.sync?.get(['directShortcuts'], (items) => {
  const stored = items['directShortcuts'];
  if (shortcutsArea && stored && typeof stored === 'object' && !Array.isArray(stored)) {
    shortcutsArea.value = Object.entries(stored as Record<string, unknown>)
      .map(([combo, label]) => `${combo}=${String(label)}`)
      .join('\n');
  }
});
document.getElementById('direct-shortcuts-save')?.addEventListener('click', () => {
  if (!shortcutsArea) return;
  const table: Record<string, string> = {};
  const rejected: string[] = [];
  for (const rawLine of shortcutsArea.value.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    const m = /^alt\+([a-z])\s*=\s*([a-z-]*)$/i.exec(line);
    if (m) table[`Alt+${m[1]!.toUpperCase()}`] = m[2]!.toLowerCase();
    else rejected.push(line);
  }
  chrome?.storage?.sync?.set({ directShortcuts: table });
  if (shortcutsState) {
    shortcutsState.textContent =
      rejected.length === 0
        ? 'Enregistré.'
        : `Enregistré — lignes ignorées : ${rejected.join(' ; ')}`;
  }
});

// État dégradé (§5.4, §9.2.3) et journal de dégradation de sélecteurs (§9.4).
chrome?.storage?.local?.get(['degradedState', 'selectorFailures'], (items) => {
  const degraded = document.getElementById('degraded-state');
  if (degraded) {
    degraded.textContent = items['degradedState']
      ? `Configuration non lue (${String(items['degradedState'])}) : l'extension assiste sans bloquer.`
      : 'Configuration lue normalement.';
    degraded.className = items['degradedState'] ? 'degraded' : '';
  }
  const log = document.getElementById('selector-log');
  if (log) {
    const failures = (items['selectorFailures'] as { chain: string; at: string }[] | undefined) ?? [];
    log.textContent =
      failures.length === 0
        ? 'Aucune dégradation de sélecteur enregistrée.'
        : failures.map((f) => `${f.at} — ${f.chain}`).join('\n');
  }
});

void refreshHosts();
