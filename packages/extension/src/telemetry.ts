// Télémétrie (§10, §9.4, CA-11) — désactivée par défaut, opt-in explicite, et limitée à
// des COMPTEURS AGRÉGÉS : « label utilisé, code d'erreur, mode, dépôt — jamais de texte
// libre » (§10). Tout ce module existe pour rendre cette phrase mécanique plutôt que
// déclarative : rien ne sort d'ici qui ne soit un identifiant d'un vocabulaire fermé.
//
// TROIS conditions doivent être réunies pour qu'un octet parte, et la troisième n'est pas
// dans la spécification — elle en découle :
//
// 1. `telemetry.enabled` vaut `true` dans la configuration effective ;
// 2. `telemetry.endpoint` est une URL `https:` ;
// 3. la personne a coché la case dans la page d'options.
//
// La troisième existe parce que `telemetry.*` est une clé de configuration ORDINAIRE
// (§8.2) : le fichier `.conventional-comments.json` d'un dépôt peut donc l'écrire, et un
// dépôt hostile désignerait sinon lui-même le point de collecte — « opt-in explicite »
// (§10) deviendrait l'opt-in d'un dépôt, pas celui de la personne. La page d'options
// affiche le point de collecte effectif à côté de la case, pour que ce consentement porte
// sur quelque chose de visible.

/** Ce qu'un composant peut compter. Aucune de ces valeurs n'est du texte saisi : un
 * identifiant de label vient de la configuration, un code de diagnostic de `core/`, un nom
 * de chaîne de sélecteurs de nos propres fichiers de sélecteurs. */
export type TelemetryEvent =
  | { kind: 'label-used'; label: string }
  | { kind: 'validation-code'; code: string }
  | { kind: 'selector-degradation'; chain: string };

export interface TelemetryTarget {
  endpoint: string;
  /** Mode effectif (§7) — dimension autorisée par le §10. */
  mode: string;
  /** Dépôt affiché, `hôte/portée` — dimension autorisée par le §10. */
  repo: string;
}

/** Clé `chrome.storage.sync` de l'opt-in local (§8.1.2 — préférence de la personne). */
export const TELEMETRY_OPT_IN_KEY = 'telemetryOptIn';

/** Vocabulaire fermé, appliqué à la CLÉ COMPLÈTE du compteur. Un identifiant de label ou
 * un code hors de cette forme n'est pas assaini pour être envoyé quand même : il est
 * ABANDONNÉ. Assainir laisserait passer un fragment de ce qu'on voulait ne jamais envoyer
 * ; abandonner ne perd qu'un compteur. */
const COUNTER_KEY = /^[a-z-]+:[A-Za-z0-9_.-]{1,64}$/;

function counterKey(event: TelemetryEvent): string | null {
  const key =
    event.kind === 'label-used'
      ? `label:${event.label}`
      : event.kind === 'validation-code'
        ? `code:${event.code}`
        : `selector:${event.chain}`;
  return COUNTER_KEY.test(key) ? key : null;
}

/** Le point de collecte, ou `null` — c'est-à-dire : rien ne part. Les trois conditions de
 * l'en-tête sont ici, en un seul endroit, pour qu'aucun appelant ne puisse en oublier une.
 *
 * `https:` exigé : une page de plateforme est servie en HTTPS, et un navigateur bloque le
 * contenu mixte. Un point de collecte en clair ne recevrait donc jamais rien — mieux vaut
 * ne pas prétendre le contraire. */
export function telemetryTarget(
  config: { mode: string; telemetry: { enabled: boolean; endpoint: string | null } },
  optIn: boolean,
  repo: string
): TelemetryTarget | null {
  if (!optIn || !config.telemetry.enabled || !config.telemetry.endpoint) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(config.telemetry.endpoint);
  } catch {
    return null;
  }
  if (endpoint.protocol !== 'https:') return null;
  return { endpoint: endpoint.href, mode: config.mode, repo };
}

/** L'émetteur. Compte en mémoire, n'émet qu'à la vidange — c'est ce que « compteurs
 * agrégés » veut dire : le point de collecte reçoit « `issue` employé 4 fois sur ce dépôt »
 * et jamais la trace d'une frappe.
 *
 * Il naît DÉSARMÉ, et le reste tant que la configuration n'est pas résolue. Un événement
 * compté avant l'armement est perdu, jamais mis de côté : ce sont des instants où l'on ne
 * sait pas encore si l'on a le droit d'émettre, et un tampon qui les garderait finirait par
 * les envoyer. Perdre quelques compteurs au démarrage d'un onglet n'a aucune conséquence ;
 * envoyer sans droit en a une. */
export class TelemetryCounters {
  #target: TelemetryTarget | null = null;
  #counts = new Map<string, number>();
  #send: (endpoint: string, body: string) => void;

  constructor(send: (endpoint: string, body: string) => void = beacon) {
    this.#send = send;
  }

  /** (Ré)arme. Un onglet reste ouvert pendant qu'on navigue d'une PR à l'autre : la cible
   * change alors sous les compteurs déjà tenus, et les laisser en place ATTRIBUERAIT au
   * nouveau dépôt ce qui a été compté sur l'ancien. Ils sont donc vidés d'abord — émis vers
   * la cible qui les a vus, ce qui est la seule lecture juste, et la seule qui ne fabrique
   * pas une donnée fausse chez le destinataire.
   *
   * Le désarmement, lui, JETTE : on vient d'apprendre qu'on n'a pas (ou plus) le droit
   * d'émettre, et rien de ce qui a été compté ne doit sortir après ça. */
  arm(target: TelemetryTarget | null): void {
    if (!target) {
      this.#target = null;
      this.#counts.clear();
      return;
    }
    if (this.#target && !sameTarget(this.#target, target)) this.flush();
    this.#target = target;
  }

  get armed(): boolean {
    return this.#target !== null;
  }

  count(event: TelemetryEvent): void {
    if (!this.#target) return;
    const key = counterKey(event);
    if (!key) return;
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
  }

  /** Émet et remet les compteurs à zéro. Sans compteur, rien ne part — pas même un corps
   * vide : une requête périodique vers un point de collecte est en soi une donnée (elle dit
   * qu'un onglet est ouvert sur ce dépôt), et elle n'est autorisée par aucune ligne du §10. */
  flush(): void {
    const target = this.#target;
    if (!target || this.#counts.size === 0) return;
    const counters: Record<string, number> = {};
    for (const [key, value] of this.#counts) counters[key] = value;
    this.#counts.clear();
    try {
      this.#send(
        target.endpoint,
        JSON.stringify({ v: 1, mode: target.mode, repo: target.repo, counters })
      );
    } catch {
      // La télémétrie ne doit jamais déranger : un point de collecte injoignable, une URL
      // devenue invalide, un contexte d'extension invalidé — tout cela se perd en silence.
    }
  }
}

function sameTarget(a: TelemetryTarget, b: TelemetryTarget): boolean {
  return a.endpoint === b.endpoint && a.mode === b.mode && a.repo === b.repo;
}

/** Transport par défaut : un POST `no-cors`, dont on ne lit pas la réponse.
 *
 * MESURÉ dans un vrai Chromium (`npm run check:beacon`), et non supposé : une page peut
 * émettre un POST `no-cors` vers une autre origine sans en-tête particulier, le serveur le
 * reçoit avec son corps, et la réponse rendue est opaque. C'est ce qui permet à la
 * télémétrie de n'exiger AUCUNE permission d'hôte — contrairement à la lecture du
 * `configUrl` (PR #30), qui, elle, a besoin de la réponse et doit donc passer par le
 * service worker.
 *
 * `keepalive` pour que la dernière vidange survive à la fermeture de l'onglet ;
 * `credentials: 'omit'` pour n'attacher aucun cookie du point de collecte — un compteur
 * agrégé n'a pas à être authentifié, et le §10 ne le demande nulle part. */
function beacon(endpoint: string, body: string): void {
  void fetch(endpoint, {
    method: 'POST',
    mode: 'no-cors',
    keepalive: true,
    credentials: 'omit',
    // Un type de contenu « simple » : c'est ce qui garde la requête hors de la préflight
    // CORS, laquelle échouerait faute de réponse autorisante.
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
  }).catch(() => undefined);
}
