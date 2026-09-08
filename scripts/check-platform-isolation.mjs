// Garde du repo : AUCUN identifiant propre à une plateforme ne vit hors du paquet de cette
// plateforme.
//
// C'est la mécanisation d'une règle que le §9.4 énonce depuis toujours — « les sélecteurs DOM
// sont centralisés dans un fichier unique par adaptateur » — et que rien ne vérifiait. Deux
// littéraux GitHub ont donc vécu dans le contrôleur PARTAGÉ, exécutés sur chaque page Azure
// DevOps : `[data-testid*="comment-composer"]` et la classe `CommentBox`. Ils n'y matchaient
// rien, si bien qu'aucun test ne pouvait les voir ; mais un renommage chez GitHub se serait
// corrigé dans un fichier que les deux plateformes exécutent, et huit correctifs de mise en
// page motivés par GitHub seul ont atterri de la même façon dans du code partagé.
//
// LE VOCABULAIRE INTERDIT N'EST PAS UNE LISTE ÉCRITE ICI, et c'est le point de conception
// central. Une liste de noms vieillit : ce dépôt en a déjà corrigé plusieurs qui affirmaient
// faussement, et sa règle est qu'un critère se maintient là où une énumération se périme. Le
// vocabulaire est donc DÉRIVÉ des fichiers de sélecteurs des adaptateurs. Le jour où un
// adaptateur GitLab arrive avec ses propres noms, ce garde les couvre sans qu'on l'ait touché.
//
// Ce qu'il ne peut PAS voir, et qui doit rester écrit :
//   - un nom de plateforme qu'aucun sélecteur ne mentionne (une constante inventée dans du
//     code partagé, sans jumeau dans un adaptateur) lui échappe. Il attrape la DUPLICATION
//     d'un vocabulaire d'adaptateur, qui est la forme qu'a prise chacune des fuites réelles ;
//   - il lit le CODE, jamais les commentaires. Un commentaire français qui explique pourquoi
//     `CommentBox` fut un problème est légitime et doit le rester — c'est la mémoire du
//     défaut. Le tri est fait par esbuild, un vrai parseur, et non par une expression
//     régulière qui confondrait une URL avec un commentaire.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { transformSync } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Les paquets qui ne doivent connaître AUCUNE plateforme. `core/` s'en interdit déjà par
 * contrat (§9.1 : « aucune dépendance DOM ni plateforme »), `adapters/shared` est le socle
 * commun, et `extension/` orchestre sans savoir qui il décore — à l'exception de sa couche de
 * routage d'hôtes, qui doit nommer les plateformes pour choisir un adaptateur. */
const NEUTRAL_ROOTS = [
  'packages/core/src',
  'packages/adapters/shared/src',
  'packages/extension/src',
];

/** Le composition root, et lui seul, a le droit de nommer les plateformes : quelqu'un doit
 * choisir l'implémentation à construire. C'est l'unique `if` de plateforme que l'architecture
 * admet, et il est ici plutôt que dispersé — c'est précisément ce que le port permet.
 *
 * Chaque exemption est un fichier ENTIER et doit le rester lisible : allonger cette liste est
 * un choix d'architecture, pas une commodité. */
const COMPOSITION_ROOT = [
  'packages/extension/src/host-platform.ts', // quelle plateforme sert cet hôte (§2)
  'packages/extension/src/background.ts', // répartition des hôtes accordés, relais de config
  'packages/extension/src/content-internal.ts', // construit l'adaptateur retenu
  'packages/extension/src/options/options.ts', // laisse la personne étiqueter un hôte
];

const ADAPTERS = join(root, 'packages/adapters');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Les mots DISTINCTIFS d'un fichier de sélecteurs : noms de classes, identifiants en dièse,
 * valeurs de `data-testid`, de `name=`, d'`id=`, et noms de modules Primer. Volontairement PAS les noms de balises ni les
 * attributs standard (`textarea`, `aria-label`, `placeholder`…) : ceux-là appartiennent à HTML,
 * pas à une plateforme, et les interdire au code partagé n'aurait aucun sens. */
function vocabularyOf(css) {
  const words = new Set();
  const push = (w) => {
    if (w.length < 5) return;
    // Un mot ne distingue une plateforme que s'il a une MAJUSCULE INTERNE (`CommentBox`) ou un
    // SÉPARATEUR (`comment-composer`). Sans ce filtre, `.Label` de GitHub interdisait `Label`,
    // qui est un mot de NOTRE domaine — la première exécution de ce garde a signalé
    // `LabelConfig` dans neuf fichiers de `core/`. Un mot capitalisé isolé appartient à la
    // langue commune ; c'est la composition qui trahit une plateforme.
    if (!/[a-z][A-Z]/.test(w) && !/[-_]/.test(w)) return;
    words.add(w);
  };
  // .maClasse  /  [class*="maClasse"]  /  [data-testid*="mon-composeur"]  /  [name="x[y]"]
  for (const m of css.matchAll(/\[(?:class|data-testid|name|id)[^\]]*?["']([^"']+)["']\]/g)) push(m[1]);
  for (const m of css.matchAll(/\.([A-Za-z][\w-]*)/g)) push(m[1]);
  // …et les sélecteurs d'ID en DIÈSE, que l'extraction ignorait : `#new_comment_form` chez
  // GitHub, `#pull-request-complete-button` chez Azure DevOps étaient absents du vocabulaire
  // « dérivé », si bien que recopier l'un ou l'autre dans du TypeScript partagé laissait ce
  // garde au vert (Codex, PR #66). Un identifiant d'élément est aussi propre à une plateforme
  // qu'un nom de classe.
  for (const m of css.matchAll(/#([A-Za-z][\w-]*)/g)) push(m[1]);
  return words;
}

const vocabularies = new Map(); // plateforme -> Set(mots)
for (const platform of readdirSync(ADAPTERS)) {
  if (platform === 'shared') continue;
  // TOUT le paquet de la plateforme, jamais un fichier nommé. Ce garde a lu
  // `src/selectors.ts` pendant exactement un chantier : le jour où les candidats de composeur
  // sont partis dans `src/surfaces.ts`, le vocabulaire GitHub est tombé de 60 mots à 54, le
  // garde est resté AU VERT, et il ne rattrapait plus la fuite pour laquelle il avait été
  // écrit. Trouvé en réintroduisant la fuite après le déplacement, jamais en relisant.
  //
  // Un nom de fichier est une liste d'un seul élément, et il vieillit comme les autres : la
  // leçon que ce garde applique déjà aux noms de plateforme vaut aussi pour l'endroit où il
  // va les chercher. Le critère juste est le PAQUET — tout ce qu'écrit un paquet de
  // plateforme est, par construction, du vocabulaire de cette plateforme.
  const dir = join(ADAPTERS, platform, 'src');
  let files;
  try {
    files = walk(dir);
  } catch {
    continue; // un adaptateur sans sources : rien à dériver
  }
  // Transformé FICHIER PAR FICHIER, puis concaténé — jamais l'inverse. Concaténer d'abord fait
  // partager un même scope de premier niveau à des modules sans rapport : `surfaces.ts` importe
  // `selectors`, que `selectors.ts` déclare, et esbuild refuse alors le symbole dupliqué.
  //
  // Cette revue mérite d'être racontée exactement (Codex, PR #66). L'avertissement a été émis
  // quand la concaténation passait encore — mesuré aux deux adaptateurs, `transformSync`
  // l'acceptait, le garde rendait 0, la CI était verte —, et le SYMPTÔME étant absent la
  // conclusion fut que la trouvaille était fausse. Elle ne l'était pas : elle décrivait un
  // MÉCANISME, que le correctif suivant a déclenché en une ligne. Vérifier qu'un symptôme est
  // absent aujourd'hui ne réfute pas un mécanisme.
  // Les chaînes du fichier de sélecteurs, commentaires exclus — un commentaire y cite parfois
  // un sélecteur en exemple, ce qui n'en fait pas un candidat.
  // `minifyWhitespace` et non le transform nu : esbuild CONSERVE les commentaires attachés aux
  // membres de classe, et un commentaire qui cite un sélecteur entre backticks ressemblerait à
  // un littéral. Mesuré, pas supposé. Les identifiants, eux, ne sont pas renommés.
  const code = files
    .map((f) => transformSync(readFileSync(f, 'utf8'), { loader: 'ts', format: 'esm', minifyWhitespace: true }).code)
    .join('\n');
  // TOUTES les chaînes du fichier, MOINS les noms de chaînes de sélecteurs. Découper sur
  // `candidates: [ … ]` paraissait plus précis et ne l'était pas : un sélecteur contient
  // lui-même des crochets (`textarea[aria-label*="omment"][class*="CommentBox"]`), si bien que
  // la capture s'arrêtait au premier `]` et n'emportait qu'un fragment du premier candidat.
  // Le vocabulaire GitHub tombait ainsi à six mots dont ni `CommentBox` ni `comment-composer`,
  // et ce garde passait AVEC ET SANS la fuite qu'il est censé interdire — donc ne prouvait
  // rien. Trouvé en réintroduisant la fuite, jamais en relisant.
  //
  // `name:` porte l'étiquette de journalisation d'une chaîne (`merge-button`, `editors`), pas
  // un nom de la plateforme : l'interdire au code partagé n'aurait aucun sens.
  // Les TABLEAUX DE CANDIDATS, où qu'ils vivent dans le paquet — c'est le seul texte d'un
  // adaptateur qui soit un sélecteur DOM. Élargir à toutes les chaînes du paquet paraissait
  // plus sûr et ne l'était pas : les chemins d'API et le nom de notre propre fichier de
  // configuration (`.conventional-comments.json`) entraient au vocabulaire, et le garde
  // interdisait au code partagé des mots qui sont les siens.
  //
  // Le découpage est fait en ÉQUILIBRANT les crochets, pas par une expression régulière : un
  // sélecteur en contient (`textarea[aria-label*="omment"][class*="CommentBox"]`), et une
  // capture non gloutonne s'arrêtait au premier — le vocabulaire GitHub tombait alors à six
  // mots et le garde passait avec ET sans la fuite. C'est le même défaut qui a coûté deux
  // corrections à ce fichier ; il est ici traité à la source.
  const candidates = [];
  for (let i = code.indexOf('candidates'); i !== -1; i = code.indexOf('candidates', i + 1)) {
    const open = code.indexOf('[', i);
    if (open === -1) continue;
    let depth = 0;
    let quote = null;
    let j = open;
    for (; j < code.length; j++) {
      const ch = code[j];
      if (quote) {
        if (ch === '\\') j++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '[') depth++;
      else if (ch === ']' && --depth === 0) break;
    }
    candidates.push(code.slice(open, j));
  }
  const literals = candidates.flatMap((block) =>
    [...block.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2])
  );
  vocabularies.set(platform, vocabularyOf(literals.join('\n')));
}

if (vocabularies.size === 0) {
  console.error(
    "Aucun fichier de sélecteurs trouvé sous packages/adapters/*/src/selectors.ts.\n" +
      "Ce garde DÉRIVE de là le vocabulaire qu'il interdit ailleurs : sans source, il ne vérifie\n" +
      'rien tout en passant au vert. Corrigez la dérivation plutôt que de la contourner.'
  );
  process.exit(1);
}

const findings = [];
for (const rel of NEUTRAL_ROOTS) {
  for (const file of walk(join(root, rel))) {
    const relPath = relative(root, file).replaceAll('\\', '/');
    if (COMPOSITION_ROOT.includes(relPath)) continue;
    // Le CODE seul : esbuild retire les commentaires avec un vrai parseur. Une regex les
    // confondrait avec le `//` d'une URL, et ce garde refuserait alors des commentaires
    // légitimes — ceux qui gardent la mémoire des défauts, précisément ce qu'il faut préserver.
    const code = transformSync(readFileSync(file, 'utf8'), {
      loader: 'ts',
      format: 'esm',
      minifyWhitespace: true,
    }).code;
    // On ne cherche QUE dans les chaînes de caractères, et c'est la forme exacte qu'ont prise
    // les deux fuites réelles : `closest('[data-testid*="comment-composer"]')` et
    // `includes('CommentBox')`. Un sélecteur de plateforme est toujours une chaîne — jamais un
    // identifiant. Chercher dans tout le code confondait `LabelConfig` avec la classe `.Label`
    // de GitHub, et aurait rendu ce garde inutilisable donc désactivé.
    const strings = [...code.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]);
    for (const [platform, words] of vocabularies) {
      for (const word of words) {
        if (!strings.some((lit) => lit.includes(word))) continue;
        findings.push({ relPath, platform, word });
      }
    }
  }
}

/** Le contrat lui-même ne doit nommer aucune plateforme : un port exposant
 * `isGitHubChangesView()` obligerait le code partagé à savoir de qui il parle, et le
 * conditionnel que le polymorphisme supprime reviendrait sous un autre nom. */
const contract = readFileSync(join(root, 'packages/adapters/shared/src/index.ts'), 'utf8');
const contractCode = transformSync(contract, { loader: 'ts', format: 'esm', minifyWhitespace: true }).code;
const platformNames = [...vocabularies.keys(), 'github', 'gitlab', 'azdo', 'azure', 'bitbucket'];
const contractLeaks = [];
for (const m of contractCode.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?=[(:<])/g)) {
  const id = m[1];
  if (platformNames.some((p) => id.toLowerCase().includes(p))) contractLeaks.push(id);
}

if (findings.length === 0 && contractLeaks.length === 0) {
  const total = [...vocabularies.values()].reduce((a, s) => a + s.size, 0);
  const detail = [...vocabularies].map(([p, s]) => `${p} (${s.size})`).join(', ');
  console.log(`✓ isolation des plateformes : ${total} mots dérivés — ${detail} — absents du code partagé.`);
  process.exit(0);
}

if (findings.length > 0) {
  console.error(
    `${findings.length} identifiant(s) de plateforme dans du code qui ne doit connaître aucune plateforme :\n` +
      findings.map((f) => `  - ${f.relPath}  «${f.word}»  (vocabulaire ${f.platform})`).join('\n') +
      '\n\nCe mot est un candidat de sélecteur d\'un adaptateur. Sa place est dans ce paquet : exposez ce\n' +
      "dont le code partagé a besoin par une méthode du contrat (§9.2.3), qui rend une DONNÉE et\n" +
      'ne nomme aucune plateforme — voir `getEditorChrome()`. Le code partagé s\'exécute sur\n' +
      'TOUTES les plateformes : ce qui est écrit ici est exécuté par toutes.'
  );
}
if (contractLeaks.length > 0) {
  console.error(
    `\nLe contrat partagé nomme une plateforme : ${[...new Set(contractLeaks)].join(', ')}.\n` +
      "Un port dont une signature mentionne une plateforme a échoué : le code partagé devrait\n" +
      'alors savoir de qui il parle. Nommez le RÔLE, jamais la plateforme qui le tient.'
  );
}
process.exit(1);
