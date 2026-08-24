// Page d'options : demande d'optional_host_permissions (§A.4, §B.4), préférences locales
// limitées (§8.1.2 — jamais le mode ni les labels), affichage de l'état dégradé (§5.4)
// et du journal local de dégradation de sélecteurs (§9.4).

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
      set: (items: Record<string, unknown>) => void;
    };
  };
} | undefined;

const PLATFORM_LABELS: Record<string, string> = {
  github: 'GitHub Enterprise Server / GHE Cloud',
  azdo: 'Azure DevOps Server',
};

function hostnameOfOrigin(origin: string): string | null {
  try {
    return new URL(origin.replace(/\*$/, '')).hostname;
  } catch {
    return null;
  }
}

function readHostPlatforms(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve({});
    chrome.storage.local.get(['hostPlatforms'], (items) => {
      resolve((items['hostPlatforms'] as Record<string, string> | undefined) ?? {});
    });
  });
}

function setHostPlatform(host: string, platform: string): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve();
    readHostPlatforms().then((tags) => {
      const next = { ...tags };
      if (platform) next[host] = platform;
      else delete next[host];
      chrome!.storage!.local!.set({ hostPlatforms: next });
      resolve();
    });
  });
}

/** github.com est couvert par `content_scripts` (§2) et jamais renvoyé par
 * `chrome.permissions.getAll()` en tant qu'octroi optionnel : rien à étiqueter pour lui. */
async function refreshHosts(): Promise<void> {
  const list = document.getElementById('host-list');
  if (!list || !chrome?.permissions) return;
  const [perms, tags] = await Promise.all([
    new Promise<{ origins?: string[] }>((resolve) => chrome!.permissions!.getAll(resolve)),
    readHostPlatforms(),
  ]);
  list.textContent = '';
  for (const origin of perms.origins ?? []) {
    const host = hostnameOfOrigin(origin);
    const li = document.createElement('li');
    if (!host) {
      li.textContent = origin;
      list.appendChild(li);
      continue;
    }
    const known = tags[host];
    if (known) {
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
      void setHostPlatform(host, select.value).then(() => void refreshHosts());
    });
    li.append(select, confirm);
    list.appendChild(li);
  }
}

document.getElementById('host-add')?.addEventListener('click', () => {
  const input = document.getElementById('host-input') as HTMLInputElement | null;
  const platformSelect = document.getElementById('host-platform') as HTMLSelectElement | null;
  const host = input?.value.trim();
  if (!host || !chrome?.permissions) return;
  chrome.permissions.request({ origins: [`https://${host}/*`] }, (granted) => {
    if (!granted) return;
    void setHostPlatform(host, platformSelect?.value ?? '').then(() => void refreshHosts());
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
