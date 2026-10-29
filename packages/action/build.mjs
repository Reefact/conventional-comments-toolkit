// Empaquetage de l'Action en un fichier unique.
//
// Ce n'est pas une commodité. `@cct/action` dépend de `@cct/core` par un lien de workspace,
// qui n'existe que dans ce dépôt : quelqu'un qui écrit
// `uses: Reefact/conventional-comments-toolkit/packages/action@v1` reçoit le dossier tel
// qu'il est publié, sans `node_modules` et sans `npm ci`. Un `import '@cct/core'` y échoue
// au premier appel. Le runtime `node20` d'une Action charge UN fichier — c'est donc là que
// `core/` doit être embarqué.
//
// `dist/main.js` est le fichier que `action.yml` désigne, et il est réécrit ici : `tsc -b`
// produit un `main.js` qui importe `@cct/core`, celui-ci le remplace par le bundle.

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const result = await build({
  entryPoints: [join(here, 'src/main.ts')],
  outfile: join(here, 'dist/main.js'),
  bundle: true,
  // Le runtime `node20` charge un module CommonJS ou ESM selon l'extension et le
  // `package.json` voisin ; `esm` avec `.js` est ce que `"type": "module"` rend lisible.
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  // Les modules de Node ne s'embarquent pas : `node:fs` reste `node:fs`.
  external: ['node:*'],
  sourcemap: true,
  metafile: true,
  logLevel: 'silent',
});

const bundled = Object.keys(result.metafile.outputs)[0];
const bytes = result.metafile.outputs[bundled].bytes;
const sources = Object.keys(result.metafile.inputs).length;
console.log(`✓ action empaquetée — ${sources} source(s), ${(bytes / 1024).toFixed(1)} Kio`);

// Le bundle doit être AUTONOME : aucun `@cct/` ne doit survivre à l'empaquetage, sans quoi
// l'Action échouerait chez l'utilisateur et nulle part ici.
const { readFileSync } = await import('node:fs');
const code = readFileSync(join(here, 'dist/main.js'), 'utf8');
const leaked = [...code.matchAll(/from\s+['"](@cct\/[^'"]+)['"]/g)].map((m) => m[1]);
if (leaked.length > 0) {
  console.error(`✗ le bundle importe encore ${[...new Set(leaked)].join(', ')} — il n'est pas autonome`);
  process.exit(1);
}
