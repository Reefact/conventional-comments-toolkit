// Spike P1' (§9.3, §14) — exécution réelle dans Chromium via playwright-core.
// Démontre que l'affectation directe de `value` est absorbée par un éditeur piloté par
// un état applicatif, et que la stratégie du §9.3 (setter natif + événement input) met
// bien l'état à jour. Sort un code non nul si une assertion échoue.

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixture.html'), 'utf8');

const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: condition, detail });
  const mark = condition ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setContent(fixture, { waitUntil: 'load' });

  console.log('Spike P1′ — écriture programmatique dans un éditeur contrôlé par état\n');

  // 1. element.value = … est absorbé : le DOM montre le texte, l'état applicatif non.
  await page.evaluate(() => {
    const el = document.getElementById('editor');
    el.value = 'issue: écrit par affectation directe';
  });
  const afterDirect = await page.evaluate(() => ({ dom: window.readDom(), submitted: window.readSubmitted() }));
  assert(
    'element.value = … modifie le DOM',
    afterDirect.dom === 'issue: écrit par affectation directe',
    `dom="${afterDirect.dom}"`
  );
  assert(
    'element.value = … est ABSORBÉ par l’état applicatif (§9.3)',
    afterDirect.submitted === '',
    `submitted="${afterDirect.submitted}"`
  );
  assert(
    'désynchronisation DOM / état reproduite (§B.2)',
    afterDirect.dom !== afterDirect.submitted,
    'le contenu affiché diverge du contenu soumis'
  );

  // 2. Setter natif du prototype + événement input qui remonte : l'état se met à jour.
  await page.evaluate(() => {
    const el = document.getElementById('editor');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, 'issue (blocking): écrit par le setter natif');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const afterNative = await page.evaluate(() => ({ dom: window.readDom(), submitted: window.readSubmitted() }));
  assert(
    'setter natif + input met à jour l’état applicatif (§9.3)',
    afterNative.submitted === 'issue (blocking): écrit par le setter natif',
    `submitted="${afterNative.submitted}"`
  );
  assert(
    'DOM et état de nouveau synchronisés',
    afterNative.dom === afterNative.submitted,
    'la stratégie retenue évite la désynchronisation'
  );

  // 3. Commande d'insertion du navigateur (repli du §9.3).
  await page.evaluate(() => {
    const el = document.getElementById('editor');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.setSelectionRange(0, 0);
    document.execCommand('insertText', false, 'todo: écrit par execCommand');
  });
  const afterExec = await page.evaluate(() => ({ dom: window.readDom(), submitted: window.readSubmitted() }));
  assert(
    'document.execCommand(insertText) met à jour l’état (repli §9.3)',
    afterExec.submitted === 'todo: écrit par execCommand',
    `submitted="${afterExec.submitted}"`
  );
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions passées.`);
if (failed.length > 0) {
  console.error(`\nÉCHEC : ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
console.log('\nHypothèse du §9.3 validée sur Chromium. Voir README.md pour les hypothèses');
console.log('de plateforme restant à établir et leurs replis.');
