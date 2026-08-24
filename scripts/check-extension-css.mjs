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

/** Les commentaires peuvent citer un sélecteur en prose (« emportant la règle
 * .cct-toolbar { … } ») : les laisser dans le texte analysé ferait exiger du garde une
 * règle qui n'en est pas une. Cette expression s'arrête exactement là où le parseur CSS
 * s'arrête — à la première séquence de fermeture —, si bien qu'un commentaire fermé trop
 * tôt laisse malgré tout apparaître la règle qui suit, et reste donc détecté. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

// Sélecteurs ÉCRITS : une règle commence par « . » ou « @ » — en début de ligne, ou après
// une simple indentation pour les règles imbriquées dans un @media — et court jusqu'à son
// accolade ouvrante, liste de sélecteurs multi-lignes comprise.
const declared = [...stripComments(css).matchAll(/^[ \t]*([.@][^{}]*?)\s*\{/gm)].map((m) =>
  normalize(m[1])
);

// Sélecteurs RETENUS par le parseur, règles groupantes (@media, @supports) parcourues
// récursivement : sans cette descente, une règle détruite À L'INTÉRIEUR d'un @media
// laisserait le garde vert, puisque seul le @media survivant serait constaté.
const collect = (rules, into) => {
  for (const rule of rules) {
    into.add(
      normalize(
        rule.selectorText !== undefined
          ? rule.selectorText
          : rule.cssText.slice(0, rule.cssText.indexOf('{'))
      )
    );
    if (rule.cssRules?.length) collect(rule.cssRules, into);
  }
  return into;
};

const window = new Window();
const style = window.document.createElement('style');
style.textContent = css;
window.document.head.appendChild(style);
const parsed = collect(style.sheet.cssRules, new Set());

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
