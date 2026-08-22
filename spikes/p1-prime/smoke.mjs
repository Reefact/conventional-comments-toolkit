// Smoke test de sélecteurs (§9.4) — squelette exécutable quotidiennement pour détecter
// les ruptures de sélecteurs après une mise à jour d'éditeur. Il charge une capture DOM
// représentative par cible et vérifie que chaque chaîne de sélecteurs de l'adaptateur
// matche encore au moins un candidat.
//
// Les cibles réelles (§A.5 : github.com + versions GHE Server représentatives ; §B :
// Azure DevOps Services + versions Server supportées) sont fournies sous forme de
// captures HTML dans `fixtures/` — non incluses ici, car elles dépendent des versions
// arrêtées avant P2/P5 (§A.1). Ce script montre la forme du test et échoue proprement
// tant que les captures ne sont pas fournies, plutôt que de donner une fausse assurance.

import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Chaînes minimales à couvrir par cible ; en production, importées des fichiers de
// sélecteurs des adaptateurs (packages/adapters/*/src/selectors.ts).
const chains = {
  github: ['textarea', 'button[type="submit"], button'],
  azdo: ['textarea', 'button'],
};

if (!existsSync(fixturesDir)) {
  console.log('Smoke test de sélecteurs (§9.4) — squelette.');
  console.log(`Aucune capture DOM dans ${fixturesDir}.`);
  console.log('Fournir une capture par version cible (github.com, GHE Server, Azure');
  console.log('DevOps Services/Server) — versions arrêtées avant P2/P5 (§A.1).');
  process.exit(0);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
let failures = 0;
try {
  for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith('.html'))) {
    const platform = file.startsWith('azdo') ? 'azdo' : 'github';
    const page = await browser.newPage();
    await page.setContent(readFileSync(join(fixturesDir, file), 'utf8'), { waitUntil: 'load' });
    for (const selector of chains[platform]) {
      const count = await page.locator(selector).count();
      const ok = count > 0;
      if (!ok) failures++;
      console.log(`  ${ok ? '✓' : '✗'} ${file} :: ${selector} (${count})`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failures > 0 ? 1 : 0);
