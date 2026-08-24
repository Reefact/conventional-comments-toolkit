// Canari hebdomadaire des variables de thème GitHub (Primer) — vérifie que le repli mis
// en place dans packages/extension/src/styles.css n'est pas en train de devenir la
// norme silencieuse : si GitHub renomme une de ces variables lors d'une refonte, ce
// script le détecte au lieu de laisser l'extension retomber sur ses replis système sans
// que personne ne le remarque.
//
// La liste des variables à vérifier est EXTRAITE de styles.css (pas recopiée à la
// main) : tout nouveau var(--color-... , repli) ajouté au fichier est couvert
// automatiquement. Seuls les préfixes Primer connus (--color-, --border) sont retenus —
// les propriétés propres à l'extension (--cct-label-color, posée par toolbar.ts) ne
// viennent pas de GitHub et ne doivent pas être vérifiées ici.

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stylesPath = join(here, '..', 'packages', 'extension', 'src', 'styles.css');
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TARGET_URL =
  process.env.GITHUB_THEME_CHECK_URL ?? 'https://github.com/Reefact/conventional-comments-toolkit';

const PRIMER_PREFIXES = ['--color-', '--border'];

function extractPrimerVarNames(css) {
  const names = new Set();
  for (const match of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
    const name = match[1];
    if (PRIMER_PREFIXES.some((prefix) => name.startsWith(prefix))) names.add(name);
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

  // GitHub ne définit ses tokens de couleur sémantiques (--color-*) que sous des
  // sélecteurs d'attribut [data-color-mode]/[data-light-theme]/[data-dark-theme] sur
  // <html> — posés par son propre script au chargement pour un visiteur avec une
  // préférence de thème enregistrée. Un run CI anonyme, sans cookie, ne les obtient
  // jamais alors que la vraie extension tourne toujours sur une page GitHub authentifiée
  // qui les pose (§ toolbar dans le contexte réel §5.1). Les poser nous-mêmes fait
  // porter le test sur les NOMS de variables, sa seule responsabilité — pas sur l'état
  // d'authentification du run CI, qui n'a rien à voir avec la question posée ici.
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-color-mode', 'light');
    document.documentElement.setAttribute('data-light-theme', 'light');
    document.documentElement.setAttribute('data-dark-theme', 'dark');
  });

  const values = await page.evaluate((names) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, varNames);

  console.log('\nRésultat :');
  for (const name of varNames) {
    const value = values[name];
    const ok = value !== '';
    if (!ok) missing.push(name);
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? ` = ${value}` : ' — absente'}`);
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
  process.exit(1);
}

console.log('\n✓ toutes les variables Primer utilisées par styles.css sont toujours présentes.');
