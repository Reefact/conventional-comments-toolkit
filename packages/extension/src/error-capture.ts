// Les exceptions que l'extension laisse échapper, relevées pour le journal (§9.4).
//
// Sans ce gestionnaire, un plantage du script de contenu ne laissait AUCUNE trace chez la
// personne qui le subit : il va dans la console de la page, que personne n'ouvre, et le journal
// restait vide pendant que le code levait. Le journal ne parlait que des sélecteurs.
//
// CE QUE CE GESTIONNAIRE VOIT, mesuré dans un vrai Chromium (extension sans permission d'hôte,
// monde isolé) — jamais rappelé : les exceptions du script de contenu levées dans un écouteur,
// un minuteur ou une promesse rejetée ; PAS celles de la page, qui vivent dans l'autre monde ;
// PAS une exception attrapée par le code. Il ne relève donc ni le bruit du site (GitHub a ses
// propres plantages) ni ce que l'extension gère déjà.
//
// CE QU'IL NE FAIT PAS : empêcher l'erreur. Un écouteur d'`error` n'appelle pas
// `preventDefault()`, la console de la page la montre donc comme avant.
//
// DEUX ÉTAGES, parce qu'un seul ne suffit pas à dire QUOI a échoué. Le gestionnaire global est un
// filet : il ne voit que l'exception, après coup — un message, une pile minifiée —, jamais ce que
// le code accomplissait. Cette information n'existe qu'au point d'appel : `guarded()` enrobe donc
// les points d'entrée (rendu, configuration, champ de commentaire, télémétrie), relève l'erreur
// AVEC son contexte, puis la relance. Le filet attrape le reste, sans contexte, et ne recompte
// pas ce qu'un enrobage a déjà relevé.

/** Ce qu'on retient d'une exception : assez pour la reconnaître et la situer, pas davantage.
 * Le message d'une exception peut citer ce que le code manipulait ; borné, il ne devient pas
 * une copie de la page. */
const MESSAGE_LIMIT = 300;
const STACK_LIMIT = 1500;

/** Au plus autant de messages DIFFÉRENTS par onglet et par page visitée : une boucle qui lève à
 * chaque mutation du DOM ne doit pas écrire dans le stockage à chaque tour — la churn même que
 * `SelectorLog` s'interdit pour ses propres lignes. */
const DISTINCT_LIMIT = 20;

export interface CapturedError {
  message: string;
  stack?: string;
  context?: ErrorContext;
}

/** Ce que le code FAISAIT quand il a levé : un vocabulaire fermé, que la page d'options dit dans
 * la langue de la personne (`options.journal.error.<id>`). Quatre, parce que ce sont les quatre
 * choses distinctes que le script de contenu fait, et qu'on sait les nommer sans mentir :
 *   • `render`    — afficher la page : bandeau, badges, filtre de fils ;
 *   • `config`    — lire la configuration effective ;
 *   • `editor`    — gérer un champ de commentaire : barre d'outils, validation, contrôle de l'envoi ;
 *   • `telemetry` — vidanger les compteurs.
 * « Pendant » et non « à cause de » : le contexte dit où l'on était, jamais la cause. */
export const ERROR_CONTEXTS = ['render', 'config', 'editor', 'telemetry'] as const;
export type ErrorContext = (typeof ERROR_CONTEXTS)[number];

/** Le contexte de l'extension est-il INVALIDÉ — l'extension rechargée ou mise à jour sous un
 * onglet resté ouvert ?
 *
 * Mesuré : `chrome.runtime.id` passe de défini à `undefined`, alors que `chrome.runtime` reste un
 * objet. Les erreurs qui en découlent sont de DEUX formes, `Extension context invalidated.` pour
 * `runtime.sendMessage` et `getURL`, mais `Cannot read properties of undefined (reading 'local')`
 * pour tout accès à `chrome.storage`, devenu `undefined` : un filtre sur le premier message
 * aurait laissé passer le second, qui est le plus fréquent. D'où l'état du contexte plutôt que
 * le texte de l'erreur.
 *
 * Hors extension (aucun `chrome.runtime`, comme dans les tests), le contexte n'est pas
 * invalidé : il n'a jamais existé, et ce qui lève doit se relever. */
export function extensionContextInvalidated(): boolean {
  const runtime = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime;
  return runtime !== undefined && !runtime.id;
}

function describe(reason: unknown): CapturedError {
  if (reason instanceof Error || (typeof reason === 'object' && reason !== null && 'message' in reason)) {
    const error = reason as { name?: string; message?: unknown; stack?: unknown };
    const head = `${error.name ?? 'Error'}: ${String(error.message)}`;
    return {
      message: head.slice(0, MESSAGE_LIMIT),
      stack: typeof error.stack === 'string' ? error.stack.slice(0, STACK_LIMIT) : undefined,
    };
  }
  return { message: String(reason).slice(0, MESSAGE_LIMIT) };
}

/** Le relevé actif, s'il y en a un : `guarded` y rapporte, et rien d'autre ne le fait. Un seul par
 * script de contenu — `captureErrors` s'y inscrit, `stop()` l'en retire. */
let active: ((reason: unknown, context?: ErrorContext) => void) | null = null;

/** Les exceptions déjà relevées PAR UN POINT D'ENTRÉE : le gestionnaire global les revoit — un
 * enrobage relance l'erreur, pour que la console et le comportement restent ce qu'ils étaient — et
 * ne doit pas les compter une seconde fois, sans contexte. */
const reported = new WeakSet<object>();

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/** Enrobe un POINT D'ENTRÉE — un écouteur, un minuteur, une chaîne de promesses — pour que ce
 * qu'il lève soit relevé AVEC ce qu'il faisait.
 *
 * Le gestionnaire global ne voit que l'exception, après coup : un message et une pile minifiée,
 * jamais ce que le code était en train d'accomplir. Ce contexte n'existe qu'au point d'appel,
 * d'où cet enrobage. Il relance toujours : rien ne change pour la console de la page ni pour le
 * comportement — une exception qui interrompait un écouteur l'interrompt encore.
 *
 * Fonction synchrone ou qui rend une promesse : une promesse rejetée est relevée puis rejetée à
 * nouveau. Sans relevé actif (hors extension, après `stop()`), c'est la fonction elle-même. */
export function guarded<A extends unknown[], R>(
  context: ErrorContext,
  fn: (...args: A) => R
): (...args: A) => R {
  const report = (error: unknown): void => {
    if (isObject(error)) {
      if (reported.has(error)) return; // déjà relevée, par un enrobage plus proche
      reported.add(error);
    }
    active?.(error, context);
  };
  return function (this: unknown, ...args: A): R {
    try {
      const result = fn.apply(this, args);
      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          report(error);
          throw error;
        }) as R;
      }
      return result;
    } catch (error) {
      report(error);
      throw error;
    }
  };
}

/** `target.addEventListener(type, guarded(context, listener))`, et rend l'écouteur enrobé, pour
 * qui doit le retirer. L'appel garde la forme d'`addEventListener` après les trois premiers
 * arguments : un écouteur inline, qui s'étend sur plusieurs lignes, n'a que son ouverture à
 * changer — sa fermeture reste la même. */
export function listen<E extends Event>(
  context: ErrorContext,
  target: EventTarget,
  type: string,
  listener: (event: E) => void,
  options?: boolean | AddEventListenerOptions
): (event: E) => void {
  const wrapped = guarded(context, listener);
  target.addEventListener(type, wrapped as EventListener, options);
  return wrapped;
}

export interface ErrorCapture {
  /** Retire les gestionnaires. */
  stop: () => void;
  /** Oublie ce qui a déjà été relevé, pour que la page SUIVANTE puisse l'être à son tour —
   * même geste et même raison que `SelectorLog.forgetSeen`. */
  forgetSeen: () => void;
}

export function captureErrors(win: Window, record: (error: CapturedError) => void): ErrorCapture {
  const seen = new Set<string>();

  const handle = (reason: unknown, context?: ErrorContext): void => {
    if (extensionContextInvalidated()) return; // une extension rechargée : pas un défaut de code
    const error = { ...describe(reason), ...(context ? { context } : {}) };
    // Contexte ET message : le même message levé pendant deux choses est deux lignes.
    const key = `${context ?? ''}:${error.message}`;
    if (seen.has(key) || seen.size >= DISTINCT_LIMIT) return;
    seen.add(key);
    try {
      record(error);
    } catch {
      // Le relevé ne doit jamais devenir l'exception qu'il relève.
    }
  };

  // Le filet : ce qui a échappé à tout point d'entrée enrobé, donc sans contexte. Une exception
  // que `guarded` a déjà relevée y repasse (il la relance) et n'est pas comptée deux fois.
  const fromGlobal = (reason: unknown): void => {
    if (isObject(reason) && reported.has(reason)) return;
    handle(reason);
  };
  const onError = (event: ErrorEvent): void => fromGlobal(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent): void => fromGlobal(event.reason);
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  const mine = (reason: unknown, context?: ErrorContext): void => handle(reason, context);
  active = mine;

  return {
    stop: () => {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
      if (active === mine) active = null;
    },
    forgetSeen: () => seen.clear(),
  };
}
