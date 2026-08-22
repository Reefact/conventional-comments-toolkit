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
    };
  };
} | undefined;

function refreshHosts(): void {
  const list = document.getElementById('host-list');
  if (!list || !chrome?.permissions) return;
  chrome.permissions.getAll((perms) => {
    list.textContent = '';
    for (const origin of perms.origins ?? []) {
      const li = document.createElement('li');
      li.textContent = origin;
      list.appendChild(li);
    }
  });
}

document.getElementById('host-add')?.addEventListener('click', () => {
  const input = document.getElementById('host-input') as HTMLInputElement | null;
  const host = input?.value.trim();
  if (!host || !chrome?.permissions) return;
  chrome.permissions.request({ origins: [`https://${host}/*`] }, () => refreshHosts());
});

const language = document.getElementById('language') as HTMLSelectElement | null;
chrome?.storage?.sync?.get(['language'], (items) => {
  if (language && typeof items['language'] === 'string') language.value = items['language'];
});
language?.addEventListener('change', () => {
  chrome?.storage?.sync?.set({ language: language.value || null });
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

refreshHosts();
