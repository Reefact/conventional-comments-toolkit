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

import type { SelectorEvidence } from '@cct/adapter-shared';

interface EntryBase {
  /** Dernier relevé. */
  at: string;
  /** Adresse de la page au dernier relevé, telle quelle. */
  url?: string;
  /** Les dernières adresses DISTINCTES où la ligne a été relevée, la plus récente en dernier
   * (`MAX_URLS`). `url` ne garde que la dernière : douze relevés étalés sur cinq heures n'en
   * montraient qu'une, sans dire si les onze autres venaient de la même page. */
  urls?: string[];
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
  /** Ce que la page montrait au DERNIER relevé, à la place de ce qu'on cherchait : trace des
   * candidats, empreinte des contrôles voisins, faits lus par l'adaptateur (`SelectorEvidence`,
   * adapters/shared). Celui du dernier relevé seulement, comme `url`. */
  evidence?: SelectorEvidence;
  /** Sur combien des visites relevées la chaîne a fini par TROUVER son élément, plus tard dans
   * la même visite. Égal à `count` : la chaîne a été interrogée trop tôt, pas cassée. Absent :
   * jamais trouvée après coup. */
  recoveredVisits?: number;
  /** Millisecondes entre le début de la visite et ce succès tardif, au dernier rattrapage. */
  lastRecoveredAfterMs?: number;
  /** Identifiant du squelette de page pris au DERNIER relevé (`skeletons.ts`), stocké à part.
   * Il peut avoir été évincé depuis par le budget : l'archive de diagnostic le dit. */
  skeleton?: string;
  /** Le DERNIER relevé, celui des champs ci-dessus, a-t-il été rattrapé plus tard dans sa visite ?
   * Posé par `markRecovered`, retiré par chaque relevé nouveau. */
  latestRecovered?: boolean;
  /** Le dernier relevé JAMAIS rattrapé, quand un relevé plus récent l'a remplacé dans les champs
   * ci-dessus (#116). Un relevé rattrapé est une chaîne sondée trop tôt ; celui qui ne l'a pas été
   * est le seul qui puisse montrer une rupture, et c'était justement lui que le relevé suivant —
   * souvent un chargement encore en cours — écrasait. Absent : aucun relevé non rattrapé n'a été
   * remplacé. */
  unrecovered?: Observation;
}

/** Ce qu'un relevé a vu, sans ses compteurs. */
export interface Observation {
  at: string;
  url?: string;
  evidence?: SelectorEvidence;
  skeleton?: string;
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
  if (previous === undefined) {
    return { ...next, ...notYetRecovered(next), firstAt: next.at, count: 1, ...urlsOf(undefined, next) };
  }
  // Les rattrapages se cumulent comme `count` : ils comptent des visites passées, que la ligne
  // nouvelle ne connaît pas. Une ligne d'exception n'en porte jamais.
  const recovery =
    previous.kind !== 'error' && previous.recoveredVisits !== undefined
      ? { recoveredVisits: previous.recoveredVisits, lastRecoveredAfterMs: previous.lastRecoveredAfterMs }
      : {};
  // Le relevé que `next` va remplacer n'a pas été rattrapé : il passe en `unrecovered` (#116). Il
  // l'a été : le dernier non rattrapé déjà gardé reste en place.
  const kept =
    previous.kind !== 'error' && next.kind !== 'error'
      ? latestWasUnrecovered(previous)
        ? observationOf(previous)
        : previous.unrecovered
      : undefined;
  return {
    ...next,
    ...recovery,
    ...(kept ? { unrecovered: kept } : {}),
    ...notYetRecovered(next),
    firstAt: previous.firstAt ?? previous.at,
    count: (previous.count ?? 1) + 1,
    ...urlsOf(previous, next),
  };
}

/** Une ligne de sélecteur ÉCRITE par cette version dit toujours si son dernier relevé a été
 * rattrapé : `false` à l'écriture, `true` au rattrapage (`markRecovered`). Un champ ABSENT désigne
 * donc une ligne laissée par une version antérieure, et c'est ce qui la distingue (revue Reefact,
 * PR #141). */
function notYetRecovered(entry: JournalEntry): { latestRecovered?: false } {
  return entry.kind === 'error' ? {} : { latestRecovered: false };
}

/** Le dernier relevé de cette ligne est-il CERTAINEMENT non rattrapé ?
 *
 * Écrite par cette version, la ligne le dit. Écrite par une version antérieure, elle n'en garde que
 * ses compteurs, et l'on n'en tire que ce qu'ils prouvent : aucun rattrapage (`recoveredVisits`
 * absent) — le dernier relevé ne l'a pas été ; autant de rattrapages que de relevés — tous l'ont
 * été. Entre les deux, on ne sait pas LEQUEL l'a été : ne rien affirmer, plutôt que de présenter
 * comme une rupture le relevé d'une visite rattrapée (revue Reefact, PR #141). */
function latestWasUnrecovered(entry: SelectorFailure): boolean {
  if (entry.latestRecovered !== undefined) return !entry.latestRecovered;
  return (entry.recoveredVisits ?? 0) === 0;
}

function observationOf(entry: SelectorFailure): Observation {
  return {
    at: entry.at,
    ...(entry.url !== undefined ? { url: entry.url } : {}),
    ...(entry.evidence !== undefined ? { evidence: entry.evidence } : {}),
    ...(entry.skeleton !== undefined ? { skeleton: entry.skeleton } : {}),
  };
}

/** Les squelettes qu'une ligne désigne : celui du dernier relevé, et celui du dernier relevé non
 * rattrapé (#116). Ce qu'une ligne désigne est ce que le budget garde et ce que l'archive emporte. */
export function skeletonsOf(entry: unknown): string[] {
  const e = entry as { kind?: unknown; skeleton?: unknown; unrecovered?: { skeleton?: unknown } } | null;
  if (!e || e.kind === 'error') return [];
  return [e.skeleton, e.unrecovered?.skeleton].filter((id): id is string => typeof id === 'string');
}

export const MAX_URLS = 5;

function urlsOf(previous: JournalEntry | undefined, next: JournalEntry): { urls?: string[] } {
  const before = previous?.urls ?? (previous?.url ? [previous.url] : []);
  if (!next.url) return before.length > 0 ? { urls: before } : {};
  return { urls: [...before.filter((u) => u !== next.url), next.url].slice(-MAX_URLS) };
}

/** La ligne d'une chaîne journalisée pendant cette visite, qui vient de trouver son élément.
 * Elle ne change ni de place ni de date : c'est la même observation, complétée. */
export function markRecovered<T extends JournalEntry>(entry: T, msSinceVisit: number): T {
  if (entry.kind === 'error') return entry;
  return {
    ...entry,
    recoveredVisits: (entry.recoveredVisits ?? 0) + 1,
    lastRecoveredAfterMs: msSinceVisit,
    latestRecovered: true,
  };
}
