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
  const listeners: ((c: Record<string, { newValue?: unknown }>, a: string) => void)[] = [];
  // Le navigateur notifie `onChanged` pour TOUTE écriture de la zone, y compris celle du
  // contexte qui écrit. Un faux muet décrirait un navigateur qui n'existe pas — et laisserait
  // passer une page d'options qui ne suit pas ce que les onglets écrivent.
  const notify = (changes: Record<string, { newValue?: unknown }>) => {
    for (const l of listeners) l(changes, 'local');
  };

  (globalThis as { chrome?: unknown }).chrome = {
    // Le manifeste que la page lit pour afficher sa version : le rapport de débogage la reprend.
    runtime: { getManifest: () => ({ version: '1.0.0', version_name: '1.0.0-beta.17' }) },
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
          notify(Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }])));
        },
        // `remove` RETIRE la clé — un faux qui la mettrait à `[]` décrirait `set`, pas
        // `remove`, et laisserait passer un code qui ne fait ni l'un ni l'autre.
        remove: (keys: string[], cb?: () => void) => {
          for (const key of keys) delete store[key];
          cb?.();
          notify(Object.fromEntries(keys.map((k) => [k, {}])));
        },
      },
      sync: {
        get: (_k: string[], cb: (i: Record<string, unknown>) => void) => cb({ language }),
        set: () => {},
      },
      managed: { get: (cb: (i: Record<string, unknown>) => void) => cb({}) },
      onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l) },
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
// Une ligne par ENTRÉE : c'est un élément, pas un saut de ligne — la ligne se replie sous son niveau.
const journalRows = (): string[] =>
  [...document.querySelectorAll('#selector-log-detail pre .journal-row')].map((r) => r.textContent ?? '');
const statusText = (): string =>
  document.querySelector('#selector-log .status-text')?.textContent ?? '';
// Retrouvé par son LIBELLÉ : le journal porte désormais un bouton « Copier » par ligne, et « le
// premier bouton » n'est plus celui qui efface.
const clearButton = (language = 'fr'): HTMLButtonElement | null =>
  [...document.querySelectorAll<HTMLButtonElement>('#selector-log-detail button')].find(
    (b) => b.textContent === ui(language, 'options.status.selectors.clear')
  ) ?? null;

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
    expect(legacy.textContent).toHaveLength(6); // même forme de ligne : `(······)` pour `(m4rtqv)`
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

  it('une ligne se lit « niveau, quand — quoi (où) », la marque entre parenthèses', async () => {
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    // La marque CLÔT la ligne, elle ne la remplace pas : le bouton d'icône ouvre la ligne, puis
    // le niveau, l'horodatage, la chaîne, et la page entre parenthèses.
    const lines = journalRows();
    expect(lines[0]).toBe(`WARN  2026-09-08T11:49:08.072Z — merge-button (${pageMark(`${PR}/files`)})`);
    expect(lines).toHaveLength(SEEDED.length); // une ligne par entrée
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

  it('la section suit ce qu’un ONGLET écrit, sans rechargement', async () => {
    // L'écran lisait le journal une seule fois, au chargement. Un onglet pouvait journaliser
    // une dégradation pendant que cette page continuait d'afficher « aucune » — et après un
    // effacement, elle ne montrait pas davantage la mesure suivante (revue Reefact, PR #70).
    installPage({});
    await loadOptions();
    expect(statusText()).toBe(ui('fr', 'options.status.selectors.none'));

    // Ce que fait un onglet quand une chaîne échoue : il écrit la clé.
    (globalThis as { chrome?: { storage: { local: { set: (i: unknown, cb?: () => void) => void } } } }).chrome!.storage.local.set(
      { selectorFailures: SEEDED }
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(statusText()).toBe(ui('fr', 'options.status.selectors.some', { count: SEEDED.length }));
    expect(marks()).toHaveLength(SEEDED.length);
  });

  it('le libellé du bouton suit la langue de la page', async () => {
    installPage({ selectorFailures: SEEDED }, 'en');
    await loadOptions();

    expect(clearButton('en')?.textContent).toBe(ui('en', 'options.status.selectors.clear'));
    expect(marks()[4]!.title).toBe(ui('en', 'options.status.selectors.page.unknown'));
  });
});

// Le rapport pour un développeur (§9.4) : ce qu'un bouton met dans le presse-papiers.
//
// Le presse-papiers est un FAUX qui garde ce qu'on lui écrit — et qui peut refuser, comme le
// navigateur le fait sans geste de l'utilisateur ou hors contexte sécurisé. Un faux qui
// accepterait toujours ne pourrait pas exprimer le repli manuel.
describe('§9.4 — copier pour le débogage', () => {
  const RICH = [
    {
      chain: 'merge-button',
      at: '2026-09-08T11:49:08.072Z',
      url: `${PR}/files`,
      candidates: ['button.merge-a', '[data-variant="primary"]'],
      platform: 'github',
      firstAt: '2026-09-01T08:00:00.000Z',
      count: 4,
    },
    { chain: 'editors', at: '2026-09-08T11:49:08.342Z', url: `${PR}/files?diff=split` },
  ];

  function installClipboard(refuse = false): string[] {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) =>
          refuse ? Promise.reject(new Error('NotAllowedError')) : (written.push(text), Promise.resolve()),
      },
    });
    return written;
  }

  /** Le JSON du bloc : la clôture est du Markdown, le contenu doit être du JSON valide. */
  function payload(report: string): Record<string, unknown> {
    const match = /^(`{3,})json\n([\s\S]*)\n\1$/.exec(report);
    expect(match, 'un bloc de code json, clôture comprise').not.toBeNull();
    return JSON.parse(match![2]!) as Record<string, unknown>;
  }

  const rowButtons = (): HTMLButtonElement[] => [
    ...document.querySelectorAll<HTMLButtonElement>('#selector-log-detail pre button'),
  ];
  const copyAllButton = (): HTMLButtonElement | undefined =>
    [...document.querySelectorAll<HTMLButtonElement>('#selector-log-detail button')].find(
      (b) => b.textContent === ui('fr', 'options.status.selectors.copyAll')
    );
  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('chaque ligne a son bouton, et il nomme la chaîne pour un lecteur d’écran', async () => {
    installPage({ selectorFailures: RICH });
    await loadOptions();

    expect(rowButtons()).toHaveLength(RICH.length);
    expect(rowButtons()[1]!.getAttribute('aria-label')).toBe(
      ui('fr', 'options.status.selectors.copy.aria', { what: 'editors' })
    );
  });

  it('le bouton d’une ligne copie CETTE ligne, avec l’environnement', async () => {
    const written = installClipboard();
    installPage({ selectorFailures: RICH, degradedState: 'config-unreachable' });
    await loadOptions();

    rowButtons()[0]!.click();
    await flush();

    expect(written).toHaveLength(1);
    const report = payload(written[0]!);
    expect(report['entry']).toEqual(RICH[0]);
    expect(report['extension']).toBe('v1.0.0-beta.17');
    expect(report['degradedState']).toBe('config-unreachable');
    expect(report['browser']).toBe(navigator.userAgent);
    expect(report['language']).toBe('fr');
    // L'autre ligne n'y est pas : le bouton de ligne ne copie pas le journal.
    expect(written[0]).not.toContain('"editors"');
  });

  it('le bouton du journal copie TOUTES les lignes, dans l’ordre affiché', async () => {
    const written = installClipboard();
    installPage({ selectorFailures: RICH });
    await loadOptions();

    copyAllButton()!.click();
    await flush();

    expect(payload(written[0]!)['entries']).toEqual(RICH);
  });

  it('le bouton de ligne est l’icône qui ouvre la ligne, et il passe en coche une fois copié', async () => {
    installClipboard();
    installPage({ selectorFailures: RICH });
    await loadOptions();

    const row = document.querySelector('#selector-log-detail pre .journal-row')!;
    expect(row.firstElementChild).toBe(rowButtons()[0]); // la puce, avant le niveau et l'horodatage
    expect(rowButtons()[0]!.textContent).toBe(''); // une icône, aucun libellé : le nom est l'aria-label
    expect(rowButtons()[0]!.classList.contains('copied')).toBe(false);

    rowButtons()[0]!.click();
    await flush();

    expect(rowButtons()[0]!.classList.contains('copied')).toBe(true);
    expect(rowButtons()[1]!.classList.contains('copied')).toBe(false);
  });

  it('un presse-papiers qui refuse ne met pas la coche', async () => {
    installClipboard(true);
    installPage({ selectorFailures: RICH });
    await loadOptions();

    rowButtons()[0]!.click();
    await flush();

    expect(rowButtons()[0]!.classList.contains('copied')).toBe(false);
  });

  it('les deux boutons du journal reprennent les variantes de la page', async () => {
    installPage({ selectorFailures: RICH });
    await loadOptions();

    // `btn-p` : « Copier la configuration » ; `btn-quiet` : « Retirer » un hôte. Aucun style
    // propre à cette section pour ses deux actions.
    expect(copyAllButton()!.className).toBe('btn btn-p');
    expect(clearButton()!.className).toBe('btn btn-quiet');
  });

  it('la page dit « copié » une fois le presse-papiers servi', async () => {
    installClipboard();
    installPage({ selectorFailures: RICH });
    await loadOptions();

    rowButtons()[0]!.click();
    await flush();

    expect(document.querySelector('#selector-log-detail [role="status"]')?.textContent).toBe(
      ui('fr', 'options.status.selectors.copied')
    );
  });

  it('un presse-papiers qui refuse n’est pas annoncé « copié » : le texte est offert, sélectionné', async () => {
    installClipboard(true);
    installPage({ selectorFailures: RICH });
    await loadOptions();

    rowButtons()[0]!.click();
    await flush();

    const status = document.querySelector('#selector-log-detail [role="status"]')!;
    expect(status.textContent).toContain(ui('fr', 'options.status.selectors.copy.manual'));
    expect(status.textContent).not.toContain(ui('fr', 'options.status.selectors.copied'));
    const area = status.querySelector('textarea')!;
    expect(payload(area.value)['entry']).toEqual(RICH[0]);
    expect(area.readOnly).toBe(true);
  });

  // Revue PR #106 : le repli disait `Ctrl+C` seul, faux sur macOS, précisément quand le
  // presse-papiers refuse. La chaîne sœur du bloc de labels nomme déjà les deux raccourcis.
  it.each(['fr', 'en'])('la consigne de copie manuelle (%s) nomme le raccourci de chaque système', (language) => {
    const message = ui(language, 'options.status.selectors.copy.manual');

    expect(message).toContain('Ctrl+C');
    expect(message).toContain('⌘C');
  });

  it('le rapport tient quand une valeur contient une clôture Markdown', async () => {
    const written = installClipboard();
    installPage({
      selectorFailures: [{ chain: 'x', at: 'y', candidates: ['a[title="```"]'] }],
    });
    await loadOptions();

    rowButtons()[0]!.click();
    await flush();

    // Une clôture de trois accents refermerait le bloc au milieu du JSON.
    expect(payload(written[0]!)['entry']).toEqual({
      chain: 'x',
      at: 'y',
      candidates: ['a[title="```"]'],
    });
  });

  it('les lignes d’avant ces champs se copient aussi', async () => {
    const written = installClipboard();
    installPage({ selectorFailures: SEEDED });
    await loadOptions();

    rowButtons()[4]!.click(); // l'entrée sans adresse
    await flush();

    expect(payload(written[0]!)['entry']).toEqual(SEEDED[4]);
  });
});

// Le journal dit le PROBLÈME, pas le nom de la chaîne (§9.4) : une phrase courte dans la langue
// de la page, un niveau (WARN pour un sélecteur, ERROR pour une exception), le nom de la chaîne
// et le détail restant dans le rapport copié.
describe('§9.4 — une ligne dit le problème, avec son niveau', () => {
  const MIXED = [
    { chain: 'merge-button', problem: 'completion-control', at: '2026-10-30T08:35:55.958Z', url: `${PR}/files` },
    // Écrite avant les clés de description : le nom reste ce que la ligne dit.
    { chain: 'legacy-chain', at: '2026-10-30T07:56:08.497Z', url: `${PR}/files` },
    // Une clé que CETTE version ne connaît pas : jamais affichée telle quelle.
    { chain: 'future-chain', problem: 'inconnue-de-cette-version', at: '2026-10-30T07:56:09.000Z' },
    { kind: 'error', message: 'TypeError: x is undefined', at: '2026-10-30T09:02:00.000Z', url: `${PR}/files` },
  ];

  const rows = journalRows;
  const tags = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#selector-log-detail .lvl')];

  it('une chaîne qui déclare sa fonction s’affiche par la phrase de cette fonction', async () => {
    installPage({ selectorFailures: MIXED });
    await loadOptions();

    expect(rows()[0]).toContain(ui('fr', 'options.journal.problem.completion-control'));
    // Le nom de la chaîne est un mot de plateforme : il vit dans le rapport copié.
    expect(rows()[0]).not.toContain('merge-button');
  });

  it('la phrase suit la langue de la page', async () => {
    installPage({ selectorFailures: MIXED }, 'en');
    await loadOptions();

    expect(rows()[0]).toContain(ui('en', 'options.journal.problem.completion-control'));
    expect(rows()[0]).not.toContain(ui('fr', 'options.journal.problem.completion-control'));
  });

  it('sans clé, ou avec une clé inconnue, la ligne garde le nom de la chaîne', async () => {
    installPage({ selectorFailures: MIXED });
    await loadOptions();

    expect(rows()[1]).toContain('legacy-chain');
    expect(rows()[2]).toContain('future-chain');
    expect(rows()[2]).not.toContain('options.journal.problem'); // jamais la clé brute
  });

  it('une exception se dit par une phrase fonctionnelle, jamais par son message technique', async () => {
    installPage({ selectorFailures: MIXED });
    await loadOptions();

    expect(rows()[3]).toContain(ui('fr', 'options.journal.error'));
    // Le message technique est dans le rapport copié : le lire ici ne dit rien à la personne.
    expect(rows()[3]).not.toContain('TypeError');
    expect(rows()[3]).not.toContain('x is undefined');
    expect(tags().map((t) => t.textContent)).toEqual(['WARN', 'WARN', 'WARN', 'ERROR']);
    expect(tags()[3]!.classList.contains('lvl-error')).toBe(true);
    expect(tags()[0]!.classList.contains('lvl-warn')).toBe(true);
  });

  // Ce que le code faisait, dit en une phrase : « pendant l'affichage de la page ». Une exception
  // qu'aucun point d'entrée n'a relevée n'a pas de contexte, et le dit — elle n'invente pas une fonction.
  it('une exception avec contexte dit ce que le code faisait ; sans contexte, qu’on ne sait pas', async () => {
    installPage({
      selectorFailures: [
        { kind: 'error', context: 'render', message: 'TypeError: x', at: '2026-10-30T09:00:00.000Z' },
        { kind: 'error', context: 'editor', message: 'TypeError: y', at: '2026-10-30T09:01:00.000Z' },
        { kind: 'error', message: 'TypeError: z', at: '2026-10-30T09:02:00.000Z' },
        // Un contexte que CETTE version ne connaît pas : le repli, jamais la clé brute.
        { kind: 'error', context: 'inconnu', message: 'TypeError: w', at: '2026-10-30T09:03:00.000Z' },
      ],
    });
    await loadOptions();

    const lines = rows();
    expect(lines[0]).toContain(ui('fr', 'options.journal.error.render'));
    expect(lines[1]).toContain(ui('fr', 'options.journal.error.editor'));
    expect(lines[2]).toContain(ui('fr', 'options.journal.error'));
    expect(lines[3]).toContain(ui('fr', 'options.journal.error'));
    expect(lines[3]).not.toContain('options.journal.error.');
    // Jamais le message technique à l'écran.
    for (const line of lines) expect(line).not.toContain('TypeError');
  });

  it('le niveau reste WARN / ERROR dans toutes les langues : c’est un identifiant', async () => {
    installPage({ selectorFailures: MIXED }, 'en');
    await loadOptions();

    expect(tags().map((t) => t.textContent)).toEqual(['WARN', 'WARN', 'WARN', 'ERROR']);
  });

  it('l’en-tête compte des ENTRÉES : il n’accuse plus les seuls sélecteurs', async () => {
    installPage({ selectorFailures: MIXED });
    await loadOptions();

    expect(statusText()).toBe(ui('fr', 'options.status.selectors.some', { count: MIXED.length }));
    expect(statusText()).not.toContain('sélecteur');
  });

  it('la copie d’une ligne d’erreur porte le message et la pile, pas la phrase affichée', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
    });
    const withStack = { kind: 'error', message: 'TypeError: x is undefined', stack: 'at f (content.js:1:1)', at: 'x' };
    installPage({ selectorFailures: [withStack] });
    await loadOptions();

    document.querySelector<HTMLButtonElement>('#selector-log-detail pre button')!.click();
    await new Promise((r) => setTimeout(r, 0));
    delete (navigator as { clipboard?: unknown }).clipboard;

    expect(written[0]).toContain('"kind": "error"');
    // Ce que l'écran ne montre plus, la copie le garde : message technique ET pile.
    expect(written[0]).toContain('TypeError: x is undefined');
    expect(written[0]).toContain('at f (content.js:1:1)');
  });
});

