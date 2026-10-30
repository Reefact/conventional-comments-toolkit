// Filtre local par label (§5.5) — l'extension EMPAQUETÉE, sur une page GitHub CAPTURÉE, dans un
// vrai Chromium, avec de vrais clics.
//
// Ce que les tests happy-dom (extension/test/thread-filter.test.ts) ne peuvent pas dire : que le
// vrai `content.js` monte bien la barre de puces sur une vraie page GitHub, que les puces
// proposées sont celles des fils PRÉSENTS, et qu'un clic masque (et rend) effectivement les bons
// fils — vu par le moteur de rendu, pas par un attribut. Les nombres attendus sont lus dans le DOM
// de la capture (préfixe du premier commentaire de chaque fil), jamais déduits de la logique de
// l'extension : un test qui recalcule avec le code testé constate seulement qu'il est cohérent.
//
// Ce qui est RÉEL : le bundle `dist-ext/content.js` et `styles.css`, le DOM de la capture 01 de
// `packages/adapters/github/test/fixtures/pages/`, Chromium, les clics.
// Ce qui est ARRANGÉ, et doit rester écrit ici :
//   - le manifeste est une COPIE où `https://github.com/*` est une permission d'hôte STATIQUE, et
//     l'étiquette `github.com → github` est écrite dans `chrome.storage.local` par le test.
//     Dans le produit, la permission est optionnelle et l'étiquette vient de la page d'options
//     (`options.ts`, même clé `hostPlatforms`, même forme) : l'utilisateur accorde, puis classe
//     l'hôte — un hôte sans étiquette n'est volontairement pas deviné (§2). C'est cet état qui
//     fait publier la répartition et enregistrer le script de contenu par le VRAI service
//     worker ; le test attend cet enregistrement avant de charger la page, un document déjà
//     ouvert ne recevant rien (spikes/open-tab-injection.mjs). Deux essais ont précédé :
//     `content_scripts` déclaré à la main (script injecté mais inerte, `github.com` absent de la
//     répartition), puis la permission seule (aucun enregistrement, hôte non classé) ;
//   - la page est servie à l'URL github.com par interception de requête, les <script> de GitHub
//     retirés (ils ne s'exécuteraient de toute façon pas hors ligne) ; les feuilles de GitHub ne
//     chargent pas non plus — la mise en page mesurée n'est donc PAS celle de github.com, À UNE
//     RÈGLE PRÈS, ajoutée à la main (`PRIMER_D_BLOCK`). Une première version de ce test ne la
//     portait pas, a rendu 30 vérifications vertes, et le filtre ne masquait pourtant rien sur
//     github.com : chaque fil porte la classe `d-block`, et un `display: none` en ligne ne bat pas
//     un `display: block !important` de feuille. Un monde sans feuille est un monde où le code
//     marche. La règle est inférée de DEUX observations faites sur la vraie page — un fil à la
//     fois `style="display: none"` + `data-cct-filtered` dans le DOM, et visible à l'écran —,
//     pas relue dans la feuille de GitHub : à confronter à github.com si elle change ;
//   - tout ce qui n'est pas la page est refusé, la lecture de configuration comprise : c'est
//     la configuration PAR DÉFAUT qui s'applique, pas celle d'un dépôt ;
//   - la variante « typo » réécrit, dans le HTML servi, le préfixe d'UN commentaire (`praise
//     (test)` → `typo`) pour reproduire les trois puces de la capture d'écran du ticket.
//
// Prérequis : `npm run build && npm run build:extension`.

import { chromium } from 'playwright-core';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const DIST = join(root, 'packages', 'extension', 'dist-ext');
const FIXTURE = join(
  root,
  'packages/adapters/github/test/fixtures/pages/01-conversation-nouveau-commentaire.html'
);
const PAGE_URL = 'https://github.com/Reefact/just-dummies/pull/331';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const SHOTS = process.env.CCT_SHOTS_DIR ?? null;

for (const [what, path] of [['Chromium', EXECUTABLE], ['Bundle (npm run build:extension)', DIST], ['Capture', FIXTURE]]) {
  if (!existsSync(path)) {
    console.error(`${what} introuvable : ${path}`);
    process.exit(1);
  }
}

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function waitFor(probe, { timeoutMs = 15000, everyMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

// Copie du bundle avec le manifeste dont le seul écart est `content_scripts`.
const ext = mkdtempSync(join(tmpdir(), 'cct-thread-filter-ext-'));
cpSync(DIST, ext, { recursive: true });
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['https://github.com/*'];
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));

/** La règle qui rend un `display: none` en ligne inopérant sur les fils (voir l'en-tête). */
const PRIMER_D_BLOCK = '<style>.d-block { display: block !important; }</style>';

const captured = readFileSync(FIXTURE, 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace('</head>', `${PRIMER_D_BLOCK}</head>`);

/** Ce que la PAGE dit de ses fils, lu sans passer par l'extension : le label que le premier
 * commentaire de chaque fil porte en toutes lettres. À lire sur une page où l'extension ne
 * s'active pas (`baseline()`) : une fois décoré, le début du texte est celui d'un badge. */
const readRawLabels = () =>
  [...document.querySelectorAll('.js-resolvable-timeline-thread-container')].map((el) => {
    const body = el.querySelector('.comment-body')?.textContent.trim() ?? '';
    return /^([A-Za-z]+)\b/.exec(body)?.[1]?.toLowerCase() ?? null;
  });

/** Ce que le MOTEUR DE RENDU dit de chaque fil, après l'extension. */
const readThreads = () =>
  [...document.querySelectorAll('.js-resolvable-timeline-thread-container')].map((el) => ({
    visible: el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none',
    inlineDisplay: el.style.display,
    marked: el.dataset.cctFiltered !== undefined,
  }));

const readChips = () =>
  [...document.querySelectorAll('.cct-thread-filter .cct-filter-chip')].map((c) => ({
    text: c.textContent,
    pressed: c.getAttribute('aria-pressed'),
    visible: c.getClientRects().length > 0,
  }));

/** Les labels des fils tels que la capture les porte, lus sur une origine que le script de contenu
 * ne cible pas (`https://baseline.invalid/*` : hors de la permission d'hôte, donc hors de
 * l'enregistrement). */
async function baseline(context, html) {
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
      : route.abort()
  );
  await page.goto('https://baseline.invalid/pull/331', { waitUntil: 'domcontentloaded' });
  const labels = await page.evaluate(readRawLabels);
  const touched = await page.evaluate(() => document.querySelectorAll('[class*="cct-"]').length);
  await page.close();
  return { labels, touched };
}

async function scenario(context, title, html, expectedLabels) {
  console.log(`\n${title}`);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (route.request().resourceType() === 'document' && url.href === PAGE_URL) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    }
    return route.abort();
  });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });

  const raw = await baseline(context, html);
  assert('la lecture brute de la capture n’est pas décorée par l’extension', raw.touched === 0, `${raw.touched} élément(s) cct-*`);
  assert(
    'la capture porte bien les labels attendus',
    expectedLabels.every((l) => raw.labels.includes(l)),
    JSON.stringify(raw.labels.filter(Boolean))
  );

  const mounted = await waitFor(() => page.evaluate(() => document.querySelector('.cct-thread-filter') !== null));
  assert('la barre de filtre est montée par le vrai content.js', Boolean(mounted));
  if (!mounted) {
    const state = await page.evaluate(() => ({
      plateforme: document.documentElement.dataset.cctPlatform ?? null,
      elementsCct: document.querySelectorAll('[class*="cct-"]').length,
      fils: document.querySelectorAll('.js-resolvable-timeline-thread-container').length,
    }));
    console.log('    état de la page :', JSON.stringify(state));
    for (const line of consoleLines.slice(0, 10)) console.log('    console :', line);
    await page.close();
    return;
  }

  const chips = await page.evaluate(readChips);
  // L'ORDRE des puces est celui de la configuration (thread-filter.ts) : le test ne le fige pas,
  // il vérifie QUELS labels sont proposés, « all » en tête.
  const order = chips.map((c) => c.text);
  assert(
    'les puces sont « all » puis exactement les labels PRÉSENTS sur la page',
    order[0] === 'all' && same(order.slice(1).sort(), [...expectedLabels].sort()),
    JSON.stringify(order)
  );
  assert('« all » est la puce active au départ', same(chips.map((c) => c.pressed), ['true', ...order.slice(1).map(() => 'false')]));
  assert('les puces sont visibles à l’écran', chips.every((c) => c.visible));

  const before = await page.evaluate(readThreads);
  assert('aucun fil n’est masqué au départ', before.every((t) => t.visible), `${before.length} fils`);
  if (SHOTS) await page.locator('.cct-thread-filter').screenshot({ path: join(SHOTS, `${title.split(' ')[0]}-all.png`) });

  for (const label of expectedLabels) {
    await page.locator(`.cct-thread-filter .cct-filter-chip[data-label="${label}"]`).click();
    const threads = await page.evaluate(readThreads);
    const expected = raw.labels.map((l) => l === label);
    const seen = threads.map((t) => t.visible);
    assert(
      `clic « ${label} » : seuls les fils dont le premier commentaire est « ${label} » restent visibles`,
      same(seen, expected) && expected.some(Boolean),
      `${seen.filter(Boolean).length} visible(s) sur ${threads.length}, attendu ${expected.filter(Boolean).length}`
    );
    const pressed = (await page.evaluate(readChips)).map((c) => c.pressed);
    assert(`clic « ${label} » : seule cette puce est active (aria-pressed)`, same(pressed, order.map((l) => String(l === label))), JSON.stringify(pressed));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${title.split(' ')[0]}-${label}.png`), fullPage: false });
  }

  await page.locator('.cct-thread-filter .cct-filter-chip[data-label=""]').click();
  const after = await page.evaluate(readThreads);
  assert('retour sur « all » : tous les fils sont de nouveau visibles', after.every((t) => t.visible));
  assert(
    'retour sur « all » : aucun marqueur ni display en ligne laissé sur la page',
    after.every((t) => !t.marked && t.inlineDisplay === before[0].inlineDisplay),
    JSON.stringify([...new Set(after.map((t) => t.inlineDisplay))])
  );
  assert('aucune erreur JavaScript dans la page', pageErrors.length === 0, pageErrors.join(' | '));
  await page.close();
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cct-thread-filter-')), {
  executablePath: EXECUTABLE,
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
});

try {
  console.log('Filtre par label — extension empaquetée, capture GitHub, vrai Chromium');
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  assert('l’extension se charge (service worker démarré)', Boolean(worker));

  // Le service worker enregistre le script de contenu depuis les permissions accordées. On
  // attend CET enregistrement : charger la page avant, c'est charger un document que le script
  // n'atteindra jamais.
  if (worker) {
    await worker.evaluate(() => chrome.storage.local.set({ hostPlatforms: { 'github.com': 'github' } }));
  }
  const registered = worker
    ? await waitFor(() =>
        worker
          .evaluate(() => chrome.scripting.getRegisteredContentScripts())
          .then((scripts) => (scripts.length > 0 ? scripts : null))
          .catch(() => null)
      )
    : null;
  assert(
    'le service worker a enregistré le script de contenu pour github.com',
    Boolean(registered),
    registered ? JSON.stringify(registered.map((r) => ({ id: r.id, matches: r.matches }))) : 'aucun enregistrement'
  );

  // 1. La capture telle quelle : des fils `issue` et un fil `praise`, réels.
  await scenario(context, 'capture-brute — la capture 01 inchangée', captured, ['issue', 'praise']);

  // 2. Les trois puces de la capture d'écran : `praise (test)` devient `typo`.
  const occurrences = captured.split('praise (test)').length - 1;
  const withTypo = captured.replaceAll('praise (test)', 'typo');
  console.log(`\n(variante : ${occurrences} occurrence(s) de « praise (test) » réécrite(s) en « typo »)`);
  await scenario(context, 'variante-typo — mêmes puces que la capture d’écran', withTypo, ['issue', 'typo']);
} finally {
  await context.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`);
process.exit(failed.length === 0 ? 0 : 1);
