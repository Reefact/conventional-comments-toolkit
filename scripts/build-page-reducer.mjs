// Le script de navigateur qui réduit la page OUVERTE et en télécharge la seule forme réduite —
// la voie « session locale avec Claude in Chrome » du skill `plateforme`.
//
// Usage : node scripts/build-page-reducer.mjs <id> <NN-vue-état.html> [--no-selectors] [--out <fichier>]
//   (sélecteurs COMPILÉS : `npm run build` d'abord ; sans --out, le script sort sur stdout.)
//
// Le script produit s'exécute dans la page par l'outil `javascript_tool` de l'extension. Il fait
// ce que fait `reduce-captured-pages.mjs` sur un fichier — réduire, comparer chaque candidat avant
// et après, vérifier le point fixe, par la MÊME fonction (`reduceAndVerify`) — puis télécharge la
// page réduite sous le nom donné. Il ne rend qu'un résumé : jamais de HTML, ni brut ni réduit. La
// page brute ne touche donc ni le disque, ni la conversation.
//
// `check:page-reducer` tient les deux voies pour équivalentes, octet pour octet, dans Chromium.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPageReducer } from './lib/captured-page-reducer.mjs';
import { InputsError, loadReductionInputs } from './lib/captured-page-inputs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const [id, file] = positional;
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : null;

// Le nom suit la convention du skill (`NN-<vue>-<état>.html`) : c'est lui que porte le fichier
// téléchargé, et qu'il gardera dans fixtures/pages/.
if (!id || !file || !/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)+\.html$/.test(file)) {
  console.error(
    'Usage : node scripts/build-page-reducer.mjs <id> <NN-vue-état.html> [--no-selectors] [--out <fichier>]\n' +
      '  ex. : node scripts/build-page-reducer.mjs azdo 01-overview-nouveau-commentaire.html'
  );
  process.exit(2);
}

let inputs;
try {
  inputs = await loadReductionInputs(ROOT, id, { noSelectors: args.includes('--no-selectors') });
} catch (err) {
  if (!(err instanceof InputsError)) throw err;
  console.error(err.message);
  process.exit(err.exitCode);
}

const script = buildPageReducer({ ...inputs, file });
if (out) {
  writeFileSync(out, script);
  console.error(
    `✓ ${out} : script de réduction pour « ${id} », fichier ${file}` +
      (inputs.candidates ? '' : ' — SANS comparaison avant/après (--no-selectors)')
  );
} else {
  process.stdout.write(script);
}
