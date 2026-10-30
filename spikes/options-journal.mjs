// Le journal de la page d'options — MESURÉ dans un vrai Chromium (§9.4, CA-11).
//
// Ce fichier existe parce qu'une ligne de journal est une affirmation de MISE EN PAGE, et que
// happy-dom n'en sait rien : il dit de quel élément un nœud est enfant, jamais où il tombe. Deux
// défauts de la première version des lignes à niveau l'ont prouvé, tous deux invisibles en test
// unitaire :
//
//   • le bouton de copie n'était pas cliquable. Le retrait suspendu de la ligne (`text-indent`
//     négatif) est HÉRITÉ par les boîtes en ligne qu'elle contient : le texte du niveau (`WARN`)
//     se décalait par-dessus l'icône et interceptait ses clics. Le DOM disait le bouton visible.
//   • les phrases se coupaient au milieu des mots (« PR t / enue hors périmètre »). La règle
//     `word-break: break-all` de la section avait été écrite pour des chaînes de sélecteurs.
//
// D'où ce que ce fichier demande, ligne par ligne : le bouton est-il cliquable POUR DE VRAI
// (Playwright refuse de cliquer un élément recouvert, ce qui fait de l'échec une mesure) ; un mot
// tient-il sur UNE ligne ; et quand la phrase se replie, sa suite reprend-elle sous le niveau.
//
// CE QU'IL NE VÉRIFIE PAS : ce que le presse-papiers reçoit — c'est `options-journal.test.ts`,
// avec un faux qui peut refuser ; un Chromium sans tête n'accorde pas toujours l'accès.

import { chromium } from 'playwright-core';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const EXTENSION = resolve(here, '..', 'packages', 'extension', 'dist-ext');
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(EXTENSION)) {
  console.error(`Bundle absent : ${EXTENSION}\nLancez d'abord :  npm run build:extension`);
  process.exit(1);
}

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PR = 'https://github.com/acme/demo/pull/48';
// Des phrases réelles du vocabulaire, assez longues pour se replier à la largeur mesurée, plus
// une exception et une ligne écrite avant les clés de description.
const JOURNAL = [
  { chain: 'merge-button', problem: 'completion-control', at: '2026-10-30T08:35:55.958Z', url: `${PR}/files` },
  { chain: 'pr-created-at', problem: 'pr-creation-date', at: '2026-10-30T08:13:33.647Z', url: `${PR}/changes` },
  { chain: 'comment-author', problem: 'comment-writer', at: '2026-10-30T07:56:08.497Z', url: `${PR}/files?diff=split` },
  { chain: 'comment-body', problem: 'comment-text', at: '2026-10-30T07:56:08.497Z', url: `${PR}/files?diff=split` },
  { kind: 'error', message: "TypeError: Cannot read properties of undefined (reading 'closest')", at: '2026-10-30T09:02:11.100Z', url: `${PR}/files` },
  { chain: 'thread-anchor', at: '2026-10-27T22:03:41.500Z' },
];

const profile = mkdtempSync(join(tmpdir(), 'cct-journal-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: EXECUTABLE,
  headless: true,
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, '--no-sandbox'],
});

try {
  console.log('Journal de la page d’options — mesuré dans un vrai Chromium\n');

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  if (!worker) throw new Error('pas de service worker');

  // La page d'options s'ouvre d'elle-même à l'installation.
  const page = await (async () => {
    const deadline = Date.now() + 15000;
    for (;;) {
      const p = context.pages().find((q) => q.url().includes('options.html'));
      if (p) return p;
      if (Date.now() > deadline) return null;
      await sleep(150);
    }
  })();
  if (!page) throw new Error('page d’options jamais ouverte');
  await page.waitForLoadState('domcontentloaded');

  // Le journal est écrit dans le VRAI `chrome.storage.local`, depuis la page elle-même : c'est le
  // contexte qui l'a, et la page relit ce qu'on y écrit (`storage.onChanged`). La visite guidée
  // est écartée : son voile modal recouvrirait ce qu'on mesure.
  await page.evaluate(
    (journal) => chrome.storage.local.set({ optionsTourSeen: true, selectorFailures: journal }),
    JOURNAL
  );
  await page.reload();
  // Étroite à dessein : à 900 px, les phrases les plus longues se replient, et c'est là que les
  // deux défauts vivaient.
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.waitForSelector('#selector-log-detail .journal-row', { timeout: 10000 });
  await page.locator('#selector-log').scrollIntoViewIfNeeded();

  const rows = page.locator('#selector-log-detail .journal-row');
  const count = await rows.count();
  assert('une ligne par entrée du journal', count === JOURNAL.length, `${count}/${JOURNAL.length}`);

  // 1. Le bouton de CHAQUE ligne est cliquable. `trial` fait toute la vérification d'actionnabilité
  //    (visible, stable, et surtout : rien ne le recouvre) sans déclencher la copie.
  const unclickable = [];
  for (let i = 0; i < count; i++) {
    const button = rows.nth(i).locator('button.btn-icon');
    try {
      await button.click({ trial: true, timeout: 4000 });
    } catch (error) {
      unclickable.push(`#${i} ${String(error.message).split('\n').find((l) => l.includes('intercepts')) ?? 'non cliquable'}`);
    }
  }
  assert('le bouton de copie de chaque ligne est cliquable', unclickable.length === 0, unclickable.join(' ; '));

  // 2. Aucun mot n'est coupé : un mot qui tient sur deux lignes a deux rectangles à des
  //    hauteurs différentes.
  const layout = await page.evaluate(() => {
    const out = { split: [], wrapped: 0, hanging: [], bullets: new Set() };
    for (const row of document.querySelectorAll('#selector-log-detail .journal-row')) {
      const tag = row.querySelector('.lvl');
      const tagLeft = tag.getBoundingClientRect().left;
      out.bullets.add(Math.round(row.querySelector('button.btn-icon').getBoundingClientRect().left));
      const lefts = [];
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement.closest('button')) continue;
        for (const match of node.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rects = [...range.getClientRects()];
          const tops = new Set(rects.map((r) => Math.round(r.top / 3)));
          if (tops.size > 1) out.split.push(match[0]);
          if (rects[0]) lefts.push({ top: Math.round(rects[0].top), left: rects[0].left });
        }
      }
      const lines = [...new Set(lefts.map((l) => l.top))].sort((a, b) => a - b);
      if (lines.length > 1) {
        out.wrapped += 1;
        // Le retrait suspendu : le début de CHAQUE ligne repliée tombe sous le niveau.
        const starts = lines.slice(1).map((top) => Math.min(...lefts.filter((l) => l.top === top).map((l) => l.left)));
        for (const start of starts) out.hanging.push(Math.round(start - tagLeft));
      }
    }
    return { ...out, bullets: [...out.bullets] };
  });

  assert('au moins une ligne se replie à cette largeur — sinon rien n’est mesuré', layout.wrapped > 0, `${layout.wrapped} ligne(s)`);
  assert('aucun mot n’est coupé en deux', layout.split.length === 0, layout.split.join(', '));
  assert(
    'la suite d’une phrase repliée reprend sous le niveau (retrait suspendu)',
    layout.hanging.length > 0 && layout.hanging.every((d) => Math.abs(d) <= 2),
    `écarts à gauche du niveau : ${JSON.stringify(layout.hanging)} px`
  );
  assert('les icônes tombent toutes sur la même colonne', layout.bullets.length === 1, JSON.stringify(layout.bullets));
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées`);
if (failed.length > 0) {
  console.error(`\nÉchec : ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
