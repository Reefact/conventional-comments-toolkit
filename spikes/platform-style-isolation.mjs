// Ce que la scission des feuilles par plateforme promet, MESURÉ dans un vrai Chromium.
//
// Une indirection de jetons ne se vérifie pas en lisant le CSS : la cascade, la spécificité et
// la substitution des `var()` se répondent d'une façon qu'aucune lecture ne tranche. Deux
// affirmations sont donc mesurées ici, et elles sont la raison d'être de tout le chantier :
//
//   1. NON-RÉGRESSION — hors GitHub, chaque propriété rend EXACTEMENT ce qu'elle rendait avant
//      la scission. Contrôle DIFFÉRENTIEL : la feuille d'avant (reconstituée depuis git) et la
//      feuille d'aujourd'hui sont chargées dans deux pages jumelles, et l'on compare valeur à
//      valeur. C'est la seule façon de prouver qu'on n'a pas changé le rendu d'Azure DevOps en
//      croyant ne toucher qu'à GitHub — le défaut même qu'on corrige.
//
//   2. ISOLATION — un changement dans la feuille GitHub ne peut PAS atteindre une page qui
//      n'est pas GitHub. Vérifié en injectant une valeur absurde dans la couche GitHub et en
//      constatant qu'aucune propriété ne bouge sans le marqueur de plateforme, et qu'elles
//      bougent avec.
//
// La seconde est le garde permanent : elle échoue le jour où quelqu'un écrit une règle de
// plateforme hors de son scope. La première est une contre-épreuve de ce chantier-ci, gardée
// parce qu'elle vaudra encore à la prochaine scission.
//
// Ce que ce garde ne peut PAS voir, et qui doit rester écrit ici : il mesure sur une page
// FABRIQUÉE, pas sur github.com. Il dit que la mécanique du scope est correcte, jamais que les
// jetons Primer existent encore — c'est le travail du canari (scripts/check-github-theme-vars.mjs),
// qui, lui, va sur la vraie page.

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(EXECUTABLE)) {
  console.error(`Chromium introuvable : ${EXECUTABLE}\nUne fois par machine :  npx playwright-core install chromium`);
  process.exit(1);
}

const SHARED = join(root, 'packages/extension/src/styles.css');
const GITHUB = join(root, 'packages/adapters/github/src/platform.css');

/** La feuille partagée telle qu'elle était AVANT la scission — lue dans git, jamais recopiée
 * ici : une copie figée cesserait d'être la référence dès le commit suivant, et le contrôle
 * différentiel comparerait alors deux fois la même chose sans le dire. */
const BEFORE_REF = process.env.CCT_STYLES_BEFORE_REF ?? 'origin/main:packages/extension/src/styles.css';

function stylesBefore() {
  try {
    return execFileSync('git', ['show', BEFORE_REF], { cwd: root, encoding: 'utf8', maxBuffer: 8 << 20 });
  } catch (e) {
    console.error(
      `Impossible de lire la feuille de référence (${BEFORE_REF}) : ${e.message}\n` +
        'Le contrôle différentiel n\'a alors AUCUNE valeur — il comparerait la feuille actuelle\n' +
        'à elle-même et passerait au vert sans rien prouver. Échouer est le seul verdict honnête.\n' +
        'Précisez une autre référence avec CCT_STYLES_BEFORE_REF=<rev>:<chemin>.'
    );
    process.exit(1);
  }
}

/** Un exemplaire de chaque surface que l'extension peint, avec les classes réelles qu'elle
 * pose. Ce sont les propriétés de ces éléments qu'on compare. */
const FIXTURE = `
  <div class="cct-host"><textarea class="cct-editor"></textarea></div>
  <div class="cct-toolbar">
    <button class="cct-label-button" id="btn">issue</button>
    <button class="cct-label-button cct-active" id="btnActive">todo</button>
    <div class="cct-decoration-group" id="decoGroup">
      <button class="cct-decoration-segment" id="seg">blocking</button>
      <button class="cct-decoration-segment cct-active" id="segActive">none</button>
    </div>
  </div>
  <div class="cct-feedback" id="feedback">
    <ul class="cct-diagnostics">
      <li data-severity="error" id="diagError">erreur</li>
      <li data-severity="warn" id="diagWarn">avertissement</li>
    </ul>
  </div>
  <textarea class="cct-border-ok" id="ringOk"></textarea>
  <textarea class="cct-border-warn" id="ringWarn"></textarea>
  <textarea class="cct-border-error" id="ringError"></textarea>
  <div class="cct-banner" id="banner">
    <span class="cct-banner-glyph" id="glyph">!</span>
    <span class="cct-banner-label" id="bannerLabel">3</span>
    <ul class="cct-banner-list"><li id="bannerLi">un</li><li>deux</li></ul>
  </div>
  <span class="cct-badge" id="badge">issue</span>
  <span class="cct-badge cct-badge-flat" id="badgeFlat">issue</span>
  <span class="cct-badge cct-blocking" id="badgeBlocking">blocking</span>
  <span class="cct-badge cct-non-blocking" id="badgeNonBlocking">non-blocking</span>
  <button class="cct-filter-chip" id="chip">filtre</button>
  <ul class="cct-quick-list" id="quickList"><li class="cct-quick-item cct-active" id="quickItem">issue</li></ul>
`;

/** Les propriétés qui portent une couleur, une forme ou un espacement issus d'un jeton — les
 * seules que la scission pouvait changer. */
const PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-top-width',
  'border-top-left-radius',
  'outline-color',
  'outline-width',
  'outline-offset',
  'padding-left',
  'padding-top',
  'margin-top',
];

const IDS = [
  'btn', 'btnActive', 'decoGroup', 'seg', 'segActive', 'feedback', 'diagError', 'diagWarn',
  'ringOk', 'ringWarn', 'ringError', 'banner', 'glyph', 'bannerLabel', 'bannerLi',
  'badge', 'badgeFlat', 'badgeBlocking', 'badgeNonBlocking', 'chip', 'quickList', 'quickItem',
];

async function measure(page, { css, platform }) {
  await page.setContent(
    `<!doctype html><html${platform ? ` data-cct-platform="${platform}"` : ''}><head><style>${css}</style></head>` +
      `<body>${FIXTURE}</body></html>`
  );
  return page.evaluate(
    ({ ids, props }) => {
      const out = {};
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) {
          out[id] = 'ABSENT';
          continue;
        }
        const s = getComputedStyle(el);
        out[id] = props.map((p) => `${p}=${s.getPropertyValue(p)}`).join('|');
      }
      return out;
    },
    { ids: IDS, props: PROPS }
  );
}

function diff(a, b) {
  const out = [];
  for (const id of IDS) {
    if (a[id] === b[id]) continue;
    const was = (a[id] ?? '').split('|');
    const now = (b[id] ?? '').split('|');
    const changed = was.map((w, i) => [w, now[i]]).filter(([w, n]) => w !== n);
    out.push({ id, changed });
  }
  return out;
}

const shared = readFileSync(SHARED, 'utf8');
const github = readFileSync(GITHUB, 'utf8');
const before = stylesBefore();
const after = `${shared}\n${github}`;

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const failures = [];
try {
  const page = await browser.newPage();

  // ————— 1. NON-RÉGRESSION hors GitHub —————
  // Aucun jeton Primer n'est défini sur cette page, exactement comme sur Azure DevOps : c'est
  // le dernier repli de chaque chaîne qui s'appliquait avant, et la valeur neutre qui doit
  // s'appliquer maintenant. Les deux doivent coïncider, propriété par propriété.
  const neutralBefore = await measure(page, { css: before, platform: null });
  const neutralAfter = await measure(page, { css: after, platform: null });
  const regressions = diff(neutralBefore, neutralAfter);
  if (regressions.length > 0) {
    failures.push(
      `RÉGRESSION hors GitHub : ${regressions.length} élément(s) ne rendent plus la même chose qu'avant la scission.\n` +
        regressions
          .map((r) => `  - #${r.id}\n` + r.changed.map(([w, n]) => `      avant ${w}\n      après ${n}`).join('\n'))
          .join('\n')
    );
  }

  // ————— 2. ISOLATION : la couche GitHub n'atteint pas une page non-GitHub —————
  // Une valeur absurde est injectée dans la couche GitHub. Sans marqueur, rien ne doit bouger ;
  // avec, tout ce qui dépend de ce rôle doit bouger — faute de quoi le test ne prouverait rien
  // (une couche inerte passerait la première moitié sans effort).
  // Le poison est APPENDU après la couche GitHub, jamais inséré en tête de son bloc : les
  // déclarations du fichier viennent ensuite dans la même règle et l'écraseraient. La première
  // version de ce test faisait exactement cela — la contre-épreuve ci-dessous l'a signalé, ce
  // qui est précisément la raison pour laquelle elle existe. Un faux de test est une
  // affirmation sur l'environnement : il se relit comme du code.
  const POISON = 'rgb(255, 0, 255)';
  const poisoned =
    `${shared}\n${github}\n` +
    `:root[data-cct-platform='github'] { --cct-fg-default: ${POISON}; --cct-danger-strong: ${POISON}; --cct-radius-md: 42px; }`;
  const poisonedNeutral = await measure(page, { css: poisoned, platform: null });
  const leaked = diff(neutralAfter, poisonedNeutral);
  if (leaked.length > 0) {
    failures.push(
      `FUITE : la couche GitHub atteint une page qui n'est pas GitHub — ${leaked.length} élément(s) ont changé\n` +
        "sans le marqueur de plateforme. Une règle de plateforme est écrite hors de son scope.\n" +
        leaked.map((r) => `  - #${r.id} : ${r.changed.map(([w, n]) => `${w} → ${n}`).join(', ')}`).join('\n')
    );
  }

  const poisonedGithub = await measure(page, { css: poisoned, platform: 'github' });
  const applied = diff(neutralAfter, poisonedGithub);
  if (applied.length === 0) {
    failures.push(
      "CONTRE-ÉPREUVE MANQUÉE : avec le marqueur `data-cct-platform=\"github\"`, la couche GitHub ne\n" +
        "change RIEN. Le contrôle d'isolation ci-dessus ne prouve alors rien du tout — une couche\n" +
        'inerte le passerait sans effort. Le scope, le nom du marqueur ou la spécificité sont en cause.'
    );
  } else {
    console.log(`✓ isolation : la couche GitHub change ${applied.length} élément(s) AVEC le marqueur, 0 sans.`);
  }

  // ————— 3. L'ordre d'assemblage ne décide de rien —————
  // La spécificité (0,2,0) du scope doit l'emporter sur le `:root` (0,1,0) des valeurs neutres
  // QUEL QUE SOIT l'ordre de concaténation. C'est une affirmation du build (build.mjs), et elle
  // se mesure plutôt qu'elle ne se raisonne.
  const reversed = `${github}\n${shared}`;
  const reversedGithub = await measure(page, { css: reversed, platform: 'github' });
  const forwardGithub = await measure(page, { css: after, platform: 'github' });
  const orderSensitive = diff(forwardGithub, reversedGithub);
  if (orderSensitive.length > 0) {
    failures.push(
      `ORDRE SENSIBLE : assembler les feuilles dans l'autre sens change le rendu de ${orderSensitive.length} élément(s).\n` +
        "L'isolation dépendrait alors de l'ordre du tableau de build.mjs — une dépendance invisible.\n" +
        orderSensitive.map((r) => `  - #${r.id} : ${r.changed.map(([w, n]) => `${w} → ${n}`).join(', ')}`).join('\n')
    );
  } else {
    console.log("✓ ordre : assembler les feuilles dans l'autre sens ne change rien.");
  }

  if (regressions.length === 0) {
    console.log(`✓ non-régression : ${IDS.length} éléments × ${PROPS.length} propriétés identiques à avant la scission.`);
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error('\n' + failures.join('\n\n'));
  process.exit(1);
}
console.log('\n✓ isolation des styles par plateforme : mesurée dans Chromium.');
