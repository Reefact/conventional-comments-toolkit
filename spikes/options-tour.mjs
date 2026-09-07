// La visite guidée de la page d'options — MESURÉE dans un vrai Chromium (§9.4).
//
// Ce fichier existe parce qu'une visite guidée est une affirmation de MISE EN PAGE, et que
// happy-dom n'en sait rien : il dit de quel élément un nœud est enfant, jamais où il tombe.
// Deux défauts l'ont prouvé sur la première version, tous deux invisibles en test unitaire
// et tous deux fatals à l'usage :
//
//   • la DERNIÈRE étape était inatteignable. Sans cible, la fiche passe en `position: fixed`
//     pour se centrer — mais gardait les `top`/`left` en ligne de l'étape précédente,
//     calculés en coordonnées de DOCUMENT et réinterprétés en coordonnées de FENÊTRE. Le
//     bouton « Terminer » existait, le DOM le disait visible, et il était hors écran.
//   • l'étape « État » visait la dernière section de la page, que le navigateur ne PEUT pas
//     centrer faute de contenu après elle : sa fiche débordait sous le bord de la fenêtre.
//
// D'où la seule question que ce fichier pose, à chaque étape : la fiche est-elle réellement
// DANS la fenêtre, et son bouton cliquable ? Le clic est fait pour de vrai — Playwright
// refuse de cliquer hors écran, ce qui fait de l'échec une mesure et non un avis.
//
// CE QU'IL NE VÉRIFIE PAS : le contenu des textes. Leur présence dans les deux catalogues
// est un problème de parité, tenu par `test/i18n-strings.test.ts`.

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

const profile = mkdtempSync(join(tmpdir(), 'cct-tour-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: EXECUTABLE,
  headless: true,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--no-sandbox',
  ],
});

try {
  console.log('Visite guidée de la page d’options — mesurée dans un vrai Chromium\n');

  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  if (!worker) throw new Error('pas de service worker');

  // 1. La page d'options s'ouvre SEULE à l'installation. C'est la seule migration possible
  //    pour qui met à jour : `permissions.request()` exige un geste humain, qu'un service
  //    worker ne peut pas produire. Sans cette ouverture, l'extension se tait partout et
  //    rien ne dit pourquoi.
  const opened = await (async () => {
    const deadline = Date.now() + 15000;
    for (;;) {
      const page = context.pages().find((p) => p.url().includes('options.html'));
      if (page) return page;
      if (Date.now() > deadline) return null;
      await sleep(150);
    }
  })();
  assert(
    'la page d’options s’ouvre d’elle-même à l’installation',
    Boolean(opened),
    context
      .pages()
      .map((p) => p.url())
      .join(' ')
  );
  if (!opened) throw new Error('page d’options jamais ouverte');
  await opened.waitForLoadState('domcontentloaded');
  // La fiche, et non `#tour` : la racine de la visite n'a aucune dimension propre — ses
  // enfants sont tous en position absolue —, donc Playwright la tient pour invisible.
  await opened.waitForSelector('.tour-popover', { timeout: 10000 });

  // 2. La visite démarre sur cette première ouverture, et sait combien d'étapes elle a.
  const first = await opened.evaluate(() => {
    const root = document.getElementById('tour');
    return root
      ? {
          counter: root.querySelector('.tour-counter')?.textContent,
          lang: document.documentElement.lang,
          backHidden: root.querySelector('.tour-back')?.hidden,
        }
      : null;
  });
  assert(
    'la visite démarre à la première étape, sans « Précédent »',
    first?.backHidden === true && /1/.test(first?.counter ?? ''),
    JSON.stringify(first)
  );

  // 3. « Domaines non configurés » est ABSENTE du parcours tant que rien ne l'a remplie.
  //    Une visite qui présenterait une anomalie inexistante l'inventerait.
  const skipsAnomaly = await opened.evaluate(
    () => document.getElementById('unconfigured-panel')?.hasAttribute('hidden') === true
  );
  assert(
    'la zone d’anomalie est vide, donc hors du parcours',
    skipsAnomaly && /sur 7|of 7/.test(first?.counter ?? ''),
    first?.counter
  );

  // 4. LE cœur du fichier : parcourir en cliquant pour de vrai. Playwright refuse de cliquer
  //    un élément hors écran — l'échec est donc une mesure, pas un jugement esthétique.
  const walked = [];
  let clickFailure = null;
  for (let i = 0; i < 12; i += 1) {
    const step = await opened.evaluate(() => {
      const root = document.getElementById('tour');
      if (!root) return null;
      const box = root.querySelector('.tour-popover').getBoundingClientRect();
      return {
        title: root.querySelector('.tour-title')?.textContent,
        inside:
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= window.innerHeight &&
          box.right <= window.innerWidth,
      };
    });
    if (!step) break;
    walked.push(step);
    try {
      await opened.click('.tour-next', { timeout: 4000 });
    } catch (error) {
      clickFailure = `${step.title} : ${error.message.split('\n')[0]}`;
      break;
    }
    await sleep(200);
  }
  const outside = walked.filter((s) => !s.inside).map((s) => s.title);
  assert(
    'chaque étape place sa fiche DANS la fenêtre',
    outside.length === 0 && clickFailure === null,
    outside.length > 0 ? `hors fenêtre : ${outside.join(', ')}` : (clickFailure ?? '')
  );
  assert(
    'le parcours va jusqu’au bout et se referme',
    walked.length === 7 && (await opened.evaluate(() => document.getElementById('tour') === null)),
    `${walked.length} étapes : ${walked.map((s) => s.title).join(' → ')}`
  );

  // 5. Une visite terminée ne se rejoue pas. Le drapeau vit dans `storage.local`, donc il
  //    doit survivre à un rechargement — c'est ce qu'on vérifie, et non qu'on l'a écrit.
  await opened.reload();
  await opened.waitForLoadState('domcontentloaded');
  await sleep(1200);
  assert(
    'une visite terminée ne se rejoue pas au rechargement',
    await opened.evaluate(() => document.getElementById('tour') === null)
  );

  // 6. …mais elle se REJOUE à la demande. Le bouton vit en haut de page, la visite fait
  //    défiler : après un parcours, la page est restée en bas, et un bouton qu'on ne peut
  //    plus atteindre ne sert à rien. Playwright refuse de cliquer hors écran, donc ce clic
  //    est la mesure.
  await opened.click('#tour-replay', { timeout: 4000 });
  await opened.waitForSelector('.tour-popover', { timeout: 5000 });
  const replayed = await opened.evaluate(() => {
    const root = document.getElementById('tour');
    const box = root?.querySelector('.tour-popover')?.getBoundingClientRect();
    return {
      popovers: document.querySelectorAll('.tour-popover').length,
      counter: root?.querySelector('.tour-counter')?.textContent,
      inside: Boolean(box) && box.top >= 0 && box.bottom <= window.innerHeight,
    };
  });
  assert(
    'le bouton « Revoir » relance la visite, à la première étape et dans la fenêtre',
    replayed.popovers === 1 && /1/.test(replayed.counter ?? '') && replayed.inside,
    JSON.stringify(replayed)
  );

  // 7. Un second clic ne doit pas EMPILER une visite : le bouton reste cliquable pendant
  //    qu'une visite tourne, et deux voiles superposés n'en laisseraient qu'un fermable.
  //    Le bouton est sous le voile, donc le clic est forcé — ce que la personne ne pourrait
  //    pas faire, mais le test doit prouver que le code y résiste quand même.
  await opened.click('#tour-replay', { force: true });
  assert(
    'un second appel n’empile pas une deuxième visite',
    (await opened.evaluate(() => document.querySelectorAll('.tour-popover').length)) === 1
  );
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
