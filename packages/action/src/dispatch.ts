// La répartition du balayage, bornée par ce qu'une matrice admet.
//
// LE FAIT DE PLATEFORME : « A job matrix can generate a maximum of 256 jobs per workflow
// run » (limites d'Actions, hébergé comme auto-hébergé). Au-dessus, le job de matrice ne
// démarre pas du tout — et le balayage planifié est la SEULE borne sur l'âge d'un statut
// après la dé-résolution d'un fil, que nul événement ne signale (§A.8). Un dépôt de plus
// de 256 PR ouvertes perdait donc l'intégralité de ce rattrapage.
//
// POURQUOI UNE ROTATION PLUTÔT QU'UN PLAFOND. Tronquer à 256 suffirait à faire démarrer le
// job, et transformerait un échec BRUYANT — l'exécution planifiée au rouge toutes les
// demi-heures — en TROU SILENCIEUX : la queue de la liste ne serait jamais balayée, et
// rien ne le dirait. C'est exactement le sens que le §A.8 passe un paragraphe à interdire.
// Les ordres de tri évidents ne rattrapent rien : publier un check run ne touche pas à
// l'`updated_at` d'une PR, si bien qu'un tri par mise à jour croissante rebalaie
// indéfiniment les 256 mêmes.
//
// CE QUE LA ROTATION GARANTIT, ET CE QU'ELLE N'ASSURE PAS. L'indice de tranche avance à
// chaque exécution, donc toutes les tranches passent : chaque PR ouverte est réévaluée au
// plus tous les `intervalle de cron × ceil(N / 256)`. La borne est APPROCHÉE dès que la
// liste bouge entre deux exécutions — une PR ouverte ou fermée décale les frontières de
// tranche —, ce qui peut faire sauter un tour à une PR, jamais la sortir du cycle.

/** Ce qu'une matrice admet par exécution de workflow. */
export const MATRIX_LIMIT = 256;

/**
 * La tranche de `items` que cette exécution évalue.
 *
 * `runIndex` doit AVANCER d'une exécution à la suivante, et c'est sa seule exigence : sa
 * valeur absolue n'a aucun sens ici, seul son incrément fait tourner les tranches.
 *
 * L'ordre reçu doit être stable d'une exécution à l'autre, sans quoi les tranches se
 * recomposent à chaque tour et la rotation ne couvre plus rien — l'appelant trie par
 * numéro de PR.
 */
export function dispatchSlice<T>(items: T[], runIndex: number, limit = MATRIX_LIMIT): T[] {
  if (limit <= 0) throw new Error(`limit must be positive, got ${limit}`);
  if (items.length <= limit) return items;
  const slices = Math.ceil(items.length / limit);
  // Le modulo de JavaScript garde le signe du dividende : `-1 % 3` vaut `-1`, et une
  // tranche négative rendrait une liste vide. Un `runIndex` négatif ne devrait pas se
  // produire, et le normaliser coûte moins que d'en dépendre.
  const index = ((Math.trunc(runIndex) % slices) + slices) % slices;
  return items.slice(index * limit, index * limit + limit);
}
