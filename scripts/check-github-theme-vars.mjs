// Canari hebdomadaire des variables de thème GitHub (Primer) — vérifie que le repli mis
// en place dans packages/extension/src/styles.css n'est pas en train de devenir la
// norme silencieuse : si GitHub renomme une de ces variables lors d'une refonte, ce
// script le détecte au lieu de laisser l'extension retomber sur ses replis système sans
// que personne ne le remarque.
//
// La liste des variables à vérifier est EXTRAITE de styles.css (pas recopiée à la
// main) : tout nouveau var(--fgColor-... , repli) ajouté au fichier est couvert
// automatiquement. Seuls les préfixes Primer connus sont retenus — les propriétés
// propres à l'extension (--cct-label-color, posée par toolbar.ts) ne viennent pas de
// GitHub et ne doivent pas être vérifiées ici.
//
// styles.css imbrique parfois un ANCIEN nom Primer en repli du nouveau (GitHub
// Enterprise Server est figé par version et peut encore servir les noms d'avant le
// renommage — specifications-fr.md §A.5). Seul le nom Primer le plus prioritaire de
// chaque CHAÎNE de repli est exigé ici : un nom imbriqué directement dans le repli d'un
// autre nom Primer est ce filet GHES, qu'on ne peut pas vérifier depuis github.com et
// dont l'absence y est normale, pas une régression. Deux variables Primer INDÉPENDANTES
// dans la même déclaration (ex. deux couches de couleur d'un box-shadow) sont en
// revanche chacune exigée — seule l'imbrication à l'intérieur d'un même var() compte
// comme repli.

import { chromium } from 'playwright-core';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stylesPath = join(here, '..', 'packages', 'extension', 'src', 'styles.css');
// PLAYWRIGHT_CHROMIUM permet à la CI de forcer le binaire déjà téléchargé sans repasser
// par la résolution ci-dessous ; en local (npm run check:github-theme-vars, hors
// conteneur), chromium.executablePath() retrouve le Chromium installé par
// `npx playwright-core install chromium` dans le cache Playwright habituel — un chemin
// codé en dur ici serait spécifique à l'image CI et échouerait partout ailleurs.
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();
const TARGET_URL =
  process.env.GITHUB_THEME_CHECK_URL ?? 'https://github.com/Reefact/conventional-comments-toolkit';

const PRIMER_PREFIXES = [
  '--color-',
  '--border',
  '--bgColor-',
  '--fgColor-',
  '--overlay-',
  '--button-', // tokens des boutons natifs, repris par .cct-label-button
];

// Les commentaires CSS documentent parfois des noms de variables (« préférer
// var(--fgColor-muted) ici ») que la feuille n'utilise pas réellement : les laisser dans
// le texte analysé ferait exiger du canari une variable dont l'extension ne dépend pas,
// et ouvrirait une issue de dérive pour rien. On les retire donc avant l'extraction.
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function extractPrimerVarNames(source) {
  const css = stripCssComments(source);
  const names = new Set();
  // Marche caractère par caractère en empilant une entrée par parenthèse ouvrante,
  // portant `true` quand cette parenthèse appartient à un var(--primer-...) — un nom
  // Primer n'est exigé que si la parenthèse englobante immédiate n'est PAS elle-même un
  // var() Primer (sinon c'est un repli GHES imbriqué, cf. commentaire plus haut).
  const stack = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '(') {
      let isPrimerVar = false;
      if (css.slice(Math.max(0, i - 3), i) === 'var') {
        const match = /^\(\s*(--[a-zA-Z0-9-]+)/.exec(css.slice(i));
        if (match) {
          const name = match[1];
          const isPrimer = PRIMER_PREFIXES.some((prefix) => name.startsWith(prefix));
          const parentIsPrimer = stack.length > 0 && stack[stack.length - 1];
          if (isPrimer && !parentIsPrimer) names.add(name);
          isPrimerVar = isPrimer;
        }
      }
      stack.push(isPrimerVar);
    } else if (ch === ')') {
      stack.pop();
    }
  }
  return [...names].sort();
}

const css = readFileSync(stylesPath, 'utf8');
const varNames = extractPrimerVarNames(css);

if (varNames.length === 0) {
  console.error(`Aucune variable Primer trouvée dans ${stylesPath} — script à revoir.`);
  process.exit(1);
}

console.log(`${varNames.length} variable(s) Primer à vérifier sur ${TARGET_URL} :`);
for (const name of varNames) console.log(`  - ${name}`);

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
let missing = [];
try {
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  // L'extension promet le respect des thèmes clair ET sombre (§10) ; GitHub sélectionne
  // ses tokens de couleur via des règles spécifiques à chaque thème (cf. l'imbrication
  // [data-color-mode]/[data-light-theme]/[data-dark-theme] observée pendant
  // l'investigation de ce canari). Une variable présente en clair mais renommée
  // seulement dans les règles sombres doit être détectée, donc les deux schémas sont
  // vérifiés plutôt que le seul rendu par défaut du navigateur headless.
  const SCHEMES = ['light', 'dark'];
  const valuesByScheme = {};
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    valuesByScheme[scheme] = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
    }, varNames);
  }

  console.log('\nRésultat :');
  for (const name of varNames) {
    const perScheme = SCHEMES.map((scheme) => [scheme, valuesByScheme[scheme][name]]);
    const ok = perScheme.every(([, value]) => value !== '');
    if (!ok) missing.push(name);
    const detail = perScheme.map(([scheme, value]) => `${scheme}=${value || '∅'}`).join(', ');
    console.log(`  ${ok ? '✓' : '✗'} ${name} — ${detail}`);
  }

  // Diagnostic : si des variables manquent, lister les propriétés personnalisées
  // effectivement présentes sur <html> dont le nom ressemble aux nôtres (renommage
  // probable plutôt que suppression pure) — évite d'avoir à relancer une investigation
  // manuelle à chaque échec de ce canari.
  if (missing.length > 0) {
    const candidates = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const names = new Set();
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // feuille cross-origine — inaccessible, pas la source de nos variables
        }
        for (const rule of rules) {
          if (!rule.style) continue;
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (prop.startsWith('--')) names.add(prop);
          }
        }
      }
      return [...names]
        .filter((n) => /color|border|fg|bg/i.test(n))
        .sort()
        .map((n) => [n, style.getPropertyValue(n).trim()]);
    });
    console.log(`\nPropriétés personnalisées apparentées trouvées sur ${TARGET_URL} :`);
    for (const [name, value] of candidates) console.log(`  ${name} = ${value}`);
  }
} finally {
  await browser.close();
}

if (missing.length > 0) {
  console.error(
    `\n${missing.length} variable(s) Primer disparue(s) de github.com : ${missing.join(', ')}.`
  );
  console.error(
    'packages/extension/src/styles.css retombe sur son repli système pour ces propriétés — ' +
      "l'apparence reste correcte mais n'est plus alignée sur le thème GitHub actuel. " +
      'Mettre à jour les noms de variables dans styles.css.'
  );
  // Signal sémantique distinct du seul code de sortie : une panne de navigation (réseau,
  // timeout) fait aussi échouer ce script, mais AVANT d'atteindre ce bloc — le workflow
  // n'ouvre une issue de dérive que lorsque ce signal est bien positionné, jamais sur un
  // échec générique en amont (installation de Chromium, panne réseau, etc.).
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'drift=true\n');
  process.exit(1);
}

console.log('\n✓ toutes les variables Primer utilisées par styles.css sont toujours présentes.');
