// Le canari des sélecteurs : ce qu'il vérifie, sur quelles pages, et comment il conclut.
//
// Les tests sur pages capturées (`packages/adapters/<id>/test/real-pages.test.ts`) figent la
// page d'UN jour. Ils ne disent rien du jour où la plateforme s'en éloigne : c'est ce qu'ont
// montré les captures GitHub du 2026-10-28, où tous les candidats en `-module__` ne trouvaient
// plus rien sans qu'aucun garde l'ait vu. Ce canari charge chaque semaine de VRAIES pages et
// demande à chaque chaîne de trouver encore quelque chose.
//
// SANS SESSION, et c'est sa limite, écrite ici parce qu'elle ne se lit pas dans son verdict :
// les zones de saisie, leurs boutons et le panneau de revue n'existent que pour une personne
// connectée, et la vue des fichiers modifiés ne montre aucun fil à un visiteur anonyme
// (`/changes` redirige vers `/files`, où `rendered-threads` vaut zéro — mesuré le 2026-10-28).
// Le canari couvre donc la LECTURE de la page, pas l'écriture d'un commentaire.
//
// Les pages sont des PR FERMÉES : une PR ouverte change, et une chaîne qui ne trouverait plus
// rien parce que le dernier fil vient d'être supprimé serait une fausse alerte.

/** Les pages chargées et les chaînes qu'on attend d'y voir trouver quelque chose — mesurées
 * sans session le 2026-10-28, chaque chaîne ayant au moins un candidat non nul. Une chaîne
 * absente d'une liste n'y est pas attendue : `merge-button` ne s'affiche pas à un visiteur,
 * et #294 n'a aucun fil de revue. */
export const GITHUB_CANARY_PAGES = [
  {
    // Fusionnée, commentaires conventionnels publiés, aucun fil de revue.
    url: 'https://github.com/Reefact/just-dummies/pull/294',
    chains: [
      'prDescription',
      'renderedComment',
      'commentBody',
      'commentAuthor',
      'threadAnchor',
      'prCreatedAt',
      'repositoryPublicMeta',
    ],
  },
  {
    // Fusionnée, deux fils de revue résolus.
    url: 'https://github.com/Reefact/just-dummies/pull/292',
    chains: [
      'prDescription',
      'renderedComment',
      'commentBody',
      'commentAuthor',
      'threadAnchor',
      'prCreatedAt',
      'repositoryPublicMeta',
      'renderedThreads',
      'threadContainer',
    ],
  },
];

/** Le verdict d'une page : pour chaque chaîne attendue, le PREMIER candidat qui trouve quelque
 * chose — c'est celui que l'adaptateur emploierait —, ou rien.
 *
 * `counts` : `{ [cléDeChaîne]: number[] }`, un compte par candidat, dans l'ordre de la chaîne.
 * Une chaîne inconnue de `selectors` est une erreur du canari lui-même, pas une dérive : elle
 * est rangée à part, pour que le workflow ne l'annonce pas comme une rupture de la plateforme. */
export function canaryVerdict(selectors, chains, counts) {
  const found = [];
  const empty = [];
  const unknown = [];
  for (const key of chains) {
    const chain = selectors[key];
    if (!chain) {
      unknown.push(key);
      continue;
    }
    const perCandidate = counts[key] ?? [];
    const index = perCandidate.findIndex((n) => n > 0);
    if (index === -1) empty.push({ key, name: chain.name });
    else found.push({ key, name: chain.name, candidate: chain.candidates[index], count: perCandidate[index] });
  }
  return { found, empty, unknown };
}
