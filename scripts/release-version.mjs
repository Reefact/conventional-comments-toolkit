// Résolution de la version publiée par le workflow de release
// (`.github/workflows/release.yml`). Deux valeurs coexistent, et les confondre casse la
// livraison des deux côtés à la fois :
//
//   - la version de la RELEASE, telle que le tag l'annonce. Elle peut porter une
//     étiquette de pré-version : `v1.1.0-rc.1` ;
//   - la version du MANIFESTE, que Chromium n'accepte qu'en un à quatre entiers séparés
//     par des points, chacun de 0 à 65535 et sans zéro non significatif. Un `-rc.1` dans
//     `manifest.json` produit une extension que « Charger l'extension non empaquetée »
//     REFUSE : l'archive serait publiée, et inutilisable.
//
// La garde compare donc le NOYAU NUMÉRIQUE du tag à la version du manifeste, et laisse
// l'étiquette de pré-version vivre là où elle est sans danger — nom des archives, titre
// de la Release, drapeau `--prerelease`.
//
// Usage : node scripts/release-version.mjs [<tag>]
//   Avec un tag (`v1.2.3`) : la correspondance avec le manifeste est exigée. La commande
//   se lance telle quelle en local, avant de poser le tag, pour vérifier qu'il passera.
//   Sans argument : répétition à blanc — la version du manifeste sert au nommage.
//   Sort les paires `clé=valeur` attendues par $GITHUB_OUTPUT, ou 1 avec un message.

import { readFileSync } from 'node:fs';

const MANIFEST = 'packages/extension/src/manifest.json';

/**
 * La forme que Chromium exige de `manifest.json` — et que Firefox accepte aussi :
 * un à quatre entiers séparés par des points, de 0 à 65535, sans zéro non significatif,
 * et **pas tous nuls** (`0.0.0` est refusé au chargement, `0.1.0` accepté).
 */
export function isChromiumVersion(value) {
  const parts = String(value).split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  if (!parts.every((part) => /^(?:0|[1-9]\d*)$/.test(part) && Number(part) <= 65535)) return false;
  return parts.some((part) => Number(part) > 0);
}

/** `v1.1.0-rc.1` → noyau `1.1.0`, étiquette `rc.1`. Rend null si la forme n'y est pas. */
function splitTag(tag) {
  const match = /^v(\d[\w.]*?)(?:-([0-9A-Za-z.-]+))?$/.exec(tag);
  if (match === null) return null;
  return { core: match[1], label: match[2] ?? '' };
}

/**
 * @param {{ manifestVersion: string, tag?: string }} input
 * @returns {{ tag: string, version: string, core: string, prerelease: boolean,
 *             chromium: string, firefox: string }}
 */
export function resolveRelease({ manifestVersion, tag = '' }) {
  if (!isChromiumVersion(manifestVersion)) {
    throw new Error(
      `La version du manifeste (${manifestVersion}) n'est pas une version d'extension valide : ` +
        'un à quatre entiers de 0 à 65535 séparés par des points, sans zéro non significatif. ' +
        'Une étiquette de pré-version ne va pas dans le manifeste — le tag la porte.',
    );
  }

  if (tag === '') {
    return describe({ tag: '', version: manifestVersion, core: manifestVersion, prerelease: false });
  }

  const parsed = splitTag(tag);
  if (parsed === null) {
    throw new Error(`Le tag ${tag} n'a pas la forme attendue : vX.Y.Z, ou vX.Y.Z-etiquette pour une pré-version.`);
  }
  if (!isChromiumVersion(parsed.core)) {
    throw new Error(`Le tag ${tag} annonce un noyau de version (${parsed.core}) qu'une extension ne peut pas porter.`);
  }
  if (parsed.core !== manifestVersion) {
    throw new Error(
      `Le tag ${tag} annonce la version ${parsed.core}, le manifeste déclare ${manifestVersion}.\n` +
        `Corriger "version" dans ${MANIFEST}, committer, puis reposer le tag.`,
    );
  }

  return describe({
    tag,
    version: tag.slice(1),
    core: parsed.core,
    prerelease: parsed.label !== '',
  });
}

function describe({ tag, version, core, prerelease }) {
  return {
    tag,
    version,
    core,
    prerelease,
    chromium: `conventional-comments-toolkit-${version}-chromium.zip`,
    firefox: `conventional-comments-toolkit-${version}-firefox.zip`,
  };
}

// Exécution directe : le workflow redirige la sortie vers $GITHUB_OUTPUT. Le tag vient de
// la ligne de commande — c'est l'appelant qui sait s'il publie ou s'il répète à blanc, et
// la même commande vérifie donc un tag en local avant de le poser.
if (process.argv[1] !== undefined && process.argv[1].endsWith('release-version.mjs')) {
  const manifestVersion = JSON.parse(readFileSync(MANIFEST, 'utf8')).version;
  const tag = process.argv[2] ?? '';
  try {
    const resolved = resolveRelease({ manifestVersion, tag });
    for (const [key, value] of Object.entries(resolved)) console.log(`${key}=${value}`);
  } catch (error) {
    // Une annotation GitHub tient sur une ligne : le message complet va au journal, et
    // l'annotation porte la même chose avec ses retours à la ligne encodés.
    console.error(error.message);
    console.error(`::error file=${MANIFEST}::${error.message.replaceAll('\n', '%0A')}`);
    process.exit(1);
  }
}
