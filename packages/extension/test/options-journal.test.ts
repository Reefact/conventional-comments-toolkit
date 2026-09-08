// @vitest-environment happy-dom
//
// La section « État » de la page d'options : marques de page, liens, et effacement du
// journal (§9.4, CA-11). Mesuré sur le VRAI `options.html` — le rendu ne vit que dans
// l'accord entre le HTML (identifiants, conteneur de détail) et `options.ts`, et un fragment
// paraphrasé ici validerait le code contre lui-même.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageMark } from '../src/page-mark.js';
import { ui } from '../src/ui/strings.js';

const OPTIONS_HTML = readFileSync(
  resolve(process.cwd(), 'packages/extension/src/options/options.html'),
  'utf8'
);

const PR = 'https://github.com/Reefact/conventional-comments-toolkit/pull/48';

/** Quatre relevés sur DEUX pages — dont deux qui ne diffèrent que par leur requête et leur
 * ancre —, plus une entrée écrite avant que l'adresse ne soit enregistrée. */
const SEEDED = [
  { chain: 'merge-button', at: '2026-09-08T11:49:08.072Z', url: `${PR}/files` },
  { chain: 'editors', at: '2026-09-08T11:49:08.342Z', url: `${PR}/files?diff=split` },
  { chain: 'comment-body', at: '2026-09-08T11:49:08.914Z', url: `${PR}/files#discussion_r7` },
  { chain: 'comment-author', at: '2026-09-08T11:49:09.101Z', url: `${PR}/changes` },
  { chain: 'thread-anchor', at: '2026-09-07T22:03:41.500Z' },
];

function installPage(local: Record<string, unknown>, language = 'fr'): Record<string, unknown> {
  const body = /<body>([\s\S]*)<\/body>/.exec(OPTIONS_HTML)?.[1] ?? '';
  document.body.innerHTML = body;
  // La visite guidée est neutralisée : elle pose un voile modal sur la page, et ce test
  // clique. C'est un état du monde, pas un détail du faux — une personne qui a déjà vu la
  // visite est le cas courant.
  const store: Record<string, unknown> = { optionsTourSeen: true, ...local };

  (globalThis as { chrome?: unknown }).chrome = {
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
        // `remove` RETIRE la clé — un faux qui la mettrait à `[]` décrirait `set`, pas
        // `remove`, et laisserait passer un code qui ne fait ni l'un ni l'autre.
        remove: (keys: string[], cb?: () => void) => {
          for (const key of keys) delete store[key];
          cb?.();
        },
      },
      sync: {
        get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({ language }),
        set: () => {},
      },
      managed: { get: (cb: (i: Record<string, unknown>) => void) => cb({}) },
      onChanged: { addListener: () => {} },
    },
  };
  return store;
}

async function loadOptions(): Promise<void> {
  await import('../src/options/options.js');
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

const marks = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('#selector-log-detail .page-mark, #selector-log-detail .page-mark-none'),
];
const statusText = (): string =>
  document.querySelector('#selector-log .status-text')?.textContent ?? '';
const clearButton = (): HTMLButtonElement | null =>
  document.querySelector('#selector-log-detail button');

afterEach(() => {
  vi.resetModules();
  delete (globalThis as { chrome?: unknown }).chrome;
  document.body.innerHTML = '';
});

describe('§9.4 / CA-11 — la marque répond « quelle page »', () => {
  it('deux relevés d’une même page portent la MÊME marque, une autre vue en porte une autre', async () => {
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    const rendered = marks().map((el) => el.textContent);
    // Les trois premiers ne diffèrent que par leur requête et leur ancre : une seule page.
    expect(rendered[0]).toBe(rendered[1]);
    expect(rendered[0]).toBe(rendered[2]);
    expect(rendered[0]).toBe(pageMark(`${PR}/files`));
    // `/changes` est une autre vue, donc un autre DOM, donc une autre marque.
    expect(rendered[3]).not.toBe(rendered[0]);
  });

  it('le lien porte l’adresse ENTIÈRE, ancre comprise, et s’ouvre à côté', async () => {
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    const third = marks()[2] as HTMLAnchorElement;
    expect(third.getAttribute('href')).toBe(`${PR}/files#discussion_r7`);
    expect(third.title).toBe(`${PR}/files#discussion_r7`);
    // La page d'options ne doit pas se perdre elle-même au clic.
    expect(third.target).toBe('_blank');
    expect(third.rel).toBe('noopener noreferrer');
  });

  it('une entrée sans adresse garde sa colonne, et dit ce qu’elle est', async () => {
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    const legacy = marks()[4]!;
    expect(legacy.tagName).toBe('SPAN'); // pas un lien : il n'y a nulle part où aller
    expect(legacy.textContent).toHaveLength(6); // même largeur, sinon la colonne se décale
    expect(legacy.title).toBe(ui('fr', 'options.status.selectors.page.unknown'));
  });

  it('une adresse hors `http(s)` ne devient pas un lien', async () => {
    // Inatteignable depuis un script de contenu — mais cette valeur est relue du stockage
    // pour fabriquer un `href`, et un `href` fabriqué à partir de données stockées se
    // vérifie plutôt qu'il ne se suppose.
    installPage({ selectorFailures: [{ chain: 'editors', at: 'x', url: 'javascript:alert(1)' }] });
    await loadOptions();

    expect(marks()[0]!.tagName).toBe('SPAN');
    expect(document.querySelector('#selector-log-detail a')).toBeNull();
  });

  it('la ligne garde son horodatage et son nom de chaîne', async () => {
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    // La marque PRÉFIXE la ligne, elle ne la remplace pas.
    const text = document.querySelector('#selector-log-detail pre')?.textContent ?? '';
    expect(text).toContain('2026-09-08T11:49:08.072Z — merge-button');
    expect(text.split('\n')).toHaveLength(SEEDED.length);
  });
});

describe('§9.4 — effacer le journal', () => {
  it('le bouton n’existe que s’il y a un journal', async () => {
    installPage({});
    await loadOptions();

    expect(clearButton()).toBeNull();
    expect(statusText()).toBe(ui('fr', 'options.status.selectors.none'));
  });

  it('le clic retire la clé, et la section cesse d’annoncer des dégradations', async () => {
    const store = installPage({ selectorFailures: SEEDED });
    await loadOptions();
    expect(clearButton()).not.toBeNull();

    clearButton()!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect('selectorFailures' in store).toBe(false);
    expect(statusText()).toBe(ui('fr', 'options.status.selectors.none'));
    expect(document.querySelector('#selector-log')?.className).not.toContain('degraded');
  });

  it('n’en laisse AUCUNE trace à l’écran', async () => {
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    clearButton()!.click();
    await new Promise((r) => setTimeout(r, 0));

    // Le défaut que ce test garde : le rendu ajoutait son `<pre>` au lieu de remplacer le
    // conteneur. Au second passage, le journal étant vide, rien n'était ajouté — et
    // l'ANCIEN `<pre>` survivait, affichant un journal fantôme sous la ligne qui venait
    // d'annoncer qu'il n'y en avait plus.
    expect(document.querySelectorAll('#selector-log pre')).toHaveLength(0);
    expect(marks()).toHaveLength(0);
    expect(clearButton()).toBeNull();
  });

  it('le libellé du bouton suit la langue de la page', async () => {
    installPage({ selectorFailures: SEEDED }, 'en');
    await loadOptions();

    expect(clearButton()?.textContent).toBe(ui('en', 'options.status.selectors.clear'));
    expect(marks()[4]!.title).toBe(ui('en', 'options.status.selectors.page.unknown'));
  });
});
