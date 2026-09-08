// Ce que la scission des feuilles par plateforme promet, MESURÉ dans un vrai Chromium.
//
// Une indirection de jetons ne se vérifie pas en lisant le CSS : la cascade, la spécificité et
// la substitution des `var()` se répondent d'une façon qu'aucune relecture ne tranche. Quatre
// affirmations sont donc mesurées, dans cet ordre :
//
//   0. COUVERTURE — chaque élément mesuré matche au moins une règle de la feuille partagée.
//      C'est le garde du garde, et il vient d'un défaut réel : le fixture employait
//      `cct-active`, `cct-blocking`, `cct-non-blocking`, qui n'existent nulle part — les vrais
//      états s'écrivent `[aria-pressed='true']`, `[aria-checked='true']`,
//      `.cct-badge-deco-blocking`. Les comparaisons portaient donc sur des éléments que rien ne
//      stylait : elles seraient restées vertes si les jetons d'accent ou de verdict avaient
//      régressé (revue Reefact, PR #66). Un fixture qui ne touche rien mesure zéro.
//
//   1. ISOLATION — sur une page NON MARQUÉE, ajouter les feuilles de toutes les plateformes ne
//      change rien. L'invariant central, et il ne se réfère à aucun passé.
//
//   2. CONTRE-ÉPREUVE — avec le marqueur, la couche GitHub change bien quelque chose. Sans
//      elle, une couche devenue inerte passerait (1) sans effort.
//
//   3. ORDRE — assembler les feuilles dans l'autre sens ne change rien : l'isolation ne doit pas
//      dépendre de l'ordre du tableau de build.mjs.
//
//   4. MIGRATION, sur demande (`CCT_STYLES_BEFORE_REF`) — comparaison à une feuille antérieure.
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
const AZDO = join(root, 'packages/adapters/azdo/src/platform.css');

/** LA PREUVE DE MIGRATION, et elle est OPT-IN — ce qui est un correctif, pas une commodité.
 *
 * La première version comparait systématiquement la feuille d'aujourd'hui à `origin/main`. Deux
 * défauts, tous deux trouvés en CI :
 *
 *  1. le `checkout` de browser-smoke.yml est SUPERFICIEL, donc `origin/main` n'existe pas sur le
 *     runner : le garde échouait honnêtement (il refuse de se comparer à lui-même), mais il
 *     échouait sur tout ;
 *  2. et surtout, ce contrôle EXPIRE À LA FUSION. Une fois la scission sur `main`, « comparer à
 *     avant » devient « se comparer à soi » : vert, et ne prouvant plus rien. Un garde qui
 *     devient aveugle tout seul est précisément ce que ce dépôt corrige ailleurs.
 *
 * Le différentiel reste utile pour PROUVER une migration, une fois. Il s'exécute donc quand on
 * le demande, et il doit alors réussir. Ce qui tourne en permanence, ce sont les invariants
 * ci-dessous, qui ne se réfèrent à aucun passé. */
const BEFORE_REF = process.env.CCT_STYLES_BEFORE_REF ?? null;

function stylesBefore() {
  try {
    return execFileSync('git', ['show', BEFORE_REF], { cwd: root, encoding: 'utf8', maxBuffer: 8 << 20 });
  } catch (e) {
    console.error(
      `Impossible de lire la feuille de référence (${BEFORE_REF}) : ${e.message}\n` +
        "Le contrôle différentiel n'a alors AUCUNE valeur — il comparerait la feuille actuelle\n" +
        'à elle-même et passerait au vert sans rien prouver. Échouer est le seul verdict honnête.'
    );
    process.exit(1);
  }
}

/** Un exemplaire de chaque surface que l'extension peint, avec les classes réelles qu'elle
 * pose. Ce sont les propriétés de ces éléments qu'on compare. */
const FIXTURE = `
  <div class="cct-host" id="host"><textarea class="cct-editor" id="editor"></textarea></div>
  <div class="cct-toolbar" id="toolbar">
    <button class="cct-label-button" id="btn">issue</button>
    <button class="cct-label-button" id="btnActive" aria-pressed="true">todo</button>
    <div class="cct-decoration-group" id="decoGroup">
      <button class="cct-decoration-segment" id="seg" aria-checked="false">blocking</button>
      <button class="cct-decoration-segment" id="segActive" aria-checked="true">none</button>
    </div>
    <button class="cct-free-decoration" id="freeDeco">+</button>
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
  <textarea class="cct-border-error cct-ring-inset" id="ringInset"></textarea>
  <div class="cct-banner" id="banner">
    <button class="cct-banner-head" id="bannerHead">
      <span class="cct-banner-glyph" id="glyph">!</span>
      <span class="cct-banner-label" id="bannerLabel">3</span>
    </button>
    <span class="cct-banner-hint" id="bannerHint">indice</span>
    <ul class="cct-banner-list">
      <li id="bannerLi">un
        <span class="cct-banner-author" id="bannerAuthor">alice</span>
        <span class="cct-banner-judged" id="bannerJudged">jugé</span>
      </li>
      <li class="cct-banner-unlocated" id="bannerUnlocated">deux</li>
    </ul>
  </div>
  <span class="cct-badge cct-badge-label" id="badge">issue</span>
  <span class="cct-badge cct-badge-label cct-badge-flat" id="badgeFlat">issue</span>
  <span class="cct-badge cct-badge-pill" id="badgePill">pill</span>
  <span class="cct-badge cct-badge-deco cct-badge-deco-blocking" id="badgeBlocking">blocking</span>
  <span class="cct-badge cct-badge-deco cct-badge-deco-nonblocking" id="badgeNonBlocking">non-blocking</span>
  <span class="cct-badge cct-badge-deco cct-badge-deco-custom" id="badgeCustom">ux</span>
  <button class="cct-filter-chip" id="chip">filtre</button>
  <button class="cct-filter-chip" id="chipActive" aria-pressed="true">filtre actif</button>
  <!-- quickinput.ts n'écrit AUCUNE classe sur les items : seul \`aria-selected\` les distingue,
       et la feuille ne style que le sélectionné. L'item non sélectionné reste dans le fixture
       pour que le contexte soit réaliste, mais il n'est pas MESURÉ : rien ne le style, donc
       comparer ses valeurs ne prouverait rien — ce que le contrôle de couverture dit. -->
  <ul class="cct-quick-list" id="quickList">
    <li aria-selected="false">issue</li>
    <li id="quickItemActive" aria-selected="true">todo</li>
  </ul>
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
  'editor', 'toolbar', 'btn', 'btnActive', 'decoGroup', 'seg', 'segActive', 'freeDeco',
  'feedback', 'diagError', 'diagWarn',
  'ringOk', 'ringWarn', 'ringError', 'ringInset',
  'host', 'banner', 'bannerHead', 'glyph', 'bannerLabel', 'bannerHint', 'bannerLi',
  'bannerAuthor', 'bannerJudged', 'bannerUnlocated',
  'badge', 'badgeFlat', 'badgePill', 'badgeBlocking', 'badgeNonBlocking', 'badgeCustom',
  'chip', 'chipActive', 'quickList', 'quickItemActive',
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
const azdo = readFileSync(AZDO, 'utf8');
const after = `${shared}\n${github}\n${azdo}`;

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const failures = [];
try {
  const page = await browser.newPage();

  // ————— 0. LE FIXTURE ATTEINT-IL CHAQUE RÈGLE QUI PORTE UN JETON ? —————
  // La question est posée DANS CE SENS, et c'est tout l'écart entre un garde qui protège et un
  // garde qui rassure. « Chaque élément matche-t-il une règle ? » ne suffit pas : un bouton
  // portant un état inventé (`cct-active`) matche encore sa classe de base, donc passe — pendant
  // que la règle d'état `[aria-pressed='true']`, elle, n'est jamais atteinte. C'est exactement le
  // défaut signalé (revue Reefact, PR #66), et la première version de ce contrôle ne le voyait
  // pas : mesuré en réintroduisant `cct-active`, elle restait verte.
  //
  // Seules les règles PORTANT UN JETON `--cct-*` sont exigées : elles seules peuvent régresser
  // du fait de la scission. Une règle purement géométrique n'a rien à prouver ici.
  await page.setContent(
    `<!doctype html><html><head><style>${shared}</style></head><body>${FIXTURE}</body></html>`
  );
  const unreached = await page.evaluate(
    ({ ids }) => {
      const tokenRules = (rules, out = []) => {
        for (const r of rules) {
          if (r.selectorText && /var\(--cct-/.test(r.cssText)) out.push(r.selectorText);
          if (r.cssRules && r.cssRules.length) tokenRules(r.cssRules, out);
        }
        return out;
      };
      const measured = ids.map((id) => document.getElementById(id)).filter(Boolean);
      const all = [...document.styleSheets].flatMap((sheet) => tokenRules(sheet.cssRules));
      // Un sélecteur groupé (`a, b`) est couvert dès qu'UNE de ses branches l'est : c'est la
      // même déclaration, et l'atteindre par n'importe quel chemin la met à l'épreuve.
      return [...new Set(all)].filter(
        (sel) =>
          !sel.split(',').some((branch) => {
            // Les pseudo-classes d'ÉTAT INTERACTIF sont retirées avant le test : `:focus-visible`
            // exige un focus réel, qu'un seul élément peut porter à la fois — exiger qu'ils
            // l'aient tous serait impossible. Ce qu'on garde est donc plus faible et il faut le
            // dire : on vérifie que l'ÉLÉMENT existe dans le fixture, pas que son état de focus
            // soit mesuré. Les états déclaratifs (`[aria-pressed]`, `[aria-checked]`,
            // `[aria-selected]`), eux, sont exigés tels quels — ce sont ceux que la revue a
            // trouvés manquants.
            const b = branch.trim().replace(/:(?:focus-visible|focus|hover|active)\b/g, '');
            try {
              return measured.some((el) => el.matches(b));
            } catch {
              return false;
            }
          })
      );
    },
    { ids: IDS }
  );
  if (unreached.length > 0) {
    failures.push(
      `FIXTURE INCOMPLET : ${unreached.length} règle(s) portant un jeton ne sont atteintes par AUCUN\n` +
        "élément mesuré. Ces déclarations peuvent donc régresser sans que rien ne le dise.\n" +
        unreached.map((sel) => `  - ${sel}`).join('\n') +
        "\nAjoutez au fixture les classes et attributs réellement posés en production."
    );
  } else {
    console.log(`✓ couverture : chaque règle portant un jeton est atteinte par le fixture.`);
  }

  // ————— 1. AUCUNE feuille de plateforme n'atteint une page NON MARQUÉE —————
  // L'invariant central de la scission, et il ne se réfère à aucun passé : sur une page sans
  // marqueur — c'est-à-dire toute page qu'aucun adaptateur ne sert —, ajouter les feuilles de
  // TOUTES les plateformes ne doit rien changer. Propriété par propriété, sur chaque surface
  // que l'extension peint.
  //
  // C'est plus fort que d'empoisonner trois variables : celui-ci couvre toutes les
  // déclarations que les feuilles de plateforme portent aujourd'hui ET porteront demain, sans
  // qu'on ait à penser à étendre le poison.
  const sharedOnly = await measure(page, { css: shared, platform: null });
  const neutralAfter = await measure(page, { css: after, platform: null });
  const leakedByDefault = diff(sharedOnly, neutralAfter);
  if (leakedByDefault.length > 0) {
    failures.push(
      `FUITE : une feuille de plateforme atteint une page NON MARQUÉE — ${leakedByDefault.length} élément(s)\n` +
        "changent selon que les feuilles de plateforme sont livrées ou non, sans marqueur.\n" +
        'Une règle de plateforme est écrite hors de son scope.\n' +
        leakedByDefault
          .map((r) => `  - #${r.id} : ${r.changed.map(([w, n]) => `${w} → ${n}`).join(', ')}`)
          .join('\n')
    );
  } else {
    console.log(
      `✓ page non marquée : les feuilles de plateforme ne changent rien — ${IDS.length} éléments × ${PROPS.length} propriétés.`
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

  // ————— 4. PREUVE DE MIGRATION, sur demande —————
  // `CCT_STYLES_BEFORE_REF=<rev>:<chemin>` compare le rendu d'une page NON MARQUÉE à celui que
  // produisait une feuille antérieure. Sert à démontrer qu'une scission n'a rien changé là où
  // elle ne devait rien changer ; n'a plus de sens une fois cette scission fusionnée.
  if (BEFORE_REF) {
    const neutralBefore = await measure(page, { css: stylesBefore(), platform: null });
    const regressions = diff(neutralBefore, neutralAfter);
    if (regressions.length > 0) {
      failures.push(
        `RÉGRESSION vs ${BEFORE_REF} : ${regressions.length} élément(s) ne rendent plus la même chose.\n` +
          regressions
            .map((r) => `  - #${r.id}\n` + r.changed.map(([w, n]) => `      avant ${w}\n      après ${n}`).join('\n'))
            .join('\n')
      );
    } else {
      console.log(
        `✓ migration : ${IDS.length} éléments × ${PROPS.length} propriétés identiques à ${BEFORE_REF}.`
      );
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error('\n' + failures.join('\n\n'));
  process.exit(1);
}
console.log('\n✓ isolation des styles par plateforme : mesurée dans Chromium.');
