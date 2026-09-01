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

// NOM DE VERSION AFFICHÉ — `version` ne peut pas le porter (Chromium n'y accepte que des
// entiers), si bien que `v1.0.0-beta.1` et `v1.0.0-beta.2` se présentaient toutes deux
// comme « 1.0.0 » dans chrome://extensions. Rien ne distinguait donc, à l'écran, la build
// qu'on vient d'installer de celle qu'on croyait avoir remplacée — sur des captures
// destinées au magasin, c'est le genre d'erreur qu'on ne voit jamais.
//
// `version_name` est le champ prévu pour ça. Il est renseigné par le workflow de release
// (`CCT_VERSION_NAME`, dérivé du tag), et vaut la version du manifeste hors de lui : une
// construction locale reste ainsi honnête sur ce qu'elle est.
//
// Que Chromium l'accepte ET le conserve est MESURÉ par `npm run smoke:mv3`, dans un vrai
// navigateur, plutôt que rappelé de mémoire.
manifest.version_name = process.env['CCT_VERSION_NAME']?.trim() || manifest.version;
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
// `version_name` est propre à Chromium : Firefox le signale comme propriété inconnue.
// L'avertissement est inoffensif, mais une release ne doit pas en produire pour rien.
delete firefox.version_name;
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
