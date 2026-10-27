// La règle de périmètre d'une PR : elle touche UNE plateforme, OU le code partagé — jamais les
// deux. Isolée du garde `check-pr-scope.mjs` pour être testée sur des listes fabriquées
// (tests/pr-scope.test.ts).
//
// Pourquoi : l'interface GitHub est terminée et stable, et une correction Azure DevOps ou la
// création de GitLab ne doit pas pouvoir la casser. Le paquet d'un adaptateur n'est exécuté
// que sur sa plateforme ; le code partagé, lui, l'est sur toutes. Une PR « Azure DevOps » qui
// retouche aussi le contrôleur partagé modifie donc GitHub sans le dire — c'est la forme
// qu'ont prise les huit correctifs de mise en page motivés par GitHub seul et atterris dans du
// code commun. La règle force cette modification à se présenter pour ce qu'elle est : une PR
// de contrat, qui touche le code partagé et, le cas échéant, TOUTES les plateformes.
//
// Ce qui est neutre, c'est-à-dire admis avec n'importe quoi :
//   - la documentation (`*.md`, `docs/`) ;
//   - les tests partagés (`tests/`, `packages/*/test/`), qui exécutent le produit sans le
//     changer ;
//   - l'outillage hors de `packages/` (scripts, spikes, workflows, verrou npm) : il ne part
//     pas dans l'extension ni dans le serveur. La règle protège le produit livré.
//
// L'inscription d'une plateforme NOUVELLE (registre, composition root, dépendances, schéma
// managé, libellé de menu, amorçage du serveur) touche forcément des fichiers partagés : ces
// fichiers sont admis avec une plateforme, mais seulement quand la PR CRÉE cette plateforme
// (son `package.json` est ajouté). Le reste du temps, ils comptent comme partagés.

/** Les fichiers où une plateforme s'inscrit. Une liste, donc une affirmation qui vieillit : si
 * créer une plateforme exige un fichier de plus, la PR qui la crée sera refusée et le dira —
 * c'est le moment de l'ajouter ici. */
export const REGISTRATION_FILES = [
  'packages/extension/src/platforms.ts',
  'packages/extension/src/content.ts',
  'packages/extension/package.json',
  'packages/extension/tsconfig.json',
  'packages/extension/src/managed-schema.json',
  'packages/extension/src/ui/strings.ts',
  'packages/server/src/bootstrap.ts',
  'packages/server/src/index.ts',
];

/** Les identifiants dont le nom de fichier est porteur, découpé sur `-`, `_` et `.` :
 * `check-github-theme-vars.mjs` → `github`. */
function idsInName(path, ids) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return ids.filter((id) => name.split(/[-_.]/).includes(id));
}

/**
 * La classe d'un chemin : `docs`, `test` et `tooling` sont neutres, `platform:<id>` appartient à
 * une plateforme, `registration` est un fichier d'inscription, `shared` est le code partagé.
 */
export function classifyPath(path, ids) {
  if (path.endsWith('.md') || path.startsWith('docs/')) return 'docs';
  const own = /^packages\/(?:adapters|server\/src\/adapters)\/([^/]+)\//.exec(path);
  if (own && ids.includes(own[1])) return `platform:${own[1]}`;
  const named = idsInName(path, ids);
  const isTest = path.startsWith('tests/') || /^packages\/[^/]+(?:\/[^/]+)?\/test\//.test(path);
  if (isTest || !path.startsWith('packages/')) {
    // Un test ou un outil qui porte le nom d'une plateforme lui appartient : c'est une
    // information, pas une contrainte, puisque ces classes sont neutres de toute façon.
    if (named.length === 1) return `platform:${named[0]}`;
    return isTest ? 'test' : 'tooling';
  }
  if (REGISTRATION_FILES.includes(path)) return 'registration';
  return 'shared';
}

/**
 * Le verdict sur une PR. `files` est une liste de `{ path, added }` ; `added` dit que le fichier
 * est créé par la PR (statut `A` de `git diff --name-status`).
 */
export function prScopeVerdict(files, ids) {
  const groups = {};
  for (const { path } of files) (groups[classifyPath(path, ids)] ??= []).push(path);
  const platforms = Object.keys(groups)
    .filter((k) => k.startsWith('platform:'))
    .map((k) => k.slice('platform:'.length))
    .sort();
  // Une plateforme est CRÉÉE quand la PR ajoute le manifeste de son paquet d'adaptateur.
  const created = files
    .filter((f) => f.added)
    .map((f) => /^packages\/adapters\/([^/]+)\/package\.json$/.exec(f.path)?.[1])
    .filter((id) => id && ids.includes(id));
  const shared = [...(groups.shared ?? [])];
  const registration = groups.registration ?? [];
  const isCreation = platforms.length === 1 && created.includes(platforms[0]);
  if (!isCreation) shared.push(...registration);

  const reasons = [];
  if (platforms.length > 1 && platforms.length < ids.length) {
    reasons.push(
      `la PR touche ${platforms.join(' et ')}, mais pas toutes les plateformes : une modification ` +
        `qui en concerne plusieurs passe par le code partagé, et vaut alors pour toutes`
    );
  }
  if (platforms.length > 0 && platforms.length < ids.length && shared.length > 0) {
    reasons.push(
      `la PR touche ${platforms.join(' et ')} ET le code partagé : le code partagé s'exécute sur ` +
        `toutes les plateformes, il se modifie dans une PR à part`
    );
  }
  let kind = 'neutral';
  if (reasons.length) kind = 'mixed';
  else if (platforms.length === ids.length && ids.length > 0) kind = 'contract';
  else if (isCreation) kind = 'new-platform';
  else if (platforms.length > 0) kind = 'platform';
  else if (shared.length > 0) kind = 'shared';
  return { ok: reasons.length === 0, kind, platforms, shared, reasons, groups };
}
