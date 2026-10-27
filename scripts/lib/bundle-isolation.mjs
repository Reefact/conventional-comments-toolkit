// Ce qu'un bundle « à fiches seulement » ne doit PAS embarquer : toute source d'un paquet de
// plateforme autre que sa fiche. Isolé du garde `check-bundle-isolation.mjs` pour être testé sur
// des listes fabriquées (tests/bundle-isolation-guard.test.ts).
//
// La première version ne reconnaissait que les fichiers placés DIRECTEMENT sous `src/` ou
// `dist/` : un module imbriqué (`dist/ui/editor.js`) embarqué par un import indirect passait
// inaperçu, et le garde restait vert sur la violation qu'il existe pour voir (revue Reefact,
// PR #76). Tout chemin sous `src/` ou `dist/` compte donc ; seule la fiche située à leur RACINE
// est admise.

/** Les entrées de `metafile.inputs` qui viennent d'un adaptateur, fiche exceptée. */
export function forbiddenAdapterInputs(inputs, adapterIds) {
  const found = [];
  for (const input of inputs) {
    const m = /(?:^|\/)packages\/adapters\/([^/]+)\/(?:dist|src)\/(.+)$/.exec(input);
    if (!m || !adapterIds.includes(m[1])) continue;
    if (/^descriptor\.(?:js|ts)$/.test(m[2])) continue;
    found.push(input);
  }
  return found;
}
