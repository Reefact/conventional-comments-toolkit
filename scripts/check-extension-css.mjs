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
// Le contrôle est textuel d'un côté (les règles telles qu'elles sont ÉCRITES) et
// sémantique de l'autre (les règles telles que le parseur les RETIENT) : c'est l'écart
// entre les deux qui révèle la règle perdue.
//
// Trois propriétés sont nécessaires pour que « chaque règle » soit vrai, et chacune a
// été un trou :
//   - toute FORME de sélecteur compte, pas seulement « . » et « @ » : le jour où la
//     feuille gagne un `:root`, un `button` ou un `[hidden]`, la règle doit rester
//     couverte ;
//   - les règles IMBRIQUÉES dans un @media comptent, sans quoi leur perte laisse le
//     garde vert, seul le @media survivant étant constaté ;
//   - les MULTIPLICITÉS comptent : deux règles au même sélecteur dont une seule
//     disparaît laissent l'autre répondre à sa place si l'on ne compare que des
//     présences.

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

/** Les commentaires peuvent citer une règle en prose (« emportant la règle
 * .cct-toolbar ») : les laisser dans le texte analysé ferait exiger du garde une règle
 * qui n'en est pas une. Cette expression s'arrête exactement là où le parseur CSS
 * s'arrête — à la première séquence de fermeture —, si bien qu'un commentaire fermé trop
 * tôt laisse malgré tout apparaître la règle qui suit, et reste donc détecté. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Préludes ÉCRITS : tout ce qui précède une accolade ouvrante, à n'importe quelle
 * profondeur. Balayage à la main plutôt qu'une expression régulière, parce qu'il faut
 * distinguer un prélude d'une déclaration (`color: red;`) et suivre l'imbrication — deux
 * choses qu'une expression régulière ne fait pas de façon fiable. Les chaînes entre
 * guillemets sont sautées, mais jamais au-delà d'une fin de ligne, et une accolade
 * trouvée dans l'une d'elles est signalée à l'appelant. */
function extractPreludes(source) {
  const preludes = [];
  /** Accolade à l'intérieur d'une chaîne : le parseur de happy-dom, sur lequel repose la
   * moitié « retenue » du contrôle, s'y perd et jette toutes les règles suivantes — là où
   * un vrai navigateur les garde. Le garde ne peut donc rien affirmer dans ce cas, et le
   * dire vaut mieux que d'énumérer des règles faussement perdues. */
  let braceInString = false;
  let buffer = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      buffer += ch;
      while (++i < source.length) {
        buffer += source[i];
        // Une chaîne CSS ne franchit pas une fin de ligne. Cette borne n'est pas un
        // détail : quand un commentaire fermé trop tôt fait fuiter de la prose dans le
        // texte analysé — et le français y apporte ses apostrophes —, sans elle une
        // fausse chaîne s'ouvre et avale toutes les règles qui suivent. Le garde
        // rendait alors « 0 règle écrite » et sortait au vert sur le cas même qu'il
        // existe pour attraper.
        if (source[i] === '\n') break;
        if (source[i] === '{' || source[i] === '}') braceInString = true;
        if (source[i] === '\\') buffer += source[++i] ?? '';
        else if (source[i] === quote) break;
      }
    } else if (ch === '{') {
      if (buffer.trim() !== '') preludes.push(buffer.trim());
      buffer = '';
    } else if (ch === '}' || ch === ';') {
      // Fin de bloc, ou fin d'une déclaration : ce qui précède n'était pas un prélude.
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  return { preludes, braceInString };
}

/** Sélecteurs RETENUS par le parseur, règles groupantes parcourues récursivement. */
function collect(rules, into = []) {
  for (const rule of rules) {
    into.push(
      rule.selectorText !== undefined
        ? rule.selectorText
        : rule.cssText.slice(0, rule.cssText.indexOf('{'))
    );
    if (rule.cssRules?.length) collect(rule.cssRules, into);
  }
  return into;
}

const tally = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
};

const window = new Window();
const style = window.document.createElement('style');
style.textContent = css;
window.document.head.appendChild(style);

const { preludes, braceInString } = extractPreludes(stripComments(css));
if (braceInString) {
  console.error(
    'styles.css contient une accolade à l\'intérieur d\'une chaîne (par exemple\n' +
      'content: "{"). Le parseur de happy-dom, sur lequel repose ce garde, jette toutes les\n' +
      'règles qui suivent une telle chaîne — un vrai navigateur, non. Le contrôle ne peut\n' +
      'donc rien affirmer ici : retirez cette construction du fichier, ou déplacez ce garde\n' +
      'vers un Chromium réel. Échouer est le seul verdict honnête.'
  );
  process.exit(1);
}
const declared = tally(preludes.map(normalize));
const parsed = tally(collect(style.sheet.cssRules).map(normalize));

// Comparaison de MULTIPLICITÉS : une règle perdue parmi deux au même sélecteur doit se
// voir, alors qu'une comparaison de présences la laisserait passer.
const lost = [];
for (const [selector, count] of declared) {
  const kept = parsed.get(selector) ?? 0;
  if (kept < count) lost.push({ selector, count, kept });
}

if (lost.length > 0) {
  console.error(
    `styles.css : ${lost.length} règle(s) écrite(s) mais PERDUE(S) par le parseur CSS.\n` +
      lost
        .map((l) => `  - ${l.selector}` + (l.count > 1 ? `  (${l.kept} retenue(s) sur ${l.count})` : ''))
        .join('\n') +
      '\n\nCause la plus probable : un commentaire fermé trop tôt par une séquence étoile +\n' +
      "barre oblique — cherchez-la dans les commentaires du fichier. Le parseur avale alors\n" +
      'le texte jusqu\'à la première accolade et emporte la règle qui suit.'
  );
  process.exit(1);
}

const total = [...declared.values()].reduce((a, b) => a + b, 0);
console.log(`styles.css : ${total} règles écrites, toutes retenues par le parseur.`);
