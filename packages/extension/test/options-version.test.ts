// @vitest-environment happy-dom
//
// La version de l'extension, à côté du titre de la page d'options. Mesuré sur le VRAI
// `options.html` : le rendu ne vit que dans l'accord entre le HTML (l'identifiant du badge)
// et `options.ts`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayVersion } from '../src/options/version.js';

const OPTIONS_HTML = readFileSync(
  resolve(process.cwd(), 'packages/extension/src/options/options.html'),
  'utf8'
);

function installPage(manifest: { version?: string; version_name?: string } | null): void {
  const body = /<body>([\s\S]*)<\/body>/.exec(OPTIONS_HTML)?.[1] ?? '';
  document.body.innerHTML = body;
  const store: Record<string, unknown> = { optionsTourSeen: true };
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: manifest === null ? {} : { getManifest: () => manifest },
    permissions: { getAll: (cb: (p: { origins?: string[] }) => void) => cb({ origins: [] }) },
    storage: {
      local: {
        get: (keys: string[], cb: (i: Record<string, unknown>) => void) =>
          cb(Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))),
        set: (_i: Record<string, unknown>, cb?: () => void) => cb?.(),
        remove: (_k: string[], cb?: () => void) => cb?.(),
      },
      sync: {
        get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({ language: 'fr' }),
        set: () => {},
      },
      managed: { get: (cb: (i: Record<string, unknown>) => void) => cb({}) },
      onChanged: { addListener: () => {} },
    },
  };
}

async function loadOptions(): Promise<void> {
  await import('../src/options/options.js');
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

const badge = (): HTMLElement | null => document.getElementById('extension-version');

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.innerHTML = '';
});

describe('displayVersion', () => {
  it('préfère version_name, qui porte l’étiquette de pré-version', () => {
    expect(displayVersion({ version: '1.0.0', version_name: '1.0.0-beta.15' })).toBe(
      'v1.0.0-beta.15'
    );
  });

  it('retombe sur version quand version_name manque (Firefox)', () => {
    expect(displayVersion({ version: '1.0.0' })).toBe('v1.0.0');
    expect(displayVersion({ version: '1.0.0', version_name: '  ' })).toBe('v1.0.0');
  });

  it('ne rend rien quand le manifeste est illisible', () => {
    expect(displayVersion(undefined)).toBeNull();
    expect(displayVersion({})).toBeNull();
  });
});

describe('badge de version de la page d’options', () => {
  it('affiche la version_name à côté du titre, sans l’effacer en traduisant la page', async () => {
    installPage({ version: '1.0.0', version_name: '1.0.0-beta.15' });
    await loadOptions();

    expect(badge()?.textContent).toBe('v1.0.0-beta.15');
    expect(badge()?.hidden).toBe(false);
    // Sœur du `<h1>`, jamais fille : `applyStaticStrings` écrit `textContent` sur le titre.
    const h1 = document.querySelector('header.top h1');
    expect(badge()?.parentElement).toBe(h1?.parentElement);
    expect(h1?.contains(badge())).toBe(false);
    expect(badge()?.title).toBe('Version de l’extension');
  });

  it('reste caché quand le navigateur ne donne pas de manifeste', async () => {
    installPage(null);
    await loadOptions();

    expect(badge()?.hidden).toBe(true);
    expect(badge()?.textContent).toBe('');
  });
});
