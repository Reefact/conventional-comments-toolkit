// Garde du repo : le service worker et la page d'options n'embarquent AUCUN adaptateur.
//
// Ces deux bundles ont besoin de savoir quelles plateformes existent — répartir les hôtes
// accordés, relayer une lecture de configuration, proposer un site d'un clic — et pour cela
// d'une FICHE par plateforme (`@cct/adapter-<id>/descriptor`), jamais de l'adaptateur. Avant le
// registre, le service worker importait une fonction de l'adaptateur GitHub, donc le paquet
// entier : une modification de cet adaptateur changeait un fichier que toutes les plateformes
// exécutent.
//
// La question est posée aux OCTETS, pas à la source : esbuild écrit, à côté de chaque bundle
// (`packages/extension/dist-meta/<bundle>.json`, hors du dossier livré — packages/extension/build.mjs), la liste des fichiers qu'il y a
// réellement mis. Un import indirect — un module partagé qui, lui, importe un adaptateur — y
// apparaît aussi, ce qu'aucune lecture des `import` d'un fichier ne verrait.
//
// Les plateformes sont les DOSSIERS de packages/adapters, hors `shared` — jamais une liste.
// Lancer `npm run build && npm run build:extension` d'abord.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenAdapterInputs } from './lib/bundle-isolation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const META = join(root, 'packages/extension/dist-meta');
const ids = readdirSync(join(root, 'packages/adapters')).filter((name) => name !== 'shared');

/** Les bundles qui ne doivent embarquer que des fiches. Le script de contenu, lui, construit
 * l'adaptateur de la page : il les embarque tous, et c'est le point de composition qui choisit. */
const DESCRIPTOR_ONLY = ['background.js', 'options.js'];

const findings = [];
for (const bundle of DESCRIPTOR_ONLY) {
  const file = join(META, `${bundle}.json`);
  if (!existsSync(file)) {
    console.error(`Métadonnées absentes : ${file}\nLancer \`npm run build:extension\` d'abord.`);
    process.exit(1);
  }
  const inputs = Object.keys(JSON.parse(readFileSync(file, 'utf8')).inputs);
  for (const input of forbiddenAdapterInputs(inputs, ids)) findings.push({ bundle, input });
}

if (findings.length > 0) {
  console.error(
    `${findings.length} fichier(s) d'adaptateur dans un bundle qui ne doit porter que des fiches :\n` +
      findings.map((f) => `  - ${f.bundle} ← ${f.input}`).join('\n') +
      "\n\nCe que le service worker ou la page d'options savent d'une plateforme vient de sa fiche\n" +
      "(`@cct/adapter-<id>/descriptor`, §9.2.3 `PlatformDescriptor`). Ajoutez-y la donnée au lieu\n" +
      "d'importer l'adaptateur : sinon une modification de celui-ci change un fichier que toutes\n" +
      'les plateformes exécutent.'
  );
  process.exit(1);
}
console.log(
  `✓ ${DESCRIPTOR_ONLY.join(', ')} : aucune source d'adaptateur (${ids.join(', ')}), fiches seulement.`
);
