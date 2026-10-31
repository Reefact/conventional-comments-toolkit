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
          // Absents d'un navigateur qui ne les a pas : la garde de quota se passe alors d'eux.
          getBytesInUse?: (keys: string[] | null, cb: (bytes: number) => void) => void;
          QUOTA_BYTES?: number;
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
  // L'APPEL dans le `try`, pas seulement la résolution de `chrome.storage.local` : une mise
  // à jour, un rechargement ou une désactivation de l'extension invalide le contexte du
  // script de contenu, et `set()` lève alors SYNCHRONEMENT. La version d'avant la
  // centralisation entourait bien l'appel ; ma première rédaction ne couvrait que la
  // recherche de propriété, si bien qu'un diagnostic inoffensif pouvait faire échouer la
  // résolution de configuration qui l'appelait (revue Codex, PR #31).
  try {
    localArea()?.set?.(items);
  } catch {
    // Hors contexte d'extension, ou contexte invalidé : ces clés sont un diagnostic, leur
    // perte n'a aucune conséquence sur ce que l'extension fait dans la page.
  }
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
export function appendToJournal<T>(
  key: string,
  entries: readonly T[],
  limit: number,
  dedupeBy?: (entry: T) => string,
  merge?: (previous: T | undefined, next: T) => T
): Promise<void> {
  const next = journalQueue.then(
    () =>
      new Promise<void>((resolve) => {
        const area = localArea();
        if (!area?.get || !area?.set) return resolve();
        try {
          area.get([key], (items) => {
            const existing = Array.isArray(items?.[key]) ? (items[key] as T[]) : [];
            try {
              // `dedupeBy` : UNE ligne par clé, celle de l'écriture la plus récente. Le journal
              // de dégradation répond « quels sélecteurs ont échoué, et à quel chargement de page
              // pour la dernière fois » — jamais « combien de fois », un compte que le rythme des
              // mutations de la page dicte et qui ne mesure rien. PAS « la dernière occurrence » :
              // `SelectorLog` ne notifie qu'une fois par chaîne et par onglet, si bien qu'un
              // onglet ouvert des heures garde l'horodatage de sa première dégradation ; c'est le
              // chargement suivant qui le rafraîchit (revue Reefact, PR #48). Rafraîchir en
              // continu coûterait une écriture de stockage PAR MUTATION du DOM — la churn même que
              // cette déduplication existe pour supprimer. Sans cette clause, une PR fermée, où
              // l'absence du bouton de fusion est la norme, remplissait les 50 lignes de
              // `merge-button` à chaque rechargement et ÉVINÇAIT toute vraie dégradation.
              // La déduplication de `SelectorLog` borne un onglet ; celle-ci borne le journal
              // PARTAGÉ, que plusieurs onglets et plusieurs rechargements alimentent.
              const kept = dedupeBy
                ? existing.filter((e) => !entries.some((n) => dedupeBy(n) === dedupeBy(e)))
                : existing;
              // `merge` : la ligne remplacée peut transmettre ce qu'elle savait — première
              // apparition, nombre de relevés. Elle reste à la fin, donc la plus récente ; seul
              // son contenu change, jamais la borne ni l'ordre.
              const written =
                dedupeBy && merge
                  ? entries.map((n) => merge(existing.find((e) => dedupeBy(e) === dedupeBy(n)), n))
                  : entries;
              area.set!({ [key]: [...kept, ...written].slice(-limit) }, () => resolve());
            } catch {
              resolve(); // contexte invalidé entre la lecture et l'écriture
            }
          });
        } catch {
          resolve(); // même raison, du côté de la lecture
        }
      })
  );
  journalQueue = next.catch(() => undefined);
  return next;
}

/** Réécrit EN PLACE la ligne d'un journal partagé que `match` désigne — ni ajout, ni
 * déplacement, ni troncature. Même file d'attente qu'`appendToJournal` : une mise à jour
 * demandée après un ajout s'applique après lui, et retrouve donc la ligne qu'il a écrite.
 * Aucune ligne ne correspond (journal effacé entre-temps) : rien n'est écrit. */
export function updateJournalEntry<T>(key: string, match: (entry: T) => boolean, update: (entry: T) => T): Promise<void> {
  const next = journalQueue.then(
    () =>
      new Promise<void>((resolve) => {
        const area = localArea();
        if (!area?.get || !area?.set) return resolve();
        try {
          area.get([key], (items) => {
            const existing = Array.isArray(items?.[key]) ? (items[key] as T[]) : [];
            try {
              const at = existing.findIndex(match);
              if (at < 0) return resolve();
              const written = existing.map((e, i) => (i === at ? update(e) : e));
              area.set!({ [key]: written }, () => resolve());
            } catch {
              resolve(); // contexte invalidé entre la lecture et l'écriture
            }
          });
        } catch {
          resolve();
        }
      })
  );
  journalQueue = next.catch(() => undefined);
  return next;
}

/** Ajoute un squelette de page (`skeletons.ts`), dans le budget qui lui est réservé, et rien
 * si le quota de l'aire n'a plus de marge. Même file d'attente que le journal : la ligne qui
 * désigne ce squelette a été demandée avant lui, et elle est écrite avant lui.
 *
 * `fit` reçoit les squelettes existants et rend la liste à écrire, ou `null` pour n'écrire rien.
 * La garde de quota lit l'occupation de TOUTE l'aire : le budget borne ce que les squelettes
 * prennent, la garde protège ce qu'il reste aux autres clés. */
export function storeBounded<T>(
  key: string,
  fit: (existing: T[]) => T[] | null,
  headroom: number
): Promise<boolean> {
  const next = journalQueue.then(
    () =>
      new Promise<boolean>((resolve) => {
        const area = localArea();
        if (!area?.get || !area?.set) return resolve(false);
        try {
          area.get([key], (items) => {
            try {
              const existing = Array.isArray(items?.[key]) ? (items[key] as T[]) : [];
              const written = fit(existing);
              if (written === null) return resolve(false);
              const write = () => area.set!({ [key]: written }, () => resolve(true));
              const quota = area.QUOTA_BYTES;
              if (!area.getBytesInUse || typeof quota !== 'number') return write();
              area.getBytesInUse(null, (inUse) => {
                try {
                  // Ce qui s'ajoute, approché par la différence de taille JSON de la clé.
                  const grows = JSON.stringify(written).length - JSON.stringify(existing).length;
                  if (inUse + grows > quota * headroom) return resolve(false);
                  write();
                } catch {
                  resolve(false);
                }
              });
            } catch {
              resolve(false); // contexte invalidé entre la lecture et l'écriture
            }
          });
        } catch {
          resolve(false);
        }
      })
  );
  journalQueue = next.catch(() => undefined);
  return next;
}
