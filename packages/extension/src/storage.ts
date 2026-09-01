// Écritures de `chrome.storage` depuis le SCRIPT DE CONTENU — un seul endroit, parce que la
// question « deux onglets écrivent-ils cette clé ? » doit être posée une fois plutôt qu'à
// chaque site d'appel, où elle a déjà été oubliée (revue Codex, PR #31).
//
// Le contexte est ce qui rend la question obligatoire : un script de contenu s'exécute une
// fois PAR ONGLET, sur autant d'onglets que la personne en ouvre, et tous écrivent la même
// aire de stockage. Un `set()` remplace la valeur entière : deux onglets s'effacent l'un
// l'autre sans que rien ne le signale. `background.ts` et la page d'options n'ont pas ce
// problème — un seul contexte — et portent déjà leurs propres files d'attente (PR #29).
//
// `scripts/check-content-script-io.mjs` interdit tout `storage.*.set()` ailleurs que dans ce
// fichier pour le bundle de contenu.

declare const chrome:
  | {
      storage?: {
        local?: {
          get?: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
          set?: (items: Record<string, unknown>, cb?: () => void) => void;
        };
      };
    }
  | undefined;

function localArea(): NonNullable<NonNullable<NonNullable<typeof chrome>['storage']>['local']> | null {
  try {
    return chrome?.storage?.local ?? null;
  } catch {
    // `chrome` est un `declare const` : hors contexte d'extension, la seule mention de
    // l'identifiant lève une ReferenceError, qu'un `?.` ne rattrape pas.
    return null;
  }
}

/** Écrit des clés dont CE contexte est la seule source de vérité vivante — l'état courant
 * de l'onglet au premier plan (§9.2.3). Le dernier écrivain gagne, et c'est le comportement
 * voulu : ces clés décrivent « ce que l'extension constate maintenant », pas un historique.
 * Le dire ici évite qu'on le redécouvre comme un bug. */
export function writeCurrentState(items: Record<string, unknown>): void {
  localArea()?.set?.(items);
}

/** File d'attente d'un seul écrivain, PAR ONGLET. Elle ne protège que de la concurrence
 * interne à cet onglet ; entre onglets, c'est la lecture-écriture ci-dessous qui compte. */
let journalQueue: Promise<unknown> = Promise.resolve();

/** Ajoute des entrées à un journal partagé, en RELISANT d'abord ce qui s'y trouve.
 *
 * C'est la correction du défaut : `set()` avec le seul journal en mémoire de cet onglet
 * effaçait l'historique des autres onglets et celui d'avant le rechargement — le « 50
 * dernières » annoncé n'était que les 50 dernières de l'onglet ayant écrit en dernier.
 *
 * Ce que cette fonction NE fait PAS, et il faut le dire : `chrome.storage` n'offre aucune
 * écriture conditionnelle, donc deux onglets qui relisent au même instant peuvent encore
 * perdre une entrée. Le journal est un outil de diagnostic (§9.4), pas une comptabilité :
 * perdre une ligne sur une collision est acceptable, perdre tout l'historique à chaque
 * dégradation ne l'était pas. */
export function appendToJournal<T>(key: string, entries: readonly T[], limit: number): Promise<void> {
  const next = journalQueue.then(
    () =>
      new Promise<void>((resolve) => {
        const area = localArea();
        if (!area?.get || !area?.set) return resolve();
        area.get([key], (items) => {
          const existing = Array.isArray(items?.[key]) ? (items[key] as T[]) : [];
          area.set!({ [key]: [...existing, ...entries].slice(-limit) }, () => resolve());
        });
      })
  );
  journalQueue = next.catch(() => undefined);
  return next;
}
