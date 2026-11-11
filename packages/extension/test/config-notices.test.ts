// @vitest-environment happy-dom
// §5.3 « Avis de configuration », CA-24 — les faits que la résolution de la configuration
// signale (`floor-override`, `config-warning`, `invalid-config`, `unsupported-version`)
// s'affichent là où l'extension montre son état dégradé : dans la pastille, et dans la page
// d'options. Ils ne changent aucun verdict.
//
// Les avis viennent ici de la VRAIE résolution — `ClientConfigResolver`, sur les documents
// d'organisation et de dépôt lus par l'adaptateur, sous un plancher —, jamais d'une liste écrite
// par le test : ce sont les avis que core/ produit, et l'interface les rend dans SA langue (§10).
// Chaque message distinct a son texte exact, fr et en, dans `packages/core/test/notices.test.ts` ;
// ici, une sorte au moins par message, aux deux endroits où l'interface l'affiche.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Floor, PrRef } from '@cct/core';
import { NEUTRAL_EDITOR_CHROME, writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter } from '@cct/adapter-shared';
import { ClientConfigResolver, type ResolvedClientConfig } from '../src/config-resolver.js';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';
import { recordResolution } from '../src/content-internal.js';
import { CONFIG_NOTICES_KEY } from '../src/storage.js';
import { ui } from '../src/ui/strings.js';
import { submitLookup } from './helpers/submit-lookup.js';

const PR: PrRef = { platform: 'github', host: 'github.com', scope: ['acme', 'demo'], number: 42 };

/** CA-24, tel qu'il s'affiche : la phrase de `notice.floor-override` (core/, i18n), le niveau en
 * cause — le fichier du dépôt — et la clé citée. */
const FLOOR_OVERRIDE_FR =
  'Plancher d\u2019entreprise (fichier du dépôt) : clé « mode » ignorée : elle assouplirait le plancher d\u2019entreprise (§8.1.1).';
const FLOOR_OVERRIDE_EN =
  'Enterprise floor (repository file): key "mode" ignored: it would relax the enterprise floor (§8.1.1).';

/** La configuration résolue par le résolveur de l'extension, pour ce fichier de dépôt et ce
 * plancher — le chemin réel, adaptateur compris. */
async function resolvedFor(
  repo: object | null,
  floor: Floor | null = null,
  org: object | null = null
): Promise<ResolvedClientConfig> {
  const read = (doc: object | null) =>
    doc ? { status: 'found' as const, text: JSON.stringify(doc) } : { status: 'absent' as const };
  const adapter = {
    getRepoConfig: async () => read(repo),
    getOrgConfig: async () => read(org),
  } as unknown as PlatformAdapter;
  // Le document d'organisation n'est lu que si le plancher en désigne un (§8.1.2).
  const withUrl = org ? { ...floor, configUrl: 'https://config.example.test/org.json' } : floor;
  return new ClientConfigResolver(async () => withUrl).resolve(adapter, PR);
}

/** La pastille d'un éditeur réel, sur cette configuration. `then` reçoit le contrôleur avant la
 * lecture — pour lui repousser une autre configuration, comme le fait un rendu de la page. */
async function pastille(
  resolved: ResolvedClientConfig,
  lang = 'fr',
  body = 'issue: le nom est ambigu\n\nDétail.',
  then?: (controller: EditorController) => Promise<void>
) {
  const host = document.createElement('div');
  const textarea = document.createElement('textarea');
  const submit = document.createElement('button');
  host.append(textarea, submit);
  document.body.appendChild(host);
  const editor: EditorHandle = {
    id: 'e1',
    element: textarea,
    context: { zone: 'thread-root', action: 'compose', pr: PR, canCarryBlockingState: true },
  };
  const adapter: Partial<PlatformAdapter> = {
    platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
    getEditorChrome: () => ({ ...NEUTRAL_EDITOR_CHROME, framedContainer: host }),
    getSubmitControls: () => submitLookup([{ element: submit, kind: 'submit' }]),
    submitKeystrokes: () => ({ field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' }], control: [] }),
    readValue: () => textarea.value,
    writeValue: (_e, text, caret) => writeToTextField(textarea, text, caret),
  };
  const controller = new EditorController({
    adapter: adapter as PlatformAdapter,
    editor,
    resolved,
    lang,
    currentUserLogin: 'alice',
  });
  controller.attach();
  writeToTextField(textarea, body);
  await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
  await then?.(controller);
  const notices = [...host.querySelectorAll<HTMLElement>('.cct-diagnostics li.cct-config-notice')].map((li) => ({
    kind: li.dataset['noticeKind'],
    text: li.textContent ?? '',
  }));
  const diagnostics = [...host.querySelectorAll<HTMLElement>('.cct-diagnostics li[data-code]')].map((li) => li.dataset['code']);
  const state = host.querySelector<HTMLElement>('.cct-pastille')?.dataset['state'];
  const blocked = submit.getAttribute('aria-disabled') === 'true';
  controller.dispose();
  host.remove();
  return { notices, diagnostics, state, blocked };
}

// ————— La page d'options, chargée avec un stockage local qui note ce que l'onglet y écrit —————

const OPTIONS_HTML = readFileSync(resolve(process.cwd(), 'packages/extension/src/options/options.html'), 'utf8');

function installStorage(language = 'fr'): Record<string, unknown> {
  const store: Record<string, unknown> = { optionsTourSeen: true };
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { getManifest: () => ({ version: '1.0.0' }) },
    permissions: { getAll: (cb: (p: { origins?: string[] }) => void) => cb({ origins: [] }) },
    storage: {
      local: {
        get: (keys: string[], cb: (i: Record<string, unknown>) => void) => {
          const picked: Record<string, unknown> = {};
          for (const key of keys) if (key in store) picked[key] = store[key];
          cb(picked);
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items);
          cb?.();
        },
        remove: (keys: string[], cb?: () => void) => {
          for (const key of keys) delete store[key];
          cb?.();
        },
      },
      sync: { get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({ language }), set: () => {} },
      managed: { get: (cb: (i: Record<string, unknown>) => void) => cb({}) },
      onChanged: { addListener: () => {} },
    },
  };
  return store;
}

async function optionsPage(): Promise<{ status: string; items: { kind: string | undefined; text: string }[] }> {
  // Le module de la page est importé ci-dessous : sa balise `<script>` n'a pas à être chargée.
  document.body.innerHTML = (/<body>([\s\S]*)<\/body>/.exec(OPTIONS_HTML)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');
  await import('../src/options/options.js');
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  return {
    status: document.querySelector('#config-notices .status-text')?.textContent ?? '',
    items: [...document.querySelectorAll<HTMLElement>('#config-notices-list li')].map((li) => ({
      kind: li.dataset['noticeKind'],
      text: li.textContent ?? '',
    })),
  };
}

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.innerHTML = '';
});

describe('§5.3, CA-24 — un `floor-override` est signalé dans la pastille ET dans la page d’options', () => {
  it('CA-24 : `{"mode": "off"}` sous un plancher `enforce` — ignoré, et le fait visible aux deux endroits', async () => {
    const resolved = await resolvedFor({ mode: 'off' }, { minimumMode: 'enforce' });
    expect(resolved.config.mode).toBe('enforce'); // la clé du dépôt est bien ignorée
    expect(resolved.notices.filter((n) => n.kind === 'floor-override').map((n) => n.ref)).toEqual(['mode']);

    // La pastille : la phrase du catalogue de core/ (`notice.floor-override`), dans la langue de
    // l'interface, la clé en cause citée.
    const fr = await pastille(resolved, 'fr');
    expect(fr.notices).toEqual([{ kind: 'floor-override', text: FLOOR_OVERRIDE_FR }]);
    const en = await pastille(resolved, 'en');
    expect(en.notices).toEqual([{ kind: 'floor-override', text: FLOOR_OVERRIDE_EN }]);
    // Sans masquer ni changer les diagnostics : le commentaire est conforme, rien n'est bloqué.
    expect(fr.diagnostics).toEqual([]);
    expect(fr.state).toBe('compliant');
    expect(fr.blocked).toBe(false);

    // La page d'options : ce que l'onglet a écrit à la résolution, et le dépôt d'où ça vient.
    const store = installStorage('fr');
    recordResolution(PR, resolved);
    expect(store[CONFIG_NOTICES_KEY]).toBeDefined();
    const page = await optionsPage();
    expect(page.status).toBe('1 avis de configuration à la dernière lecture (github.com/acme/demo) :');
    expect(page.items).toEqual([{ kind: 'floor-override', text: FLOOR_OVERRIDE_FR }]);
  });
});

describe('§5.3, §10 — chaque sorte d’avis, dans la langue de l’interface, aux deux endroits', () => {
  // Le texte EXACT affiché, fr et en — dans la pastille ET dans la page d'options. Chaque phrase
  // nomme sa sorte (« Avertissement de configuration », « Version non prise en charge »…) — une
  // ligne de la pastille reste identifiable comme un avis, et non comme un diagnostic — puis,
  // entre parenthèses, le niveau de configuration en cause (§5.3).
  const CASES: { name: string; repo: object | null; floor?: Floor; org?: object; kind: string; fr: string; en: string }[] = [
    {
      name: 'floor-override — clé du document d’ORGANISATION (§8.1.1)',
      repo: null,
      floor: { minimumMode: 'enforce' },
      org: { mode: 'off' },
      kind: 'floor-override',
      fr: 'Plancher d\u2019entreprise (configuration d\u2019organisation) : clé « mode » ignorée : elle assouplirait le plancher d\u2019entreprise (§8.1.1).',
      en: 'Enterprise floor (organization configuration): key "mode" ignored: it would relax the enterprise floor (§8.1.1).',
    },
    {
      name: 'config-warning — le mode obsolète `"warn"` (§7)',
      repo: { mode: 'warn' },
      kind: 'config-warning',
      fr: 'Avertissement de configuration (fichier du dépôt) : valeur obsolète « warn » pour « mode », lue comme « assist » — remplacez-la par « assist » (§7).',
      en: 'Configuration warning (repository file): obsolete value "warn" for "mode": read as "assist" — replace it with "assist" (§7).',
    },
    {
      name: 'config-warning — la clé retirée `activation` (§8.2)',
      repo: { activation: { activatedAt: '2026-09-01T00:00:00Z' } },
      kind: 'config-warning',
      fr: 'Avertissement de configuration (fichier du dépôt) : clé inconnue « activation » ignorée.',
      en: 'Configuration warning (repository file): unknown key "activation" ignored.',
    },
    {
      name: 'config-warning — une clé inconnue du PLANCHER (§8.1.1)',
      repo: null,
      floor: { minimumMod: 'enforce' } as unknown as Floor,
      kind: 'config-warning',
      fr: 'Avertissement de configuration (plancher d\u2019entreprise) : clé inconnue « minimumMod » ignorée.',
      en: 'Configuration warning (enterprise floor): unknown key "minimumMod" ignored.',
    },
    {
      name: 'invalid-config — une valeur hors domaine (§8.1.5)',
      repo: { mode: 'banana' },
      kind: 'invalid-config',
      fr: 'Configuration invalide (fichier du dépôt) : la clé « mode » doit valoir l\u2019une de ces valeurs : off, assist, enforce.',
      en: 'Invalid configuration (repository file): key "mode" must be one of off, assist, enforce.',
    },
    {
      name: 'unsupported-version — une version de schéma trop récente (§8.1.5)',
      repo: { version: 99 },
      kind: 'unsupported-version',
      fr: 'Version non prise en charge (fichier du dépôt) : la version de schéma 99 dépasse la version prise en charge, 1 : repli en mode assist (ou sur le plancher s\u2019il est plus strict).',
      en: 'Unsupported version (repository file): configuration schema version 99 exceeds supported version 1: falling back to assist mode (or the floor if stricter).',
    },
  ];

  it.each(CASES)('$name', async ({ repo, floor, org, kind, fr, en }) => {
    const resolved = await resolvedFor(repo, floor ?? null, org ?? null);
    expect(resolved.notices.map((n) => n.kind)).toEqual([kind]);

    expect((await pastille(resolved, 'fr')).notices).toEqual([{ kind, text: fr }]);
    expect((await pastille(resolved, 'en')).notices).toEqual([{ kind, text: en }]);

    for (const [lang, text] of [['fr', fr], ['en', en]] as const) {
      installStorage(lang);
      recordResolution(PR, resolved);
      expect((await optionsPage()).items, lang).toEqual([{ kind, text }]);
      vi.resetModules(); // la page d'options se recharge, dans l'autre langue
    }
  });

  it('la même faute dans l’organisation ET dans le dépôt : deux lignes, chacune nommant son niveau', async () => {
    const resolved = await resolvedFor({ mode: 'warn' }, null, { mode: 'warn' });
    const FR = (where: string) =>
      `Avertissement de configuration (${where}) : valeur obsolète « warn » pour « mode », lue comme « assist » — remplacez-la par « assist » (§7).`;
    const EN = (where: string) =>
      `Configuration warning (${where}): obsolete value "warn" for "mode": read as "assist" — replace it with "assist" (§7).`;
    const fr = [FR('configuration d\u2019organisation'), FR('fichier du dépôt')];
    const en = [EN('organization configuration'), EN('repository file')];
    expect((await pastille(resolved, 'fr')).notices.map((n) => n.text)).toEqual(fr);
    expect((await pastille(resolved, 'en')).notices.map((n) => n.text)).toEqual(en);
    for (const [lang, texts, status] of [
      ['fr', fr, '2 avis de configuration à la dernière lecture (github.com/acme/demo) :'],
      ['en', en, '2 configuration notices at the last read (github.com/acme/demo):'],
    ] as const) {
      installStorage(lang);
      recordResolution(PR, resolved);
      const page = await optionsPage();
      expect(page.items.map((i) => i.text), lang).toEqual(texts);
      expect(page.status, lang).toBe(status); // pluriel
      vi.resetModules();
    }
  });

  it('une seule ligne d’avis : le singulier, en français comme en anglais', async () => {
    const resolved = await resolvedFor({ banana: 1 });
    for (const [lang, status] of [
      ['fr', '1 avis de configuration à la dernière lecture (github.com/acme/demo) :'],
      ['en', '1 configuration notice at the last read (github.com/acme/demo):'],
    ] as const) {
      installStorage(lang);
      recordResolution(PR, resolved);
      expect((await optionsPage()).status, lang).toBe(status);
      vi.resetModules();
    }
  });

  it('une configuration repoussée à un éditeur ouvert, aux avis seuls changés, met la pastille à jour', async () => {
    // Ce que fait un rendu de la page quand le sondage constate que seuls les avis ont changé
    // (§5.3, revue Codex, PR #181) : la signature de rendu est la même, l'éditeur n'est pas
    // reconstruit, `updateResolved()` lui repousse la nouvelle lecture.
    const before = await resolvedFor(null);
    const after = await resolvedFor({ banana: 1 });
    expect(after.config).toEqual(before.config); // réglages effectifs identiques
    const shown = await pastille(before, 'fr', undefined, async (controller) => {
      controller.updateResolved(after);
    });
    expect(shown.notices).toEqual([
      { kind: 'config-warning', text: 'Avertissement de configuration (fichier du dépôt) : clé inconnue « banana » ignorée.' },
    ]);
  });

  it('un avis écrit par une version antérieure — sans clé de message — se rend par son message', async () => {
    // Le stockage survit à une mise à jour de l'extension : la page d'options peut lire un avis
    // que l'onglet a écrit avant que les avis ne portent leur clé.
    const store = installStorage('fr');
    store[CONFIG_NOTICES_KEY] = {
      repo: 'github.com/acme/demo',
      notices: [{ kind: 'config-warning', message: 'unknown configuration key "activation" ignored' }],
    };
    expect((await optionsPage()).items).toEqual([
      { kind: 'config-warning', text: 'unknown configuration key "activation" ignored' },
    ]);
  });
});

describe('§5.3 — aucun avis, rien d’affiché', () => {
  it('ni ligne dans la pastille, ni liste dans la page d’options — qui dit « aucun avis » pour ce dépôt', async () => {
    const resolved = await resolvedFor(null);
    expect(resolved.notices).toEqual([]);
    expect((await pastille(resolved)).notices).toEqual([]);

    installStorage('fr');
    recordResolution(PR, resolved);
    const page = await optionsPage();
    expect(page.items).toEqual([]);
    expect(page.status).toBe(ui('fr', 'options.status.notices.none', { repo: 'github.com/acme/demo' }));
  });

  it('avant toute lecture de configuration, la page d’options le dit, sans inventer de dépôt', async () => {
    installStorage('fr');
    const page = await optionsPage();
    expect(page.items).toEqual([]);
    expect(page.status).toBe(ui('fr', 'options.status.notices.unread'));
  });
});
