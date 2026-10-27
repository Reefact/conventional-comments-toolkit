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
// L'inscription d'une plateforme (registre, composition root, dépendances, schéma managé,
// libellé de menu, amorçage du serveur) touche forcément des fichiers partagés : ces fichiers
// sont admis avec une plateforme, mais seulement quand la PR CRÉE cette plateforme ou la RETIRE
// (son `package.json` est ajouté ou supprimé). Le reste du temps, ils comptent comme partagés.

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

/**
 * Les plateformes : les dossiers de `packages/adapters/` hors `shared`, pris des DEUX côtés de la
 * comparaison. Lues dans la seule copie de travail, une PR qui supprime un adaptateur entier
 * effaçait la plateforme avant que ses fichiers soient classés : ils tombaient dans le partagé,
 * et « supprimer Azure DevOps + retoucher le contrôleur commun » passait pour une PR partagée
 * (revue Codex, PR #78). `listings` : une liste de chemins de dossiers par côté.
 */
export function platformIds(...listings) {
  const ids = new Set();
  for (const dirs of listings) {
    for (const dir of dirs) {
      const id = /^packages\/adapters\/([^/]+)\/?$/.exec(dir)?.[1];
      if (id && id !== 'shared') ids.add(id);
    }
  }
  return [...ids].sort();
}

/**
 * La classe d'un chemin : `docs`, `test` et `tooling` sont neutres, `platform:<id>` appartient à
 * une plateforme, `registration` est un fichier d'inscription, `shared` est le code partagé.
 */
export function classifyPath(path, ids) {
  if (path.endsWith('.md') || path.startsWith('docs/')) return 'docs';
  const own = /^packages\/(?:adapters|server\/src\/adapters)\/([^/]+)\//.exec(path);
  if (own && ids.includes(own[1])) return `platform:${own[1]}`;
  // Un test ou un outil reste neutre MÊME s'il porte le nom d'une plateforme. L'y rattacher
  // (`check-github-theme-vars.mjs` → github) en faisait une plateforme touchée : une PR partagée
  // qui le modifiait était refusée, et une PR Azure DevOps + partagé passait pour un contrat
  // en touchant ce seul script (revue Codex, PR #78).
  if (path.startsWith('tests/') || /^packages\/[^/]+(?:\/[^/]+)?\/test\//.test(path)) return 'test';
  if (!path.startsWith('packages/')) return 'tooling';
  if (REGISTRATION_FILES.includes(path)) return 'registration';
  return 'shared';
}

/**
 * Le verdict sur une PR. `files` est une liste de `{ path, added, deleted }` : le fichier est
 * créé (statut `A` de `git diff --name-status`) ou supprimé (statut `D`) par la PR.
 */
export function prScopeVerdict(files, ids) {
  const groups = {};
  for (const { path } of files) (groups[classifyPath(path, ids)] ??= []).push(path);
  const platforms = Object.keys(groups)
    .filter((k) => k.startsWith('platform:'))
    .map((k) => k.slice('platform:'.length))
    .sort();
  // Une plateforme est CRÉÉE quand la PR ajoute le manifeste de son paquet d'adaptateur, RETIRÉE
  // quand elle le supprime. Le retrait demande l'exemption symétrique : il doit défaire
  // l'inscription dans la même PR, faute de quoi aucun découpage n'est vert — l'adaptateur
  // d'abord laisse des imports morts, l'inscription d'abord fait échouer
  // `platform-registry.test.ts`, qui exige un registre égal aux dossiers (revue Reefact, PR #78).
  const manifestOf = (f) => /^packages\/adapters\/([^/]+)\/package\.json$/.exec(f.path)?.[1];
  const changedManifests = (flag) =>
    files.filter((f) => f[flag]).map(manifestOf).filter((id) => id && ids.includes(id));
  const created = changedManifests('added');
  const removed = changedManifests('deleted');
  const shared = [...(groups.shared ?? [])];
  const registration = groups.registration ?? [];
  const only = platforms.length === 1 ? platforms[0] : null;
  const isCreation = only !== null && created.includes(only);
  const isRemoval = only !== null && removed.includes(only);
  if (!isCreation && !isRemoval) shared.push(...registration);

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
  // Un contrat touche le code partagé ET toutes les plateformes. Toutes les plateformes SANS code
  // partagé est admis, mais ne s'annonce pas comme un contrat : le message affirmerait un code
  // partagé que la PR ne touche pas (revue Reefact, PR #78).
  else if (platforms.length === ids.length && ids.length > 0) {
    kind = shared.length > 0 ? 'contract' : 'all-platforms';
  } else if (isCreation) kind = 'new-platform';
  else if (isRemoval) kind = 'removed-platform';
  else if (platforms.length > 0) kind = 'platform';
  else if (shared.length > 0) kind = 'shared';
  return { ok: reasons.length === 0, kind, platforms, shared, reasons, groups };
}
