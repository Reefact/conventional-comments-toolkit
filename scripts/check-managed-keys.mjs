// Toute clé lue dans `chrome.storage.managed` est-elle DÉCLARÉE dans le schéma ? — garde
// statique (§8.1.1, §10).
//
// Chrome valide le stockage managé contre `managed-schema.json` et écarte silencieusement
// ce que le schéma ne déclare pas : une clé oubliée n'est pas « lue avec une valeur par
// défaut », elle n'arrive JAMAIS. Rien ne le signale — ni erreur, ni avertissement, ni
// différence en test, puisqu'un faux de test fabrique l'objet que le vrai canal aurait
// refusé de transporter.
//
// C'est exactement ce qui est arrivé : la télémétrie a été déplacée vers ce canal pour
// qu'un dépôt ne puisse plus choisir la destination de ses données, et `telemetry` n'a pas
// été ajouté au schéma. En production, `readManagedEndpoint()` aurait toujours rendu
// `null` : case grisée, aucun compteur, fonctionnalité entière inerte, et une revue
// humaine pour s'en apercevoir (revue Codex, PR #31). Le schéma le disait pourtant déjà de
// lui-même, dans sa propre description : « une clé non déclarée n'est pas transportable
// par la politique de navigateur ».
//
// La lecture est donc désormais confrontée à la déclaration, mécaniquement.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'packages', 'extension', 'src');
const SCHEMA = join(SRC, 'managed-schema.json');

const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
const declared = new Set(Object.keys(schema.properties ?? {}));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Portée d'une lecture : le texte qui suit `storage.managed.get(`, jusqu'à la fin de la
 * fonction de rappel. Une borne en caractères suffit et ne peut pas se tromper d'appel :
 * les cinq sites du dépôt tiennent tous en quelques lignes, et déborder ne ferait
 * qu'exiger la déclaration d'une clé qui n'en avait pas besoin — un faux positif bruyant,
 * jamais un défaut passé sous silence. */
const CALLBACK_SPAN = 400;

const failures = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const calls = /storage\??\.managed\??\.get\s*(?:\?\.)?\s*\(/g;
  let call;
  while ((call = calls.exec(text)) !== null) {
    const span = text.slice(call.index, call.index + CALLBACK_SPAN);
    // `items?.['floor']`, `items['allowedHosts']` — la forme employée sur les cinq sites.
    const reads = /items\s*\??\.\s*\[\s*'([^']+)'\s*\]/g;
    let read;
    while ((read = reads.exec(span)) !== null) {
      const key = read[1];
      if (declared.has(key)) continue;
      failures.push(
        `${rel}:${lineOf(text, call.index + read.index)} — clé managée \`${key}\` lue mais absente ` +
          `de managed-schema.json : Chrome ne la transportera pas, et la lecture rendra ` +
          `toujours la valeur par défaut, sans erreur nulle part.`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`Schéma de politique : ${failures.length} écart(s).\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `Schéma de politique : toutes les clés managées lues sont déclarées (${[...declared].join(', ')}).`
);
