// Une ligne du journal local (§9.4, CA-11), et la façon dont une ligne en remplace une autre.
//
// Le journal porte deux sortes de lignes, qui se distinguent par leur NIVEAU : un sélecteur
// qui n'a rien trouvé (WARN), une exception levée par l'extension (ERROR). Le niveau se DÉDUIT
// de la sorte de ligne (`entryLevel`) et ne s'écrit pas : une valeur stockée pourrait
// contredire la sorte qu'elle accompagne, et les lignes déjà écrites n'en portent pas.
//
// Les champs au-delà du strict nécessaire sont OPTIONNELS : le journal vit dans
// `chrome.storage.local` et survit aux mises à jour, si bien que la page d'options relit des
// lignes écrites par une version qui ne les connaissait pas.

interface EntryBase {
  /** Dernier relevé. */
  at: string;
  /** Adresse de la page au dernier relevé, telle quelle. */
  url?: string;
  /** Identifiant de la plateforme dont l'adaptateur a journalisé. */
  platform?: string;
  /** Premier relevé de cette ligne conservé dans le journal. */
  firstAt?: string;
  /** Nombre de relevés fusionnés dans cette ligne : un par ligne et par visite de page
   * (`SelectorLog.forgetSeen`), jamais un par mutation du DOM. Il dit « sur combien de visites »,
   * pas « combien de fois » — le rythme des mutations ne mesure rien (voir `selector-journal`). */
  count?: number;
}

/** Une chaîne de sélecteurs qui n'a rien trouvé. Les lignes écrites avant `kind` n'en portent
 * pas : l'absence vaut `selector`. */
export interface SelectorFailure extends EntryBase {
  kind?: 'selector';
  /** Nom stable de la chaîne de sélecteurs. */
  chain: string;
  /** Les candidats que la chaîne a essayés, dans l'ordre : ce qu'il faut ouvrir dans les
   * outils de développement pour comprendre POURQUOI aucun n'a répondu. */
  candidates?: string[];
  /** Ce que la chaîne SERT À FAIRE, dans un vocabulaire fermé et neutre (`SELECTOR_PROBLEMS`) :
   * la page d'options en tire la phrase affichée, dans la langue de la personne. */
  problem?: string;
}

/** Une exception levée par le code de l'extension, attrapée par personne d'autre. */
export interface ErrorEntry extends EntryBase {
  kind: 'error';
  message: string;
  stack?: string;
  /** Ce que le code FAISAIT quand l'exception a été levée, dans un vocabulaire fermé
   * (`ERROR_CONTEXTS`) : la page d'options en tire la phrase affichée. Absent, l'exception a
   * échappé à tout point d'entrée connu — on sait qu'elle a eu lieu, pas pendant quoi. */
  context?: string;
}

export type JournalEntry = SelectorFailure | ErrorEntry;

export type JournalLevel = 'warn' | 'error';

export function entryLevel(entry: JournalEntry): JournalLevel {
  return entry.kind === 'error' ? 'error' : 'warn';
}

/** Ce qui fait que deux lignes sont LA MÊME : la chaîne, ou le contexte et le message d'une
 * exception — le même message levé pendant deux choses différentes est deux lignes. Un nom de
 * chaîne ne peut pas commencer par `error:` : le préfixe suffit à séparer les deux espaces. */
export function entryKey(entry: JournalEntry): string {
  return entry.kind === 'error' ? `error:${entry.context ?? ''}:${entry.message}` : entry.chain;
}

/** La ligne écrite remplace la précédente de la même clé, mais lui reprend ce qu'elle sait.
 * Une ligne écrite avant ces champs compte pour un relevé, daté de son propre `at`. */
export function mergeJournalEntry<T extends JournalEntry>(previous: T | undefined, next: T): T {
  if (previous === undefined) return { ...next, firstAt: next.at, count: 1 };
  return {
    ...next,
    firstAt: previous.firstAt ?? previous.at,
    count: (previous.count ?? 1) + 1,
  };
}
