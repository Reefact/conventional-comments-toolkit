// Le journal d'inscription du script de contenu (#118) : ce que le service worker ÉCRIT à
// chaque passe d'inscription (`background.ts`, `applyRegistration`), et ce que la page
// d'options LIT pour l'archive de diagnostic. Un module à part parce que la page d'options ne
// doit pas importer le service worker : son chargement brancherait les écouteurs du worker
// dans la page.

/** Ce qui a déclenché une publication — la seule information que le journal d'inscription ne
 * peut pas relire après coup. Un vocabulaire fermé : c'est une donnée de diagnostic, pas un
 * texte. */
export type RegistrationCause =
  | 'worker-start'
  | 'permission-added'
  | 'permission-removed'
  | 'host-tags-changed'
  | 'managed-changed';

/** L'état de NOTRE inscription tel que Chrome le rend, à un instant. `persist` : ce que
 * `getRegisteredContentScripts()` rapporte de `persistAcrossSessions`, `null` si Chrome ne le
 * dit pas. */
export interface RegistrationState {
  present: boolean;
  persist: boolean | null;
}

/** Une passe d'`applyRegistration()`, telle qu'elle s'est déroulée (#118).
 *
 * Ce journal existe parce que le défaut qu'il doit attraper ne s'observe pas de l'extérieur :
 * des chargements de github.com n'ont reçu aucun script de contenu, et TOUTE lecture de
 * l'inscription — console du service worker, page d'options — démarre le worker, dont le
 * démarrage la repose (`syncContentScriptsWithGrantedPermissions()`, `background.ts`). L'état fautif
 * s'efface donc au moment où on le regarde. Écrit par le worker au fil de l'eau, ce journal
 * le rapporte après coup, dans l'archive de diagnostic.
 *
 * Il RAPPORTE, il n'interprète pas : ce que la passe a lu, ce qu'elle a appelé, ce que Chrome a
 * répondu (`chrome.runtime.lastError`, lu à chaque rappel — il ne l'était nulle part), et ce
 * qu'elle a relu ensuite. Aucune explication n'y est déduite : `cause` nomme l'événement qui a
 * déclenché la passe, jamais la raison d'un défaut. */
export interface RegistrationEvent {
  at: string;
  cause: RegistrationCause;
  /** Les motifs que la passe a calculés — vide : rien à servir, donc désinscription. */
  matches: string[];
  before: RegistrationState;
  calls: { op: 'register' | 'update' | 'unregister'; ids: string[]; error: string | null }[];
  after: RegistrationState;
  /** Onglets ouverts dans lesquels la passe a injecté le script. */
  injectedTabs: number;
}

export const REGISTRATION_LOG_KEY = 'registrationLog';
/** Borné : une entrée par passe, et une passe par démarrage du worker ou changement d'hôte —
 * quarante couvrent des jours d'usage sans peser (quelques centaines d'octets chacune). */
export const MAX_REGISTRATION_EVENTS = 40;
