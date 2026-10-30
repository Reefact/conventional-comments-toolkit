// Une ligne du journal local de dégradation de sélecteurs (§9.4, CA-11), et la façon dont une
// ligne en remplace une autre.
//
// Les champs au-delà de `chain`/`at` sont OPTIONNELS : le journal vit dans `chrome.storage.local`
// et survit aux mises à jour, si bien que la page d'options relit des lignes écrites par une
// version qui ne les connaissait pas.

export interface SelectorFailure {
  /** Nom stable de la chaîne de sélecteurs. */
  chain: string;
  /** Dernier relevé. */
  at: string;
  /** Adresse de la page au dernier relevé, telle quelle. */
  url?: string;
  /** Les candidats que la chaîne a essayés, dans l'ordre : ce qu'il faut ouvrir dans les
   * outils de développement pour comprendre POURQUOI aucun n'a répondu. */
  candidates?: string[];
  /** Identifiant de la plateforme dont l'adaptateur a journalisé. */
  platform?: string;
  /** Premier relevé de cette chaîne conservé dans le journal. */
  firstAt?: string;
  /** Nombre de relevés fusionnés dans cette ligne : un par chaîne et par visite de page
   * (`SelectorLog.forgetSeen`), jamais un par mutation du DOM. Il dit « sur combien de visites »,
   * pas « combien de fois » — le rythme des mutations ne mesure rien (voir `selector-journal`). */
  count?: number;
}

/** La ligne écrite remplace la précédente de la même chaîne, mais lui reprend ce qu'elle sait.
 * Une ligne écrite avant ces champs compte pour un relevé, daté de son propre `at`. */
export function mergeSelectorFailure(
  previous: SelectorFailure | undefined,
  next: SelectorFailure
): SelectorFailure {
  if (previous === undefined) return { ...next, firstAt: next.at, count: 1 };
  return {
    ...next,
    firstAt: previous.firstAt ?? previous.at,
    count: (previous.count ?? 1) + 1,
  };
}
