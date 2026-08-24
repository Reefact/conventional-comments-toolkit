// Garde du repo : chaque règle écrite dans packages/extension/src/styles.css doit
// survivre au parseur CSS du navigateur.
//
// Piège qui a coûté une livraison : un commentaire CSS se termine à la PREMIÈRE séquence
// étoile + barre oblique qu'il contient. Le commentaire d'en-tête citait des noms de
// variables Primer sous la forme « --color-fg- » suivi d'une étoile puis d'une barre
// oblique ; le commentaire se fermait là, le parseur avalait le texte restant jusqu'à la
// première accolade — et la règle `.cct-toolbar` qui suivait était emportée avec. Les
// boutons de la barre d'outils se retrouvaient collés en production alors que la feuille
// de style, lue par un humain, semblait correcte, et qu'aucun test ne la parsait.
//
// Le contrôle est textuel d'un côté (les sélecteurs tels qu'ils sont ÉCRITS) et sémantique
// de l'autre (les sélecteurs tels que le parseur les RETIENT) : c'est l'écart entre les
// deux qui révèle la règle perdue.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Window } from 'happy-dom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = resolve(root, 'packages/extension/src/styles.css');
const css = readFileSync(cssPath, 'utf8');

/** Comparaison insensible aux espaces et au style de guillemets : le parseur normalise
 * `[aria-pressed='true']` en `[aria-pressed="true"]`, ce qui n'est pas un écart. */
const normalize = (selector) => selector.replace(/\s+/g, '').replace(/'/g, '"').toLowerCase();

// Sélecteurs ÉCRITS : une règle de premier niveau commence en début de ligne par « . » ou
// « @ » et court jusqu'à son accolade ouvrante, liste de sélecteurs multi-lignes comprise.
// Les règles imbriquées (indentées dans un @media) sont hors du champ de ce contrôle.
const declared = [...css.matchAll(/^([.@][^{}]*?)\s*\{/gm)].map((m) => normalize(m[1]));

// Sélecteurs RETENUS par le parseur.
const window = new Window();
const style = window.document.createElement('style');
style.textContent = css;
window.document.head.appendChild(style);
const parsed = new Set(
  [...style.sheet.cssRules].map((rule) =>
    normalize(
      rule.selectorText !== undefined
        ? rule.selectorText
        : rule.cssText.slice(0, rule.cssText.indexOf('{'))
    )
  )
);

const lost = declared.filter((selector) => !parsed.has(selector));

if (lost.length > 0) {
  console.error(
    `styles.css : ${lost.length} règle(s) écrite(s) mais PERDUE(S) par le parseur CSS.\n` +
      lost.map((s) => `  - ${s}`).join('\n') +
      '\n\nCause la plus probable : un commentaire fermé trop tôt par une séquence étoile +\n' +
      "barre oblique — cherchez-la dans les commentaires du fichier. Le parseur avale alors\n" +
      'le texte jusqu\'à la première accolade et emporte la règle qui suit.'
  );
  process.exit(1);
}

console.log(`styles.css : ${declared.length} règles écrites, toutes retenues par le parseur.`);
