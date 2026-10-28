// Canari hebdomadaire des sélecteurs GitHub : chaque chaîne attendue trouve-t-elle encore
// quelque chose sur de vraies pages de github.com ? Ce qu'il couvre, et surtout ce qu'il ne
// couvre pas (tout ce qui demande une session), est écrit dans scripts/lib/selector-canary.mjs.
//
// Il lit les sélecteurs COMPILÉS (`packages/adapters/github/dist/selectors.js`) : lancer
// `npm run build` d'abord. Le verdict nomme une chaîne qui n'a rien trouvé, sur quelle page —
// jamais une cause. Une chaîne vide est une chose cherchée et non trouvée ; dire « GitHub a
// changé sa page » serait interpréter le signal (CLAUDE.md, « Un signal se rapporte »).

import { chromium } from 'playwright-core';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canaryVerdict, GITHUB_CANARY_PAGES } from './lib/selector-canary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, '..', 'packages', 'adapters', 'github', 'dist', 'selectors.js');
const { selectors } = await import(pathToFileURL(compiled).href);

// Même résolution du binaire que check-github-theme-vars.mjs, et pour la même raison.
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();
// Le temps laissé aux vues React pour se monter après `load`. Une chaîne qui ne trouve rien
// faute d'avoir attendu serait une fausse alerte ; quatre secondes suffisaient largement à la
// mesure du 2026-10-28.
const SETTLE_MS = 4000;

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const drifts = [];
const canaryErrors = [];
try {
  const page = await browser.newPage();
  for (const target of GITHUB_CANARY_PAGES) {
    const response = await page.goto(target.url, { waitUntil: 'load', timeout: 60_000 });
    // Une page qui ne répond pas 200 n'a pas été LUE : aucune chaîne n'y a été évaluée, et
    // conclure à une dérive serait un faux diagnostic — c'est une panne du canari.
    if (response?.status() !== 200) {
      throw new Error(`${target.url} a répondu ${response?.status() ?? 'sans réponse'}`);
    }
    await page.waitForTimeout(SETTLE_MS);
    const counts = {};
    for (const key of target.chains) {
      const chain = selectors[key];
      if (!chain) continue;
      counts[key] = await Promise.all(chain.candidates.map((c) => page.locator(c).count()));
    }
    const { found, empty, unknown } = canaryVerdict(selectors, target.chains, counts);
    console.log(`\n${target.url}`);
    for (const f of found) console.log(`  ✓ ${f.name} — ${f.count} × ${f.candidate}`);
    for (const e of empty) console.log(`  ✗ ${e.name} — aucun candidat ne trouve quoi que ce soit`);
    for (const u of unknown) console.log(`  ? ${u} — chaîne inconnue de selectors.ts`);
    for (const e of empty) drifts.push(`${e.name} sur ${target.url}`);
    for (const u of unknown) canaryErrors.push(`${u} (${target.url})`);
  }
} finally {
  await browser.close();
}

if (canaryErrors.length > 0) {
  // Erreur du canari lui-même — une chaîne renommée dans selectors.ts sans l'être ici. Pas de
  // signal `drift` : le workflow n'ouvre d'issue que pour une chaîne réellement évaluée.
  console.error(`\n✗ canari à corriger, chaînes inconnues : ${canaryErrors.join(', ')}.`);
  console.error('Mettre à jour scripts/lib/selector-canary.mjs.');
  process.exit(1);
}

if (drifts.length > 0) {
  console.error(`\n✗ ${drifts.length} chaîne(s) ne trouvent plus rien :`);
  for (const d of drifts) console.error(`  - ${d}`);
  console.error(
    '\nUne capture de la page concernée, extension désactivée, dit ce qu\'elle porte désormais ;' +
      ' les candidats se corrigent dans packages/adapters/github/src/selectors.ts.'
  );
  // Positionné ICI seulement, après une évaluation réelle — même contrat que le canari des
  // variables de thème : une panne réseau en amont ne doit pas ouvrir une issue de dérive.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'drift=true\n');
  process.exit(1);
}

console.log('\n✓ chaque chaîne attendue trouve encore quelque chose sur les pages publiques de github.com.');
