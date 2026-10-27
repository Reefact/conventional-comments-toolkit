// Ce qui CONTOURNE le contrat client (§9.2.3), cherché dans la source d'un fichier TypeScript.
// Isolé du garde `check-platform-isolation.mjs` pour être testé sur des sources fabriquées
// (tests/platform-isolation-guard.test.ts) : un garde qu'on ne fait jamais échouer ne prouve
// rien, et ce dépôt en a déjà livré qui passaient avec ET sans la fuite qu'ils interdisaient.
//
// Deux questions distinctes, et leur périmètre diffère — c'est l'objet de la revue Reefact sur
// la PR #75 :
//   - une CONVERSION DE TYPE vers le contrat ou vers un adaptateur concret n'est admise NULLE
//     PART, point de composition compris : c'est précisément dans `content-internal.ts` que
//     vivaient les six lectures hors contrat ; exempter ce fichier laissait leur retour au vert ;
//   - un IMPORT d'adaptateur concret, lui, est le métier du point de composition, et de lui seul.
//
// `as PlatformAdapter` SEUL compte : `{} as PlatformAdapter` (ou `as unknown as …`,
// `as Partial<…>`) fait compiler un adaptateur incomplet, exactement ce que le contrat
// obligatoire existe pour empêcher. La première version ne cherchait que `as PlatformAdapter &`.

/** La source sans ses commentaires — `/* … *\/`, puis `//` jusqu'à la fin de ligne quand il
 * n'est pas précédé de `:` (une URL). Suffisant ici : ce qu'on cherche n'apparaît jamais dans
 * une chaîne de caractères. */
export function stripTsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export const CAST_PATTERNS = [
  // Couvre `as PlatformAdapter`, `as PlatformAdapter & {…}`, `as unknown as PlatformAdapter`
  // et `as Partial<PlatformAdapter>`.
  { re: /\bas\s+(?:Partial\s*<\s*)?PlatformAdapter\b/, what: 'as PlatformAdapter' },
  { re: /<\s*PlatformAdapter\s*>\s*[\w({[]/, what: '<PlatformAdapter> (assertion)' },
  { re: /\bas\s+\w+ClientAdapter\b/, what: 'as <Plateforme>ClientAdapter' },
  { re: /\b\w+ClientAdapter\s*\|\s*\w+ClientAdapter\b/, what: '<A>ClientAdapter | <B>ClientAdapter' },
];

/** Les contournements trouvés dans `source`. `isCompositionRoot` n'exempte QUE les imports. */
export function findContractBypasses(source, { adapterIds, isCompositionRoot }) {
  const code = stripTsComments(source);
  const found = [];
  for (const { re, what } of CAST_PATTERNS) if (re.test(code)) found.push(what);
  if (!isCompositionRoot) {
    for (const id of adapterIds) {
      if (new RegExp(`from\\s*["']@cct/adapter-${id}["']`).test(code)) found.push(`import de @cct/adapter-${id}`);
    }
  }
  return found;
}
