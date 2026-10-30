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
}

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

export interface ErrorCapture {
  /** Retire les gestionnaires. */
  stop: () => void;
  /** Oublie ce qui a déjà été relevé, pour que la page SUIVANTE puisse l'être à son tour —
   * même geste et même raison que `SelectorLog.forgetSeen`. */
  forgetSeen: () => void;
}

export function captureErrors(win: Window, record: (error: CapturedError) => void): ErrorCapture {
  const seen = new Set<string>();

  const handle = (reason: unknown): void => {
    if (extensionContextInvalidated()) return; // une extension rechargée : pas un défaut de code
    const error = describe(reason);
    if (seen.has(error.message) || seen.size >= DISTINCT_LIMIT) return;
    seen.add(error.message);
    try {
      record(error);
    } catch {
      // Le relevé ne doit jamais devenir l'exception qu'il relève.
    }
  };

  const onError = (event: ErrorEvent): void => handle(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent): void => handle(event.reason);
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);

  return {
    stop: () => {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
    },
    forgetSeen: () => seen.clear(),
  };
}
