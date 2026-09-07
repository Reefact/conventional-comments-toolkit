// @vitest-environment happy-dom
//
// La page d'options des hôtes, mesurée sur le VRAI `options.html` — jamais sur un fragment
// réécrit ici. C'est délibéré : les quatre zones ne vivent que dans l'accord entre le HTML
// (identifiants, panneaux masqués) et `options.ts` (ce qu'il y écrit). Un faux DOM
// paraphrasé validerait le code contre lui-même, et laisserait passer exactement la faute
// qu'on veut attraper — un `id` renommé d'un côté seulement.
//
// Les quatre zones, et la règle qui les sépare :
//   1. SITES CLOUD — le catalogue MOINS ce qui est déjà accordé.
//   2. DOMAINE AUTO-HÉBERGÉ — saisie libre (couvert par le smoke MV3 pour son défaut vide).
//   3. HÔTES CONFIGURÉS — accordé ET classé.
//   4. DOMAINES NON CONFIGURÉS — accordé SANS être classé ; masquée quand elle est vide.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_PLATFORMS, HOST_PLATFORMS_KEY } from '../src/host-platform.js';

// Chemin depuis la racine du dépôt, et non depuis `import.meta.url` : sous happy-dom,
// `import.meta.url` n'est pas une URL `file:` et `fileURLToPath` lève.
const OPTIONS_HTML = readFileSync(
  resolve(process.cwd(), 'packages/extension/src/options/options.html'),
  'utf8'
);

interface FakeChrome {
  granted: string[];
  local: Record<string, unknown>;
  managed: Record<string, unknown>;
  requested: string[][];
  removed: string[][];
  /** Ce que la prochaine demande de permission répondra — une personne peut refuser. */
  grantNext: boolean;
  /** Le navigateur refuse la révocation : `remove()` rappelle avec `false` et ne retire
   * rien. C'est ce qu'il fait d'une permission non retirable — imposée par une politique
   * d'entreprise, par exemple. */
  refuseRemoval: boolean;
}

function installPage(init: Partial<FakeChrome> = {}, language = 'fr'): FakeChrome {
  // Le corps du vrai document, scripts compris — `innerHTML` ne les exécute pas, et c'est
  // l'import du module, plus bas, qui joue le rôle de `options.js`.
  const body = /<body>([\s\S]*)<\/body>/.exec(OPTIONS_HTML)?.[1] ?? '';
  document.body.innerHTML = body;

  const state: FakeChrome = {
    granted: [],
    local: {},
    managed: {},
    requested: [],
    removed: [],
    grantNext: true,
    refuseRemoval: false,
    ...init,
  };

  (globalThis as { chrome?: unknown }).chrome = {
    permissions: {
      getAll: (cb: (p: { origins?: string[] }) => void) => cb({ origins: [...state.granted] }),
      request: (perms: { origins: string[] }, cb: (granted: boolean) => void) => {
        state.requested.push(perms.origins);
        if (state.grantNext) state.granted.push(...perms.origins);
        cb(state.grantNext);
      },
      remove: (perms: { origins: string[] }, cb: (removed: boolean) => void) => {
        state.removed.push(perms.origins);
        if (state.refuseRemoval) return cb(false); // refusé : rien n'est retiré
        state.granted = state.granted.filter((o) => !perms.origins.includes(o));
        cb(true);
      },
    },
    storage: {
      local: {
        get: (keys: string[], cb: (i: Record<string, unknown>) => void) => {
          const picked: Record<string, unknown> = {};
          for (const key of keys) if (key in state.local) picked[key] = state.local[key];
          cb(picked);
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(state.local, items);
          cb?.();
        },
      },
      // La page est bilingue (§10) : la langue est un ÉTAT du monde, pas un détail du faux.
      // Ces tests lisent des libellés français, ils doivent donc le DEMANDER — les laisser
      // dépendre de `navigator.language` ferait passer ou échouer la suite selon la machine.
      sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({ language }), set: () => {} },
      managed: { get: (cb: (i: Record<string, unknown>) => void) => cb(state.managed) },
      onChanged: { addListener: () => {} },
    },
  };
  return state;
}

async function loadOptions(): Promise<void> {
  await import('../src/options/options.js');
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Une zone se lit par son texte rendu, comme la personne la lit. */
function cloudNames(): string[] {
  return [...document.querySelectorAll('#cloud-list .cloud-card .name')].map((el) => el.textContent ?? '');
}
function configuredHosts(): string[] {
  return [...document.querySelectorAll('#host-list .host-row .host')].map((el) => el.textContent ?? '');
}
function unconfiguredHosts(): string[] {
  return [...document.querySelectorAll('#unconfigured-list .host-row .host')].map((el) => el.textContent ?? '');
}
function panelHidden(id: string): boolean {
  return (document.getElementById(id) as HTMLElement | null)?.hidden ?? false;
}
/** Le bouton d'une ligne, désigné par son libellé — pas par sa position. */
function buttonIn(root: Element | null, label: string): HTMLButtonElement | null {
  return (
    [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label) ?? null
  ) as HTMLButtonElement | null;
}

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.innerHTML = '';
});

describe('zone 1 — domaines connus : le catalogue moins ce qui est déjà accordé', () => {
  it('propose tout le catalogue quand rien n’est accordé', async () => {
    installPage();
    await loadOptions();
    expect(cloudNames()).toEqual(CLOUD_PLATFORMS.map((p) => p.label));
    expect(panelHidden('unconfigured-panel')).toBe(true); // rien d'accordé : rien d'anormal
  });

  it('un site déjà accordé et classé n’y figure plus — il est en zone 3', async () => {
    installPage({
      granted: ['https://github.com/*'],
      local: { [HOST_PLATFORMS_KEY]: { 'github.com': 'github' } },
    });
    await loadOptions();

    expect(cloudNames()).not.toContain('GitHub.com');
    expect(configuredHosts()).toEqual(['github.com']);
  });

  it('« Activer » demande la permission ET pose l’étiquette — les deux, sinon la zone 4 se remplirait', async () => {
    const state = installPage();
    await loadOptions();

    const card = [...document.querySelectorAll('#cloud-list .cloud-card')].find(
      (el) => el.querySelector('.name')?.textContent === 'GitHub.com'
    );
    buttonIn(card ?? null, 'Activer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.requested).toEqual([['https://github.com/*']]);
    expect(state.local[HOST_PLATFORMS_KEY]).toEqual({ 'github.com': 'github' });
    // Et la carte a rejoint la zone 3, sans jamais passer par la zone 4.
    expect(configuredHosts()).toEqual(['github.com']);
    expect(cloudNames()).not.toContain('GitHub.com');
    expect(panelHidden('unconfigured-panel')).toBe(true);
  });

  it('une permission REFUSÉE ne pose aucune étiquette', async () => {
    const state = installPage({ grantNext: false });
    await loadOptions();

    const card = document.querySelector('#cloud-list .cloud-card');
    buttonIn(card, 'Activer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.local[HOST_PLATFORMS_KEY]).toBeUndefined();
    expect(configuredHosts()).toEqual([]);
  });

  it('un octroi LARGE (`https://*/*`) n’est ni listé ni classable, et laisse le catalogue proposé', async () => {
    // `https://*/*` est le motif que le manifeste déclare en `optional_host_permissions` :
    // c'est donc le plus large que le navigateur puisse accorder ici, et il ne désigne aucun
    // hôte. Listé comme un domaine ordinaire, il apparaissait en zone 4 sous un nom fantôme
    // (`*`, ou `%2A` dans Chromium) ; le classer écrivait une étiquette que
    // `hostMatchesPattern()` ne fait correspondre à rien, donc n'activait aucun adaptateur
    // — un geste sans effet, proposé par l'écran lui-même (revue Codex, PR #60).
    const state = installPage({ granted: ['https://*/*'] });
    await loadOptions();

    expect(configuredHosts()).toEqual([]);
    expect(unconfiguredHosts()).toEqual([]);
    expect(panelHidden('unconfigured-panel')).toBe(true);
    // Le catalogue reste proposé : c'est par lui qu'on classe un domaine concret, et la
    // demande de permission qu'il déclenche est déjà couverte par l'octroi large.
    expect(cloudNames()).toEqual(CLOUD_PLATFORMS.map((p) => p.label));

    const card = [...document.querySelectorAll('#cloud-list .cloud-card')].find(
      (el) => el.querySelector('.name')?.textContent === 'GitHub.com'
    );
    buttonIn(card ?? null, 'Activer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.local[HOST_PLATFORMS_KEY]).toEqual({ 'github.com': 'github' });
    expect(configuredHosts()).toEqual(['github.com']);
  });

  it('le catalogue ne demande JAMAIS de motif à joker', async () => {
    // Un suffixe connu n'est pas un hôte connu. Le catalogue a porté
    // `https://*.visualstudio.com/*`, ce qui accordait l'accès à TOUTES les organisations
    // Azure DevOps sur URLs historiques quand un poste n'en sert qu'une — contre la règle
    // des permissions minimales du §2 (revue Reefact, PR #61). Le critère d'entrée est
    // l'hôte concret : `dev.azure.com` le reste (l'organisation vit dans le chemin),
    // `{organisation}.visualstudio.com` non.
    installPage();
    await loadOptions();

    for (const entry of CLOUD_PLATFORMS) {
      expect(entry.origin).not.toContain('*.');
    }
    expect(cloudNames()).not.toContain('VisualStudio.com');
  });

  it('une organisation historique passe par la saisie, plateforme pré-remplie', async () => {
    // Le chemin de remplacement existe et fonctionne : `inferPlatform()` reconnaît le
    // suffixe, donc la plateforme est proposée sans être devinée à la place de la personne.
    const state = installPage();
    await loadOptions();

    const input = document.getElementById('host-input') as HTMLInputElement;
    const select = document.getElementById('host-platform') as HTMLSelectElement;
    input.value = 'acme.visualstudio.com';
    input.dispatchEvent(new Event('input'));
    expect(select.value).toBe('azdo'); // pré-rempli, et modifiable

    (document.getElementById('host-add') as HTMLButtonElement).click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    // L'octroi ne porte QUE sur cette organisation.
    expect(state.requested).toEqual([['https://acme.visualstudio.com/*']]);
    expect(state.local[HOST_PLATFORMS_KEY]).toEqual({ 'acme.visualstudio.com': 'azdo' });
    expect(configuredHosts()).toEqual(['acme.visualstudio.com']);
  });
});

describe('zone 3 — domaines configurés : on y retire, on n’y reclasse plus', () => {
  it('« Retirer » révoque la permission et purge l’étiquette', async () => {
    const state = installPage({
      granted: ['https://ghes.example.corp/*'],
      local: { [HOST_PLATFORMS_KEY]: { 'ghes.example.corp': 'github' } },
    });
    await loadOptions();

    const row = document.querySelector('#host-list .host-row');
    buttonIn(row, 'Retirer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.removed).toEqual([['https://ghes.example.corp/*']]);
    expect(state.local[HOST_PLATFORMS_KEY]).toEqual({});
    expect(configuredHosts()).toEqual([]);
  });

  it('un hôte AVEC PORT est révoqué sous la forme accordée, jamais reconstruite depuis son nom', async () => {
    // MESURÉ, pas supposé : `new URL('https://ghes.example.corp:8443').hostname` rend
    // `ghes.example.corp` — le port tombe, `hostname` ne le porte pas. Une origine
    // reconstruite en `https://<hôte>/*` demanderait donc la révocation d'une permission
    // jamais accordée : `chrome.permissions.remove` n'aurait rien à retirer, l'accès
    // resterait, et la ligne reviendrait au rafraîchissement suivant. Un GHES sur port non
    // standard ajouté depuis `chrome://extensions` suffit à l'atteindre.
    const state = installPage({
      granted: ['https://ghes.example.corp:8443/*'],
      local: { [HOST_PLATFORMS_KEY]: { 'ghes.example.corp': 'github' } },
    });
    await loadOptions();

    buttonIn(document.querySelector('#host-list .host-row'), 'Retirer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.removed).toEqual([['https://ghes.example.corp:8443/*']]);
    expect(state.granted).toEqual([]); // réellement révoqué, pas seulement demandé
    expect(configuredHosts()).toEqual([]);
  });

  it('une révocation REFUSÉE ne purge pas l’étiquette et le dit', async () => {
    // Purger l'étiquette d'une permission toujours accordée serait le pire des deux mondes :
    // l'accès resterait, l'adaptateur s'éteindrait, et l'hôte réapparaîtrait parmi les
    // domaines non configurés — l'écran affirmant avoir fait ce qu'il n'a pas fait (revue
    // Codex, PR #60). `removed === false` est ce que rend le navigateur quand la permission
    // n'est pas retirable, une politique d'entreprise forcée par exemple.
    const state = installPage({
      granted: ['https://force.corp.example/*'],
      local: { [HOST_PLATFORMS_KEY]: { 'force.corp.example': 'github' } },
      refuseRemoval: true,
    });
    await loadOptions();

    buttonIn(document.querySelector('#host-list .host-row'), 'Retirer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.granted).toEqual(['https://force.corp.example/*']); // rien n'a été retiré
    expect(state.local[HOST_PLATFORMS_KEY]).toEqual({ 'force.corp.example': 'github' });
    expect(configuredHosts()).toEqual(['force.corp.example']); // la ligne reste là où elle est
    expect(panelHidden('unconfigured-panel')).toBe(true); // et ne bascule PAS en zone 4
    expect(document.querySelector('#host-list')?.closest('section.panel')?.querySelector('.remove-state')?.textContent)
      .toContain('force.corp.example');
  });

  it('un hôte classé par la POLITIQUE s’affiche en lecture seule, sans bouton de retrait', async () => {
    installPage({
      granted: ['https://azdo.corp.example/*'],
      managed: { allowedHosts: [{ host: 'azdo.corp.example', platform: 'azdo' }] },
    });
    await loadOptions();

    const row = document.querySelector('#host-list .host-row');
    expect(row?.textContent).toContain('politique d\u2019entreprise');
    expect(buttonIn(row, 'Retirer')).toBeNull();
  });

  it('aucun sélecteur de plateforme : la zone 3 n’est pas un écran de reclassement', async () => {
    installPage({
      granted: ['https://ghes.example.corp/*'],
      local: { [HOST_PLATFORMS_KEY]: { 'ghes.example.corp': 'github' } },
    });
    await loadOptions();

    expect(document.querySelectorAll('#host-list select')).toHaveLength(0);
  });
});

describe('zone 4 — domaines non configurés : n’existe que si elle a de quoi', () => {
  // Un hôte n'y arrive que par un octroi fait hors de cet écran (`chrome://extensions` →
  // « Accès au site ») : les zones 1 et 2 classent toujours ce qu'elles autorisent.
  const granted = { granted: ['https://mystere.example.corp/*'] };

  it('apparaît, avec l’hôte accordé et sans plateforme', async () => {
    installPage(granted);
    await loadOptions();

    expect(panelHidden('unconfigured-panel')).toBe(false);
    expect(unconfiguredHosts()).toEqual(['mystere.example.corp']);
    expect(configuredHosts()).toEqual([]); // et surtout PAS parmi les hôtes configurés
  });

  it('« Activer » classe SANS redemander la permission — elle est déjà accordée', async () => {
    const state = installPage(granted);
    await loadOptions();

    const row = document.querySelector('#unconfigured-list .host-row');
    (row!.querySelector('select') as HTMLSelectElement).value = 'azdo';
    buttonIn(row, 'Activer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.requested).toEqual([]); // aucune invite du navigateur pour un accès acquis
    expect(state.local[HOST_PLATFORMS_KEY]).toEqual({ 'mystere.example.corp': 'azdo' });
    // Classé, l'hôte a changé de zone — et la zone 4, vide, disparaît.
    expect(configuredHosts()).toEqual(['mystere.example.corp']);
    expect(unconfiguredHosts()).toEqual([]);
    expect(panelHidden('unconfigured-panel')).toBe(true);
  });

  it('sans plateforme choisie, « Activer » ne classe rien', async () => {
    const state = installPage(granted);
    await loadOptions();

    buttonIn(document.querySelector('#unconfigured-list .host-row'), 'Activer')!.click();
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));

    expect(state.local[HOST_PLATFORMS_KEY]).toBeUndefined();
    expect(panelHidden('unconfigured-panel')).toBe(false);
  });

  it('un hôte classé par la POLITIQUE n’y tombe jamais, même sans étiquette locale', async () => {
    // Sinon l'écran proposerait une correction locale que `readPlatformTags()` (background)
    // laisse justement la politique écraser : un geste sans effet (revue Codex, PR #29).
    installPage({
      granted: ['https://azdo.corp.example/*'],
      managed: { allowedHosts: [{ host: 'azdo.corp.example', platform: 'azdo' }] },
    });
    await loadOptions();

    expect(panelHidden('unconfigured-panel')).toBe(true);
    expect(configuredHosts()).toEqual(['azdo.corp.example']);
  });
});
