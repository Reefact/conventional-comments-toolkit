// Télémétrie (§10, §9.4, CA-11) — désactivée par défaut, opt-in explicite, et limitée à
// des COMPTEURS AGRÉGÉS : « label utilisé, code d'erreur, mode, dépôt — jamais de texte
// libre » (§10). Tout ce module existe pour rendre cette phrase mécanique plutôt que
// déclarative : rien ne sort d'ici qui ne soit un identifiant d'un vocabulaire fermé.
//
// D'OÙ VIENT LE POINT DE COLLECTE — c'est la décision qui structure tout le reste.
//
// `telemetry.*` est une clé de configuration ORDINAIRE (§8.2) : le fichier
// `.conventional-comments.json` d'un dépôt peut l'écrire. Une première conception lisait
// donc le point de collecte dans la configuration effective, et trois rounds de revue ont
// montré que cette voie ne se rattrape pas (PR #31) : un dépôt pouvait désigner son propre
// collecteur, la page d'options certifiait à l'utilisateur qu'il venait « de son
// organisation », et le point de collecte changeait sous les onglets au gré des dépôts
// visités — chaque correctif rétrécissait une fenêtre et en ouvrait une autre.
//
// L'activation de la télémétrie ne vient donc PLUS de la configuration résolue, mais du
// SEUL canal de politique d'entreprise (`chrome.storage.managed`). C'est exactement le
// raisonnement que le §8.1.1 tient déjà pour `configUrl` — « un `configUrl` posé dans le
// fichier de dépôt est ignoré », sans quoi « un dépôt détournerait le niveau 2 vers un
// document qu'il contrôle » — appliqué au collecteur : un dépôt ne doit pas pouvoir choisir
// où partent des données, ni les faire partir.
//
// TROIS conditions, donc, pour qu'un octet parte :
//
// 1. la politique d'entreprise déclare `telemetry.enabled` ;
// 2. elle déclare un `telemetry.endpoint` en `https:` ;
// 3. la personne a coché la case dans la page d'options, devant cette adresse.
//
// La troisième n'est pas dans la spécification, mais le §10 l'appelle : « opt-in
// explicite » est celui d'une personne, pas d'une administration. Les deux premières sont
// désormais hors de portée de tout dépôt.
//
// La clé `telemetry.*` du §8.2 reste lue et validée par `core/` — le composant serveur s'en
// sert, et le schéma ne change pas. C'est l'EXTENSION qui ne l'écoute plus.

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

/** Clé `chrome.storage.local` du consentement (§8.1.2 — décision de la personne).
 *
 * **`local` et non `sync`**, et **un point de collecte et non un booléen** : deux
 * corrections d'une même erreur de modélisation (revue Codex, PR #31).
 *
 * `sync` propagerait le consentement aux autres appareils du compte Chrome, où personne n'a
 * rien coché — et `PRIVACY.md` affirmait par ailleurs que la synchronisation se limite à la
 * langue et aux raccourcis. Un consentement se donne sur l'appareil où on le donne.
 *
 * Un booléen, lui, ne dit pas À QUOI l'on a consenti. Il suffisait alors de visiter un dépôt
 * dont la configuration désigne un AUTRE point de collecte pour que les compteurs y partent,
 * sans que cette destination ait jamais été montrée. Le consentement porte donc l'URL qui
 * était affichée au moment où la case a été cochée, et ne vaut que pour elle. */
export const TELEMETRY_CONSENT_KEY = 'telemetryConsent';

/** Forme CANONIQUE d'un point de collecte, ou `null` s'il n'est pas exploitable.
 *
 * UNE seule représentation, employée partout — publication, affichage, stockage du
 * consentement, comparaison. Sans elle, la fonctionnalité était inerte en silence pour la
 * forme d'URL la plus courante : la page d'options affichait et stockait
 * `https://collecte.example` tel quel, `telemetryTarget()` comparait à
 * `new URL(...).href`, soit `https://collecte.example/`, et le consentement ne coïncidait
 * JAMAIS. L'organisation aurait cru la télémétrie active sans rien recevoir, sans erreur
 * nulle part (revue Codex, PR #31). Port par défaut, casse du nom d'hôte et normalisation
 * du chemin produisaient la même divergence.
 *
 * `https:` exigé ici : une page de plateforme est servie en HTTPS et le navigateur bloque le
 * contenu mixte — un point de collecte en clair ne recevrait jamais rien. */
export function canonicalEndpoint(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Ce qui est stocké sous cette clé. `endpoint` est l'URL canonique qui a été présentée. */
export interface TelemetryConsent {
  endpoint: string;
}

/** Forme sûre de la valeur stockée — elle vient du stockage, donc de l'extérieur. */
export function parseConsent(raw: unknown): TelemetryConsent | null {
  const value = raw as Partial<TelemetryConsent> | undefined;
  // Canonicalisé À LA RELECTURE aussi : un consentement écrit par une version antérieure,
  // ou à la main, ne doit pas devenir inutilisable pour une barre oblique.
  const endpoint = canonicalEndpoint(value?.endpoint ?? null);
  return endpoint === null ? null : { endpoint };
}

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

/** Ce que la politique d'entreprise déclare : `null` quand elle ne déclare rien, ce qui est
 * le cas par défaut et signifie qu'aucune télémétrie n'est possible.
 *
 * Lu à l'identique par le script de contenu et par la page d'options — la seconde AFFICHE
 * ce que le premier ÉMET, et deux lectures différentes de la même politique laisseraient la
 * case consentir à autre chose que ce qu'elle montre. C'est ce qui arrivait quand le point
 * de collecte transitait par une clé partagée réécrite par chaque onglet (revue Codex,
 * PR #31). */
export function managedEndpoint(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const { enabled, endpoint } = raw as { enabled?: unknown; endpoint?: unknown };
  if (enabled !== true) return null;
  return canonicalEndpoint(typeof endpoint === 'string' ? endpoint : null);
}

/** Le point de collecte, ou `null` — c'est-à-dire : rien ne part. Les trois conditions de
 * l'en-tête sont ici, en un seul endroit, pour qu'aucun appelant ne puisse en oublier une.
 *
 * `endpoint` vient de `managedEndpoint()`, donc de la politique d'entreprise et d'elle
 * seule. `config` n'apporte plus que le MODE : une extension inactive (§7) ne compte rien,
 * et ce mode-là, un dépôt a parfaitement le droit de le fixer. */
export function telemetryTarget(
  config: { mode: string },
  endpoint: string | null,
  consent: TelemetryConsent | null,
  repo: string
): TelemetryTarget | null {
  // `off` : l'extension est inactive (§7). Rien de ce qu'elle observerait alors n'a de sens
  // à compter, et une première version armait quand même l'onglet parce que la sortie
  // anticipée du mode `off` passait AVANT l'armement (revue Codex, PR #31). La règle vit
  // ici, où aucun ordre d'appel ne peut la contourner.
  if (config.mode === 'off') return null;
  if (endpoint === null || !consent) return null;
  // Le consentement vaut pour CETTE destination, pas pour l'idée de télémétrie. Depuis que
  // le point de collecte vient de la politique, il ne peut plus changer sous les pieds de
  // la personne au gré des dépôts visités ; cette comparaison reste néanmoins la garantie
  // que l'accord porte sur ce qui a été affiché, y compris après un changement de politique.
  if (consent.endpoint !== endpoint) return null;
  return { endpoint, mode: config.mode, repo };
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

  /** Rend `true` si l'événement a RÉELLEMENT été compté — désarmé, ou hors vocabulaire, il
   * rend `false`. L'appelant en a besoin : le contrôleur d'éditeur retenait un code comme
   * « déjà compté » alors que l'émetteur venait de le jeter faute d'être armé, si bien
   * qu'une erreur présente à cet instant n'était plus jamais émise de toute la vie de
   * l'éditeur — elle ne comptait que si elle disparaissait puis revenait (revue Codex,
   * PR #31). */
  count(event: TelemetryEvent): boolean {
    if (!this.#target) return false;
    const key = counterKey(event);
    if (!key) return false;
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
    return true;
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
    // Une requête emporte plus que son corps. Sans cette ligne, le `Referer` par défaut
    // porte l'URL COMPLÈTE de la page de revue — identifiant de PR compris — au point de
    // collecte, et la phrase de `PRIVACY.md` (« seuls les compteurs listés quittent le
    // navigateur ») était fausse. Elle avait été écrite de mémoire, jamais mesurée ; elle
    // l'est désormais par `npm run check:beacon`, qui lit les en-têtes reçus.
    referrerPolicy: 'no-referrer',
    // Un type de contenu « simple » : c'est ce qui garde la requête hors de la préflight
    // CORS, laquelle échouerait faute de réponse autorisante.
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
  }).catch(() => undefined);
}
