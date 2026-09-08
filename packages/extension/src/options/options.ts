// Page d'options : demande d'optional_host_permissions (§A.4, §B.4), préférences locales
// limitées (§8.1.2 — jamais le mode ni les labels), affichage de l'état dégradé (§5.4)
// et du journal local de dégradation de sélecteurs (§9.4).
//
// L'écran des domaines tient en quatre zones, et l'ordre raconte le cycle de vie d'un accès :
//   1. DOMAINES CONNUS — catalogue de domaines dont l'adresse ET la plateforme sont déjà
//      connues, donc autorisés et classés d'un seul clic.
//   2. AUTRES DOMAINES — saisie libre, plateforme choisie AVANT l'octroi.
//   3. DOMAINES CONFIGURÉS — ce qui est accordé ET classé ; on n'y modifie plus rien, on retire.
//   4. DOMAINES NON CONFIGURÉS — accordés hors de cet écran, donc sans plateforme. Masquée
//      tant qu'elle est vide, parce que les zones 1 et 2 ne peuvent pas la remplir : elles
//      classent toujours dans le même geste qu'elles autorisent.
//
// La zone 4 n'est pas un ornement défensif : `chrome://extensions` → « Accès au site »
// laisse ajouter un domaine sans passer par ici, et l'extension y resterait alors inerte
// (`selectPlatform()` n'active rien sans étiquette) sans que rien ne l'explique.

import { TELEMETRY_CONSENT_KEY, managedEndpoint, parseConsent } from '../telemetry.js';
import { pageKey, pageMark } from '../page-mark.js';
import { ui } from '../ui/strings.js';
import { applyStaticStrings, currentLanguage } from './i18n.js';
import { maybeStartTour, startTour } from './tour.js';
import {
  CLOUD_PLATFORMS,
  HOST_PLATFORMS_KEY,
  hostnameOf,
  inferPlatform,
  parseManagedHostTags,
  type HostPlatform,
} from '../host-platform.js';

interface ChromePermissions {
  request: (perms: { origins: string[] }, cb: (granted: boolean) => void) => void;
  remove: (perms: { origins: string[] }, cb: (removed: boolean) => void) => void;
  getAll: (cb: (perms: { origins?: string[] }) => void) => void;
}

declare const chrome: {
  permissions?: ChromePermissions;
  runtime?: { lastError?: { message?: string } | null };
  storage?: {
    sync?: {
      get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, cb?: () => void) => void;
    };
    local?: {
      get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, cb?: () => void) => void;
      remove: (keys: string[], cb?: () => void) => void;
    };
    managed?: { get: (cb: (items: Record<string, unknown>) => void) => void };
    onChanged?: {
      addListener: (
        cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
      ) => void;
    };
  };
} | undefined;

/** Chaque libellé couvre DEUX situations, et le dit, parce que la deuxième n'a plus de
 * chemin à elle : le catalogue de sites cloud ne propose que `dev.azure.com`, une
 * organisation historique `contoso.visualstudio.com` passant désormais par la saisie d'un
 * domaine. Elle y trouvait « Azure DevOps Server », ce qu'elle n'est pas — c'est du cloud
 * Microsoft, sous son ancien nom. L'étiquette posée, elle, était déjà la bonne (`azdo`,
 * même adaptateur) : seul le libellé mentait, et il suffisait pour ne pas se reconnaître. */
/** Langue servie à CETTE page. Une variable de module plutôt qu'un paramètre traversant
 * chaque fonction de rendu : elle est résolue une fois, avant le premier rendu, et ne change
 * plus tant que la page vit — la modifier depuis le menu recharge la page. `en` d'ici là,
 * pour que rien n'affiche une clé brute si un rendu partait trop tôt. */
let lang = 'en';

/** Une FONCTION et non plus une table figée : les libellés se lisent maintenant dans le
 * catalogue, donc au moment du rendu — une table constante aurait gelé la langue à l'import
 * du module, avant que `lang` ne soit résolue. */
const PLATFORM_LABEL_KEYS: Record<HostPlatform, string> = {
  github: 'options.platform.github',
  azdo: 'options.platform.azdo',
  config: 'options.platform.config',
};

function platformLabel(platform: HostPlatform): string {
  return ui(lang, PLATFORM_LABEL_KEYS[platform] ?? platform);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(viewBox: string, ...paths: { d: string; stroke?: boolean }[]): SVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('fill', paths[0]?.stroke ? 'none' : 'currentColor');
  if (paths[0]?.stroke) {
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
  }
  for (const { d } of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    el.appendChild(path);
  }
  return el;
}

/** Marque GitHub — tracé d'Octicons (`mark-github`), la forme officielle. Les autres
 * plateformes n'ont pas leur logo ici : un glyphe approximatif dessiné de mémoire aurait
 * l'air faux là où un symbole neutre est simplement neutre. `∞` pour Azure DevOps
 * n'est d'ailleurs pas un pis-aller — leur propre marque EST un infini stylisé. */
function platformGlyph(platform: HostPlatform | null): Node {
  if (platform === 'github') {
    return svg(
      '0 0 16 16',
      {
        d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z',
      }
    );
  }
  if (platform === 'azdo') return document.createTextNode('∞');
  if (platform === 'config') {
    return svg('0 0 24 24', { d: 'M6 3h8l4 4v14H6z', stroke: true }, { d: 'M9 12h6', stroke: true }, { d: 'M9 16h6', stroke: true });
  }
  return document.createTextNode('?');
}

function lockIcon(): SVGElement {
  return svg('0 0 24 24', { d: 'M5 11h14v9H5zM8 11V7a4 4 0 0 1 8 0v4', stroke: true });
}

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
 * non configuré, et la zone 4 proposerait une correction locale que `readPlatformTags()`
 * (background.ts) laisse justement la politique écraser. La correction offerte serait donc
 * sans effet (revue Codex, PR #29). */
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

/** Purge l'étiquette locale d'un hôte — appelé après révocation de la permission, pour ne
 * pas laisser une entrée orpheline dans `HOST_PLATFORMS_KEY` : sans effet fonctionnel tant
 * que l'hôte n'est pas accordé (il n'apparaît plus dans `refreshHosts`), mais elle
 * réapparaîtrait telle quelle si la même personne réautorisait le même hôte plus tard. */
function removeHostPlatform(host: string): Promise<void> {
  const next = writeQueue.then(async () => {
    if (!chrome?.storage?.local) return;
    const tags = await readHostPlatforms();
    if (!(host in tags)) return;
    const { [host]: _removed, ...rest } = tags;
    await new Promise<void>((resolve) => {
      chrome!.storage!.local!.set({ [HOST_PLATFORMS_KEY]: rest }, () => resolve());
    });
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

/** Révoque la permission d'hôte accordée à `origin` et purge l'étiquette de son hôte.
 * `chrome.permissions.onRemoved` (background.ts) désenregistre le script de contenu et
 * republie `extraHostsByPlatform` en réaction — cette fonction ne fait qu'obtenir la
 * révocation ; elle ne duplique pas ce nettoyage.
 *
 * L'origine passée est celle que `getAll()` a rendue, jamais une chaîne reconstruite : un
 * joker (`https://*.visualstudio.com/*`) ne se retrouve pas à partir de son seul nom
 * d'hôte, et le reconstruire en `https://<hôte>/*` demanderait la révocation d'une origine
 * qui n'a jamais été accordée. */
function removeHost(origin: string, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!chrome?.permissions) return resolve(false);
    chrome.permissions.remove({ origins: [origin] }, (removed) => {
      // `lastError` est LU même quand on n'en fait rien d'autre : ne pas le consulter fait
      // journaliser un « Unchecked runtime.lastError » par le navigateur.
      const failed = Boolean(chrome?.runtime?.lastError) || removed === false;
      // Purger l'étiquette d'une permission TOUJOURS accordée serait le pire des deux
      // mondes : l'accès resterait, l'adaptateur s'éteindrait, et l'hôte réapparaîtrait
      // parmi les domaines non configurés — l'écran affirmant avoir fait ce qu'il n'a pas
      // fait. Une révocation refusée ne change donc rien du tout (revue Codex, PR #60).
      if (failed) return resolve(false);
      void removeHostPlatform(host).then(() => resolve(true));
    });
  });
}

function makeButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/** Bouton texte, jamais une icône seule — ni compréhensible sans style, ni lisible par un
 * lecteur d'écran. Absent des hôtes classés par politique d'entreprise : révoquer une
 * permission imposée par l'administration ne relève pas de cet écran. */
function makeRemoveButton(origin: string, host: string): HTMLButtonElement {
  const button = makeButton(ui(lang, 'options.host.remove'), 'btn btn-quiet', () => {
    void removeHost(origin, host).then((removed) => {
      if (removed) return void refreshHosts();
      // Pas de rafraîchissement : rien n'a changé, et la ligne doit rester sous les yeux
      // avec la raison. Un `refreshHosts()` effacerait justement ce message.
      const state = button.closest('section.panel')?.querySelector('.remove-state');
      if (state) {
        state.textContent = ui(lang, 'options.host.remove.refused', { host });
      }
    });
  });
  return button;
}

function makeKindBadge(platform: HostPlatform | null, isCloud: boolean): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `kind ${isCloud ? 'cloud' : 'selfhost'}`;
  badge.appendChild(platformGlyph(platform));
  return badge;
}

/** Une carte de la zone 1 : le clic demande la permission ET pose l'étiquette. Les deux
 * vont ensemble — c'est ce qui garantit qu'un site cloud n'atterrit jamais en zone 4.
 *
 * `chrome.permissions.request()` est appelé DIRECTEMENT dans le gestionnaire de clic, sans
 * `await` avant lui : la demande doit rester rattachée au geste de l'utilisateur. */
function makeCloudCard(entry: (typeof CLOUD_PLATFORMS)[number]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'cloud-card';

  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.appendChild(platformGlyph(entry.platform));

  const info = document.createElement('div');
  info.className = 'info';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = entry.label;
  const domain = document.createElement('div');
  domain.className = 'domain';
  domain.textContent = hostnameOf(entry.origin) ?? entry.origin;
  info.append(name, domain);

  const activate = makeButton(ui(lang, 'options.host.activate'), 'btn btn-p', () => {
    if (!chrome?.permissions) return;
    chrome.permissions.request({ origins: [entry.origin] }, (granted) => {
      if (!granted) return;
      const host = hostnameOf(entry.origin);
      if (!host) return;
      void setHostPlatform(host, entry.platform).then(() => void refreshHosts());
    });
  });

  card.append(glyph, info, activate);
  return card;
}

/** Une ligne de la zone 4 : la permission EXISTE DÉJÀ, seule l'étiquette manque. « Activer »
 * n'appelle donc que `setHostPlatform()` — demander à nouveau la permission ferait
 * apparaître une invite du navigateur pour un accès déjà accordé. */
function makeUnconfiguredRow(origin: string, host: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'host-row';

  const body = document.createElement('div');
  body.className = 'body';
  const name = document.createElement('div');
  name.className = 'host';
  name.textContent = host;

  const controls = document.createElement('div');
  controls.className = 'catch-up';
  const select = document.createElement('select');
  select.setAttribute('aria-label', ui(lang, 'options.host.platform.aria', { host }));
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.selected = true;
  placeholder.textContent = ui(lang, 'options.other.platform.none');
  select.appendChild(placeholder);
  for (const value of Object.keys(PLATFORM_LABEL_KEYS) as HostPlatform[]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = platformLabel(value);
    select.appendChild(opt);
  }
  const activate = makeButton(ui(lang, 'options.host.activate'), 'btn btn-p', () => {
    const platform = select.value as HostPlatform | '';
    if (!platform) return void select.focus();
    void setHostPlatform(host, platform).then(() => void refreshHosts());
  });
  controls.append(select, activate);

  body.append(name, controls);
  li.append(makeKindBadge(null, false), body, makeRemoveButton(origin, host));
  return li;
}

function makeConfiguredRow(
  origin: string,
  host: string,
  platform: HostPlatform,
  fromPolicy: boolean,
  isCloud: boolean
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'host-row';

  const body = document.createElement('div');
  body.className = 'body';
  const name = document.createElement('div');
  name.className = 'host';
  name.textContent = host;
  const label = document.createElement('div');
  label.className = 'platform';
  label.textContent = platformLabel(platform);
  body.append(name, label);

  li.append(makeKindBadge(platform, isCloud), body);

  if (fromPolicy) {
    // La politique prime au calcul de la répartition (background.ts) : l'afficher en
    // lecture seule, puisque aucune action locale ne pourrait la défaire.
    const lock = document.createElement('span');
    lock.className = 'lock';
    lock.append(lockIcon(), document.createTextNode(` ${ui(lang, 'options.host.managed')}`));
    li.append(lock);
  } else {
    li.append(makeRemoveButton(origin, host));
  }
  return li;
}

async function refreshHosts(): Promise<void> {
  const cloudList = document.getElementById('cloud-list');
  const cloudEmpty = document.getElementById('cloud-empty');
  const hostList = document.getElementById('host-list');
  const hostEmpty = document.getElementById('host-empty');
  const unconfiguredPanel = document.getElementById('unconfigured-panel');
  const unconfiguredList = document.getElementById('unconfigured-list');
  if (!chrome?.permissions) return;

  const [perms, localTags, managedTags] = await Promise.all([
    new Promise<{ origins?: string[] }>((resolve) => chrome!.permissions!.getAll(resolve)),
    readHostPlatforms(),
    readManagedHostPlatforms(),
  ]);
  const origins = perms.origins ?? [];
  const grantedHosts = new Set(origins.map((o) => hostnameOf(o)).filter((h): h is string => h !== null));
  const cloudHosts = new Set(
    CLOUD_PLATFORMS.map((entry) => hostnameOf(entry.origin)).filter((h): h is string => h !== null)
  );

  // Zone 1 — ce que le catalogue propose ET que la personne n'a pas encore accordé. Un site
  // activé en disparaît de lui-même : la liste se déduit de l'état, elle ne se déplace pas.
  if (cloudList) {
    cloudList.textContent = '';
    const available = CLOUD_PLATFORMS.filter((entry) => {
      const host = hostnameOf(entry.origin);
      return host !== null && !grantedHosts.has(host);
    });
    for (const entry of available) cloudList.appendChild(makeCloudCard(entry));
    if (cloudEmpty) cloudEmpty.hidden = available.length > 0;
  }

  // Zones 3 et 4 — un même parcours, séparé par la seule question qui compte : cet hôte
  // a-t-il une plateforme ?
  if (hostList) hostList.textContent = '';
  if (unconfiguredList) unconfiguredList.textContent = '';
  let configuredCount = 0;
  let unconfiguredCount = 0;

  for (const origin of origins) {
    const host = hostnameOf(origin);
    if (!host) continue;
    // Même préséance qu'au calcul de la répartition (background.ts) : la politique prime.
    const fromPolicy = managedTags[host];
    const platform = fromPolicy ?? localTags[host];
    if (platform) {
      configuredCount++;
      hostList?.appendChild(
        makeConfiguredRow(origin, host, platform, fromPolicy !== undefined, cloudHosts.has(host))
      );
    } else {
      unconfiguredCount++;
      unconfiguredList?.appendChild(makeUnconfiguredRow(origin, host));
    }
  }

  if (hostEmpty) hostEmpty.hidden = configuredCount > 0;
  if (unconfiguredPanel) unconfiguredPanel.hidden = unconfiguredCount === 0;
}

const hostInput = document.getElementById('host-input') as HTMLInputElement | null;
const platformSelect = document.getElementById('host-platform') as HTMLSelectElement | null;
const addState = document.getElementById('host-add-state');

// Dernière valeur POSÉE PAR L'INFÉRENCE, pour la distinguer d'un choix humain. Sans cette
// distinction, la première version ne ré-inférait plus dès que le menu n'était plus vide :
// saisir `dev.azure.com` puis le remplacer par `acme.ghe.com` laissait `azdo` sélectionné,
// et l'hôte GitHub partait au mauvais adaptateur (revue Codex, PR #29). Une valeur inférée
// se corrige à chaque frappe ; une valeur choisie ne se touche plus.
let inferredValue: string | null = null;

platformSelect?.addEventListener('change', () => {
  inferredValue = null; // choix explicite : l'inférence ne reprend plus la main
});

hostInput?.addEventListener('input', () => {
  if (!platformSelect) return;
  if (platformSelect.value !== '' && platformSelect.value !== inferredValue) return;
  const inferred = inferPlatform(hostnameOf(hostInput.value) ?? '');
  // `''` quand plus rien n'est inférable : mieux vaut revenir au placeholder, qui force un
  // choix, que laisser l'inférence d'un hôte qu'on vient d'effacer.
  platformSelect.value = inferred ?? '';
  inferredValue = inferred;
});

document.getElementById('host-add')?.addEventListener('click', () => {
  // Canonicaliser AVANT de demander la permission ET d'écrire l'étiquette : le navigateur
  // normalise l'origine accordée (casse, IDN), et une clé stockée sous la saisie brute
  // (`GHES.Example.Corp`) ne serait plus jamais retrouvée (revue Codex, PR #29).
  const host = hostnameOf(hostInput?.value ?? '');
  if (!chrome?.permissions) return;
  if (!host) {
    if (addState) addState.textContent = ui(lang, 'options.add.invalid');
    return;
  }
  // Aucun repli implicite : sans choix explicite, on ne devine pas. Un défaut silencieux
  // étiquetait un domaine Azure DevOps en `github`, et un repli sur `config` n'activerait
  // aucun adaptateur — deux façons de casser l'installation sans rien dire.
  const platform = platformSelect?.value as HostPlatform | '' | undefined;
  if (!platform) {
    if (addState) addState.textContent = ui(lang, 'options.add.no-platform');
    platformSelect?.focus();
    return;
  }
  chrome.permissions.request({ origins: [`https://${host}/*`] }, (granted) => {
    if (!granted) {
      if (addState) addState.textContent = ui(lang, 'options.add.refused');
      return;
    }
    void setHostPlatform(host, platform).then(() => {
      if (addState) addState.textContent = '';
      if (hostInput) hostInput.value = '';
      if (platformSelect) platformSelect.value = '';
      inferredValue = null;
      void refreshHosts();
    });
  });
});

const language = document.getElementById('language') as HTMLSelectElement | null;
chrome?.storage?.sync?.get(['language'], (items) => {
  if (language && typeof items['language'] === 'string') language.value = items['language'];
});
language?.addEventListener('change', () => {
  // Recharger, et non réappliquer. Cet écran affichait du français en dur tout en proposant
  // un réglage de langue qu'il n'appliquait qu'aux autres : le corriger pour qu'il ne
  // s'applique pas à lui-même TOUT DE SUITE serait la même faute d'un cran plus loin — on
  // choisit `en`, et la page qui vient de recevoir le réglage reste française (revue Reefact
  // et Codex, PR #62).
  //
  // Le rechargement plutôt qu'un rendu différentiel parce que la langue traverse TOUT :
  // chaînes statiques, lignes d'hôtes construites par le code, libellés de plateforme,
  // messages d'état, et jusqu'aux textes d'une visite en cours. Une re-application manuelle
  // devrait les énumérer, donc en oublier un jour — et un écran de réglages n'a rien à
  // perdre à se recharger, tout y étant déjà persisté.
  //
  // Le rechargement attend le rappel d'écriture : le partir sans lui ferait relire la
  // préférence précédente une fois sur deux, ce qui se lirait comme un réglage qui ne
  // « prend » pas.
  const sync = chrome?.storage?.sync;
  if (!sync) return location.reload();
  sync.set({ language: language.value || null }, () => location.reload());
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
        ? ui(lang, 'options.shortcuts.saved')
        : ui(lang, 'options.shortcuts.saved.partial', { rejected: rejected.join(' ; ') });
  }
});

// Télémétrie (§10) — le troisième verrou décrit en tête de `telemetry.ts` : le consentement
// de la PERSONNE, qu'aucune configuration ne peut donner à sa place.
//
// Le point de collecte est lu ICI, dans la politique d'entreprise, au même endroit que le
// script de contenu. Il ne transite plus par une clé partagée que chaque onglet réécrivait :
// cette clé faisait que la case pouvait consentir à une adresse qu'elle n'avait pas
// affichée, et qu'un onglet dont la télémétrie était désactivée effaçait l'adresse — donc la
// possibilité de révoquer — pour tous les autres (revue Codex, PR #31).
const telemetryOptIn = document.getElementById('telemetry-opt-in') as HTMLInputElement | null;
const telemetryLine = document.getElementById('telemetry-endpoint');

/** Le point de collecte réellement affiché, et donc le seul auquel cocher puisse consentir. */
let displayedEndpoint: string | null = null;

function renderTelemetry(endpoint: string | null, consented: string | null): void {
  displayedEndpoint = endpoint;
  if (telemetryOptIn) {
    telemetryOptIn.checked = endpoint !== null && consented === endpoint;
    // La case reste ACTIONNABLE tant qu'un consentement est stocké, même sans point de
    // collecte déclaré : sans quoi une politique retirée emprisonnerait l'accord donné —
    // plus rien pour le révoquer, alors que des onglets ouverts peuvent encore émettre.
    telemetryOptIn.disabled = endpoint === null && consented === null;
  }
  if (!telemetryLine) return;
  if (endpoint === null && consented !== null) {
    telemetryLine.textContent = ui(lang, 'options.telemetry.endpoint.revoked-only', { consented });
  } else if (endpoint === null) {
    telemetryLine.textContent = ui(lang, 'options.telemetry.endpoint.none');
  } else if (consented !== null && consented !== endpoint) {
    telemetryLine.textContent = ui(lang, 'options.telemetry.endpoint.moved', { endpoint, consented });
  } else {
    // « Politique d'entreprise » et non « configuration » : depuis que le point de collecte
    // vient de ce seul canal, cette phrase est vraie. Elle ne l'était pas quand le fichier
    // d'un dépôt pouvait le fournir — l'écran censé protéger d'un dépôt hostile certifiait
    // alors que son collecteur venait de l'organisation (revue Codex, PR #31).
    telemetryLine.textContent = ui(lang, 'options.telemetry.endpoint.declared', { endpoint });
  }
}

function refreshTelemetry(): void {
  const readPolicy = new Promise<string | null>((resolve) => {
    if (!chrome?.storage?.managed) return resolve(null);
    try {
      chrome.storage.managed.get((items) => resolve(managedEndpoint(items?.['telemetry'])));
    } catch {
      resolve(null);
    }
  });
  chrome?.storage?.local?.get([TELEMETRY_CONSENT_KEY], (items) => {
    const consented = parseConsent(items[TELEMETRY_CONSENT_KEY])?.endpoint ?? null;
    void readPolicy.then((endpoint) => renderTelemetry(endpoint, consented));
  });
}

telemetryOptIn?.addEventListener('change', () => {
  // `displayedEndpoint`, jamais une relecture : on consent à ce qui était sous les yeux.
  const endpoint = displayedEndpoint;
  // Décocher retire l'accord même quand plus aucun point de collecte n'est déclaré — c'est
  // le cas où la révocation compte le plus. `null` et non un booléen à `false` : retirer son
  // accord, c'est effacer À QUOI l'on avait consenti. Les onglets ouverts écoutent cette clé
  // et se désarment aussitôt.
  const consent = telemetryOptIn.checked && endpoint !== null ? { endpoint } : null;
  chrome?.storage?.local?.set({ [TELEMETRY_CONSENT_KEY]: consent });
  renderTelemetry(endpoint, consent?.endpoint ?? null);
});

// La politique ou le consentement ont changé ailleurs : réafficher, pour que la case et la
// ligne qui l'explique ne mentent jamais sur ce à quoi un clic consentirait.
//
// L'état, de même : le journal et l'état dégradé sont écrits par les ONGLETS, pas par cette
// page. Lus une seule fois au chargement, ils se figeaient — un onglet pouvait journaliser une
// dégradation pendant que cet écran continuait d'afficher « aucune », jusqu'à ce qu'on le
// recharge (revue Reefact, PR #70).
chrome?.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'managed' || (area === 'local' && TELEMETRY_CONSENT_KEY in changes)) refreshTelemetry();
  if (area === 'local' && ('selectorFailures' in changes || 'degradedState' in changes)) refreshStatus();
});

/** Une ligne d'état : la pastille porte le niveau, le texte porte le fait. */
function renderStatus(row: HTMLElement | null, text: string, degraded: boolean): void {
  if (!row) return;
  row.className = `status-row${degraded ? ' degraded' : ''}`;
  const span = row.querySelector('.status-text');
  if (span) span.textContent = text;
}

// État dégradé (§5.4, §9.2.3) et journal de dégradation de sélecteurs (§9.4).
function refreshStatus(): void {
    chrome?.storage?.local?.get(['degradedState', 'selectorFailures'], (items) => {
    const degradedState = items['degradedState'];
    renderStatus(
      document.getElementById('degraded-state'),
      degradedState
        ? ui(lang, 'options.status.degraded', { reason: String(degradedState) })
        : ui(lang, 'options.status.ok'),
      Boolean(degradedState)
    );

    const failures =
      (items['selectorFailures'] as { chain: string; at: string; url?: string }[] | undefined) ?? [];
    const log = document.getElementById('selector-log');
    renderStatus(
      log,
      failures.length === 0
        ? ui(lang, 'options.status.selectors.none')
        : ui(lang, 'options.status.selectors.some', { count: failures.length }),
      failures.length > 0
    );
    // Le détail sous la ligne, en monospace : ce sont des chaînes de sélecteurs, illisibles
    // en corps de texte, et sans intérêt tant qu'il n'y en a aucune.
    //
    // Le conteneur est REMPLACÉ, jamais complété. La version d'avant faisait `appendChild`
    // sur `.status-body`, ce qui tenait tant que ce rendu n'avait lieu qu'une fois : le
    // bouton d'effacement le rappelle, et comme le journal est alors vide, rien n'était
    // ajouté — l'ancien `<pre>` SURVIVAIT, affichant un journal fantôme sous la ligne qui
    // venait d'annoncer qu'il n'y en avait plus.
    const detail = document.getElementById('selector-log-detail');
    if (detail) {
      while (detail.firstChild) detail.removeChild(detail.firstChild);
      if (failures.length > 0) {
        detail.append(renderSelectorJournal(failures), renderSelectorLegend(), renderSelectorClear());
      }
    }
  });
}

/** Le journal, une ligne par entrée, précédée de la marque de sa page (§9.4).
 *
 * La marque se calcule sur la page NORMALISÉE — `?diff=split` et `#discussion_r1` ne font pas
 * deux pages —, tandis que le lien et l'info-bulle portent l'adresse ENTIÈRE relevée : la
 * marque répond « laquelle », le lien y emmène.
 *
 * Ce que la marque ne dit pas, et qu'il ne faut pas lui faire dire : le journal ne garde
 * qu'une ligne par chaîne (`appendToJournal`, dédupliqué par `chain`). La page affichée est
 * donc celle du dernier relevé de cette chaîne, jamais « la seule page où elle a échoué ».
 *
 * `createElement` + `textContent`, jamais d'`innerHTML` : ces valeurs viennent du stockage. */
function renderSelectorJournal(failures: { chain: string; at: string; url?: string }[]): HTMLElement {
  const pre = document.createElement('pre');
  failures.forEach((f, i) => {
    pre.append(renderPageMark(f.url), document.createTextNode(`  ${f.at} — ${f.chain}`));
    if (i < failures.length - 1) pre.append(document.createTextNode('\n'));
  });
  return pre;
}

/** La marque d'une entrée : un lien vers l'adresse relevée, ou un remplissage neutre.
 *
 * Le remplissage fait SIX caractères comme les marques, sinon la colonne se désaligne
 * exactement là où elle doit rester lisible — sur les entrées écrites avant que l'adresse ne
 * soit enregistrée.
 *
 * `pageKey` rend `null` sur tout ce qui n'est pas `http(s)` : c'est la liste blanche des
 * schémas, et elle vaut ici pour la fabrication du `href`. Un script de contenu ne s'exécute
 * que sur le web, mais cette valeur est relue du stockage, et un `href` fabriqué à partir de
 * données stockées se vérifie. */
function renderPageMark(url: string | undefined): HTMLElement {
  const page = url === undefined ? null : pageKey(url);
  if (page === null || url === undefined) {
    const none = document.createElement('span');
    none.className = 'page-mark-none';
    none.textContent = '······';
    none.title = ui(lang, 'options.status.selectors.page.unknown');
    return none;
  }
  const link = document.createElement('a');
  link.className = 'page-mark';
  link.textContent = pageMark(page);
  link.href = url;
  link.title = url;
  // Un nouvel onglet : la page d'options ne doit pas se perdre elle-même au clic.
  // `noreferrer` évite d'annoncer l'identifiant de l'extension au site ouvert.
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function renderSelectorLegend(): HTMLElement {
  const hint = document.createElement('p');
  hint.className = 'status-hint';
  hint.textContent = ui(lang, 'options.status.selectors.legend');
  return hint;
}

/** Vide le journal — et lui seul.
 *
 * PAS `degradedState` : cette ligne-là rapporte la dernière lecture de configuration, et la
 * remettre à « lue normalement » affirmerait une lecture qui n'a pas eu lieu.
 *
 * `remove` plutôt que `set({ selectorFailures: [] })` : c'est l'opération que « effacer »
 * désigne, et elle ne laisse pas une valeur pour dire qu'il n'y a rien. Ce qu'elle ne fait
 * PAS, parce que `chrome.storage` n'offre aucune écriture conditionnelle : gagner la course
 * contre un onglet dont `appendToJournal` serait entre sa lecture et son écriture. Le journal
 * réapparaîtrait alors avec l'entrée de cet onglet — c'est la même perte qu'assume
 * `storage.ts` pour un outil de diagnostic, pas un défaut que ce bouton introduit. */
function renderSelectorClear(): HTMLElement {
  return makeButton(ui(lang, 'options.status.selectors.clear'), 'btn btn-quiet', () => {
    chrome?.storage?.local?.remove(['selectorFailures'], () => refreshStatus());
  });
}
/** Démarrage. L'ordre n'est pas cosmétique : `lang` doit être posée AVANT le premier rendu,
 * sinon les chaînes construites par le code sortent en anglais sur une page française — le
 * genre d'incohérence qui se voit une fois sur deux, au rythme d'une course. Les blocs qui
 * ne font que câbler des écouteurs restent en tête de module : ils n'écrivent aucun texte. */
async function boot(): Promise<void> {
  lang = await currentLanguage();
  applyStaticStrings(document, lang);
  // TOUT rendu qui écrit du texte part d'ici, et pas d'un effet de bord d'import. Un test
  // de télémétrie a trouvé ce défaut dans la première version de ce démarrage : la ligne du
  // point de collecte se rendait depuis un rappel de `storage.managed` déclenché à
  // l'import, donc en anglais sur une page française, sans que rien ne le signale.
  refreshTelemetry();
  refreshStatus();
  await refreshHosts();
  // La visite APRÈS le rendu des hôtes : l'une de ses étapes vise « Domaines non
  // configurés », zone qui n'existe qu'une fois la liste construite. La lancer avant la
  // ferait sauter systématiquement, et c'est justement l'étape qui mérite d'être montrée.
  await maybeStartTour(document, lang);
}

// Rejouer la visite à la demande. Le drapeau « déjà vue » n'est PAS effacé au passage : il
// reste vrai pendant et après, ce qu'il doit être — la visite A été vue. L'effacer pour le
// reposer à la fin ne changerait rien, sinon d'ouvrir une fenêtre où un autre onglet de
// réglages la relancerait tout seul.
document.getElementById('tour-replay')?.addEventListener('click', () => {
  startTour(document, lang);
});

void boot();
