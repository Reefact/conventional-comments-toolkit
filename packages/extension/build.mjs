// Empaquetage MV3 de l'extension : bundle des points d'entrée (content, background,
// options) et copie des ressources statiques vers dist-ext/. Aucun code distant, aucune
// dépendance CDN (§10) — tout est inclus dans le bundle.
//
// Chrome/Edge chargent dist-ext/ tel quel ; Firefox (ESR ≥ 128) utilise le même code
// avec le manifest adapté produit ci-dessous (event pages au lieu d'un service worker,
// espace de noms browser.* — §10, Compatibilité).

import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist-ext');
await mkdir(join(out, 'firefox'), { recursive: true });

const common = {
  bundle: true,
  format: 'esm',
  target: ['chrome109', 'firefox128'],
  sourcemap: true,
  logLevel: 'silent',
};

await build({ ...common, entryPoints: [join(here, 'src/content.ts')], outfile: join(out, 'content.js') });
await build({ ...common, entryPoints: [join(here, 'src/background.ts')], outfile: join(out, 'background.js') });
await build({ ...common, entryPoints: [join(here, 'src/options/options.ts')], outfile: join(out, 'options.js') });

await copyFile(join(here, 'src/styles.css'), join(out, 'styles.css'));
await copyFile(join(here, 'src/options/options.html'), join(out, 'options.html'));
await copyFile(join(here, 'src/managed-schema.json'), join(out, 'managed-schema.json'));

const manifest = JSON.parse(await readFile(join(here, 'src/manifest.json'), 'utf8'));
manifest.options_ui = { page: 'options.html', open_in_tab: true };
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Icônes : la liste qui fait foi est celle du manifeste, jamais une copie écrite ici.
// Une taille ajoutée à `icons` ou à `action.default_icon` sans le fichier correspondant
// dans le bundle empêche le chargement de l'extension ; dériver la liste du manifeste
// rend cet oubli impossible. Les chemins y sont déjà relatifs à la racine du bundle, et
// `src/` reproduit cette arborescence : le même chemin sert des deux côtés.
const icons = [
  ...new Set([...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {})]),
];
await mkdir(join(out, 'icons'), { recursive: true });
for (const icon of icons) await copyFile(join(here, 'src', icon), join(out, icon));

// Variante Firefox : event page (§10 — Firefox n'implémente pas le service worker MV3),
// et déclaration d'identifiant pour les politiques ExtensionSettings.
const firefox = structuredClone(manifest);
firefox.background = { scripts: ['background.js'], type: 'module' };
firefox.browser_specific_settings = {
  gecko: { id: 'conventional-comments-toolkit@example.org', strict_min_version: '128.0' },
};
await writeFile(join(out, 'firefox/manifest.json'), JSON.stringify(firefox, null, 2));
await mkdir(join(out, 'firefox/icons'), { recursive: true });
const shared = ['content.js', 'background.js', 'options.js', 'styles.css', 'options.html', 'managed-schema.json'];
for (const f of [...shared, ...icons]) {
  await copyFile(join(out, f), join(out, 'firefox', f));
}

console.log('extension bundled into', out);
