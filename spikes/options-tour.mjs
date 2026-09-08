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
// D'où la première question que ce fichier pose, à chaque étape : la fiche est-elle réellement
// DANS la fenêtre, et son bouton cliquable ? Le clic est fait pour de vrai — Playwright
// refuse de cliquer hors écran, ce qui fait de l'échec une mesure et non un avis.
//
// La seconde est de la même famille : de quelle COULEUR la page est-elle peinte pendant la
// visite ? L'assombrissement est une ombre portée, que `getComputedStyle` rapporte sur
// l'élément qui la projette et jamais sur ceux qu'elle recouvre — il faut donc lire le pixel,
// et le lire dans les DEUX thèmes, dont les jetons vivent dans des blocs distincts.
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

  // 5bis. Ce qui assombrit la page, et où. `inset: 0` en `position: absolute` se résout
  //    contre le bloc conteneur INITIAL — haut d'un écran, pas du document : le voile
  //    s'arrêtait net au premier défilement, laissant une couture horizontale entre deux
  //    gris, et il passait SOUS la lucarne, grisant la zone qu'elle devait éclairer.
  //    happy-dom ne peut voir ni l'un ni l'autre, il n'a pas de mise en page.
  await opened.click('#tour-replay', { timeout: 4000 });
  await opened.waitForSelector('.tour-popover', { timeout: 5000 });
  const veilOnFirst = await opened.evaluate(() => {
    const veil = document.querySelector('.tour-veil');
    return {
      present: Boolean(veil) && !veil.hidden,
      dims: veil?.classList.contains('tour-veil-dim') ?? null,
    };
  });
  assert(
    'tant qu’il y a une lucarne, le voile bloque sans assombrir',
    veilOnFirst.present === true && veilOnFirst.dims === false,
    JSON.stringify(veilOnFirst)
  );

  // 5ter. COMBIEN la page est assombrie autour de la lucarne, et la fiche se distingue-t-elle
  //    de ce qu'elle recouvre ? Deux affirmations de couleur, et la première ne peut pas se
  //    lire dans le DOM : l'assombrissement est une OMBRE PORTÉE, que `getComputedStyle`
  //    rapporte sur l'élément qui la projette et jamais sur ceux qu'elle recouvre. Il faut
  //    donc lire le pixel réellement peint.
  //
  //    Livrée, la visite assombrissait à 55 % de noir et donnait à sa fiche la couleur des
  //    panneaux (`--bg-surface`) : en thème sombre, un fond de page déjà presque noir ne
  //    noircissait plus guère, et la fiche se fondait dans les panneaux qu'elle recouvrait.
  //    Rien de tout cela n'était visible ailleurs que sur une capture.
  const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  /** La couleur RÉELLEMENT peinte en un point de la fenêtre, composition comprise. La
   * capture est un carré d'UN pixel : le décodage tient alors dans un canvas, et coûte le
   * prix d'une capture minuscule plutôt que celui d'une page entière. */
  async function pixelAt(page, x, y) {
    const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64');
    return page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    }, png);
  }

  /** Le fond de page tel qu'il est peint HORS lucarne, rapporté à ce qu'il vaut sans voile.
   * Un rapport, et non une couleur : c'est la même exigence qui doit tenir dans les deux
   * thèmes, alors que les couleurs, elles, n'y ont rien de commun. */
  async function dimRatio(page) {
    const clear = await page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)
        .map(Number);
      return { r, g, b };
    });
    // (3, 3) : le coin de la fenêtre. La page fait 44rem centrées, la lucarne et la fiche
    // vivent dedans — ce coin ne montre donc que le fond, sous l'assombrissement.
    const dimmed = await pixelAt(page, 3, 3);
    return { ratio: luminance(dimmed) / luminance(clear), clear, dimmed };
  }

  const dimLight = await dimRatio(opened);
  assert(
    'hors lucarne, le fond perd au moins 60 % de sa luminosité (thème clair)',
    dimLight.ratio <= 0.4,
    `${(dimLight.ratio * 100).toFixed(1)} % restants — ${JSON.stringify(dimLight.dimmed)}`
  );

  // Le thème sombre est l'autre moitié de la question, et la plus exposée : ses jetons
  // vivent dans un bloc `@media` distinct, qu'une retouche du thème clair laisse en arrière.
  await opened.emulateMedia({ colorScheme: 'dark' });
  const dimDark = await dimRatio(opened);
  const raised = await opened.evaluate(() => {
    const read = (element) =>
      getComputedStyle(element)
        .backgroundColor.match(/\d+/g)
        .map(Number);
    const [pr, pg, pb] = read(document.querySelector('.tour-popover'));
    const [sr, sg, sb] = read(document.getElementById('panel-known'));
    return { popover: { r: pr, g: pg, b: pb }, surface: { r: sr, g: sg, b: sb } };
  });
  await opened.emulateMedia({ colorScheme: null });
  assert(
    'hors lucarne, le fond perd au moins 60 % de sa luminosité (thème sombre)',
    dimDark.ratio <= 0.4,
    `${(dimDark.ratio * 100).toFixed(1)} % restants — ${JSON.stringify(dimDark.dimmed)}`
  );
  assert(
    'en thème sombre, la fiche est une surface SURÉLEVÉE, pas la couleur des panneaux',
    luminance(raised.popover) > luminance(raised.surface) + 8,
    JSON.stringify(raised)
  );

  // Jusqu'à la dernière étape, en comptant les clics plutôt qu'en devinant : le compteur
  // annonce le total, et cliquer une fois de trop refermerait la visite.
  const total = Number(/(\d+)\s*(?:sur|of)\s*(\d+)/.exec(
    await opened.textContent('.tour-counter')
  )?.[2] ?? 0);
  for (let i = 1; i < total; i += 1) {
    await opened.click('.tour-next', { timeout: 4000 });
    await sleep(150);
  }
  const lastStep = await opened.evaluate(() => {
    const veil = document.querySelector('.tour-veil');
    const box = veil?.getBoundingClientRect();
    return {
      counter: document.querySelector('.tour-counter')?.textContent,
      veilShown: veil ? !veil.hidden && veil.classList.contains('tour-veil-dim') : false,
      spotHidden: document.querySelector('.tour-spot')?.hidden === true,
      // Le voile couvre-t-il RÉELLEMENT la fenêtre, à la position de défilement courante ?
      covers:
        Boolean(box) &&
        box.top <= 0 &&
        box.left <= 0 &&
        box.bottom >= window.innerHeight &&
        box.right >= window.innerWidth,
    };
  });
  assert(
    'à la dernière étape, le voile seul assombrit, et couvre la fenêtre entière',
    lastStep.veilShown && lastStep.spotHidden && lastStep.covers,
    JSON.stringify(lastStep)
  );
  await opened.click('.tour-next', { timeout: 4000 });
  await sleep(200);

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

  // 8. Le voile BLOQUE, et pas seulement en apparence. L'ombre de la lucarne assombrit sans
  //    rien arrêter (`pointer-events: none`) : sans voile, tous les contrôles de la page
  //    resteraient cliquables sous une fiche qui se déclare `aria-modal`. Ce que
  //    `elementFromPoint` rend au-dessus d'un bouton de la page est la seule réponse qui
  //    vaille — un test unitaire ne connaît pas l'empilement.
  const blocked = await opened.evaluate(() => {
    const target = document.getElementById('host-add');
    const box = target.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { onTop: hit?.className ?? hit?.tagName, reachesButton: hit === target };
  });
  assert(
    'pendant la visite, un bouton de la page n’est pas atteignable à la souris',
    blocked.reachesButton === false,
    JSON.stringify(blocked)
  );
  await opened.keyboard.press('Escape');
  await opened.waitForSelector('.tour-popover', { state: 'detached', timeout: 5000 });

  // 9. Changer la langue applique le catalogue TOUT DE SUITE. Corriger un écran qui
  //    n'appliquait pas le réglage qu'il propose, pour qu'il ne se l'applique toujours pas
  //    sur-le-champ, serait la même faute d'un cran plus loin.
  // Partir du FRANÇAIS, sinon l'assertion est vide : le reste de ce fichier tourne en
  // anglais, et vérifier qu'une page anglaise est anglaise passerait sans le correctif. La
  // première version de cette mesure faisait exactement ça.
  /** Choisir une langue et attendre que la PAGE la porte. L'attente est capturée plutôt que
   * laissée remonter : sans le correctif elle expire, et une pile d'exception à la place
   * d'un ✗ ne dit pas quelle propriété a lâché. */
  async function chooseLanguage(code) {
    await opened.selectOption('#language', code);
    try {
      await opened.waitForFunction(
        (expected) => document.documentElement.lang === expected,
        code,
        { timeout: 8000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  // Partir du FRANÇAIS, sinon l'assertion est vide : le reste de ce fichier tourne en
  // anglais, et vérifier qu'une page anglaise est anglaise passerait sans le correctif. La
  // première version de cette mesure faisait exactement ça.
  const toFrench = await chooseLanguage('fr');
  const toEnglish = toFrench && (await chooseLanguage('en'));
  const switched = await opened.evaluate(() => ({
    lang: document.documentElement.lang,
    heading: document.querySelector('[data-i18n="options.hosts.heading"]')?.textContent,
    // Une chaîne construite PAR LE CODE, pas seulement une chaîne statique : c'est là que la
    // langue pouvait rester en arrière.
    replay: document.querySelector('[data-i18n="options.tour.replay"]')?.textContent,
    selected: document.getElementById('language')?.value,
  }));
  assert(
    'changer la langue rhabille la page immédiatement',
    toFrench &&
      toEnglish &&
      switched.lang === 'en' &&
      switched.heading === 'Allowed domains' &&
      switched.selected === 'en',
    `fr:${toFrench} en:${toEnglish} ${JSON.stringify(switched)}`
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
