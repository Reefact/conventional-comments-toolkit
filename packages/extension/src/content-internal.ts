// Logique du script de contenu (composant A) : choisit l'adaptateur par domaine, résout
// la configuration (hors chemin critique — l'assistance démarre avec le cache), attache
// un contrôleur par éditeur, rend bandeau et grisage du bouton de complétion (§6.5).
//
// Séparé de content.ts (le point d'entrée bundlé) parce que les content_scripts déclarés
// dans le manifest sont injectés par Chrome/Firefox comme des scripts CLASSIQUES, pas des
// modules ES (contrairement au service worker, qui supporte "type": "module") : un
// `export` en tête de bundle y casse le chargement avec « Unexpected token 'export' ».
// Ce module peut exporter librement pour les tests ; content.ts, lui, ne doit rien
// exporter.

import type { ConfigRead, EffectiveConfig, Floor, PrRef, PublishedSummary } from '@cct/core';
import { SelectorLog, type PlatformAdapter, type SubmitControl } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { analyze, enabledLabels } from '@cct/core';
import { ClientConfigResolver, resolveUiLanguage, type ResolvedClientConfig } from './config-resolver.js';
import {
  EMPTY_EXTRA_HOSTS,
  EXTRA_HOSTS_KEY,
  selectPlatform,
  type ExtraHostsByPlatform,
} from './host-platform.js';
import { DEFAULT_DIRECT_SHORTCUTS, EditorController } from './editor-controller.js';
import {
  TELEMETRY_CONSENT_KEY,
  TelemetryCounters,
  managedEndpoint,
  parseConsent,
  telemetryTarget,
  type TelemetryConsent,
  type TelemetryEvent,
} from './telemetry.js';
import { appendToJournal, writeCurrentState } from './storage.js';
import { bannerBlocksMerge, bannerHasContent, buildBannerModel, renderBanner } from './ui/banner.js';
import { applyLabelFilter, clearLabelFilter, renderThreadFilter } from './ui/thread-filter.js';
import { clearCommentDecorations, decorateComment } from './ui/badges.js';
import { ui } from './ui/strings.js';

declare const chrome: {
  storage?: {
    managed?: { get: (cb: (items: Record<string, unknown>) => void) => void };
    sync?: { get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void };
    local?: {
      get?: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
      set?: (items: Record<string, unknown>) => void;
    };
    onChanged?: {
      addListener: (
        cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
      ) => void;
      removeListener?: (
        cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
      ) => void;
    };
  };
  runtime?: {
    // Rappel ET promesse : les deux formes répondent dans le Chromium sur lequel tourne
    // `npm run smoke:mv3`, qui interroge le relais sous chacune et journalise ce qu'elle a
    // rendu. La doc de Chrome décrit la forme promesse sans se prononcer sur le devenir du
    // rappel — d'où la mesure plutôt que le pari, ici comme dans `relayOrgConfigRead()`.
    sendMessage?: (msg: unknown, cb?: (response: unknown) => void) => unknown;
    lastError?: { message?: string } | null;
  };
} | undefined;

/** Forme sûre d'une réponse du relais : elle vient d'un autre contexte d'exécution, donc
 * de l'extérieur de ce module. Tout ce qui n'est pas un `ConfigRead` reconnaissable vaut
 * `unreachable` — jamais `absent`, qui affirmerait qu'aucun document n'existe alors qu'on
 * n'en sait rien, et ferait taire l'état dégradé du §5.4. */
function asConfigRead(value: unknown, fallbackReason: string): ConfigRead {
  const read = value as ConfigRead | undefined;
  if (read?.status === 'absent') return { status: 'absent' };
  if (read?.status === 'found' && typeof read.text === 'string') return read;
  if (read?.status === 'unreachable') return { status: 'unreachable', reason: String(read.reason) };
  return { status: 'unreachable', reason: fallbackReason };
}

/** Y a-t-il un service worker à qui parler ?
 *
 * `chrome` est ici un `declare const`, pas une propriété : hors contexte d'extension, la
 * seule mention de l'identifiant lève une `ReferenceError` — l'optionnel `?.` ne protège
 * que d'un `undefined`, pas d'une liaison absente. C'est le même piège que les autres
 * lectures de ce module contournent par un `try`. */
function hasExtensionRelay(): boolean {
  try {
    return typeof chrome?.runtime?.sendMessage === 'function';
  } catch {
    return false;
  }
}

/** Le relais, restreint aux origines que le script de contenu ne peut PAS lire lui-même.
 *
 * Rend une fonction qui décline (`null`) pour une URL de même origine que la page. Le motif
 * du correctif — le script de contenu n'a aucun privilège d'origine croisée — ne dit rien
 * d'une lecture de MÊME origine, qui, elle, fonctionne parfaitement depuis la page. La lui
 * retirer était une régression : le worker, lui, n'a aucune permission d'hôte sur le domaine
 * de plateforme (le manifeste n'en déclare plus depuis la PR #28), si bien qu'un `configUrl`
 * posé sur `https://github.com/...` devenait illisible alors qu'il se lisait avant — la
 * configuration d'organisation tombait en état dégradé (revue Codex, PR #30). C'est
 * exactement l'argument qui garde `getRepoConfig()` en lecture directe, appliqué à l'autre
 * document.
 *
 * Une URL illisible n'est pas déclarée de même origine : elle part au relais, qui la
 * confrontera au plancher et la refusera. Mieux vaut un refus explicite qu'un privilège
 * accordé par erreur de parsage. */
export function relayableFrom(page: URL): (url: string) => Promise<ConfigRead> | null {
  return (url) => {
    let target: URL | null = null;
    try {
      target = new URL(url);
    } catch {
      target = null;
    }
    // `origin` et non `hostname` : un port ou un schéma différents font une origine
    // différente pour la politique du navigateur, donc une lecture que la page ne peut pas
    // faire — c'est le critère qui décide, pas la ressemblance des noms d'hôte.
    return target?.origin === page.origin ? null : relayOrgConfigRead(url);
  };
}

/** Lecture du `configUrl` d'organisation PAR LE SERVICE WORKER (§8.1.1).
 *
 * Un script de contenu « initiate requests on behalf of the web origin that the content
 * script has been injected into and therefore [is] also subject to the same origin policy »
 * (doc Chrome, « Cross-origin network requests ») : la permission d'hôte accordée pour
 * l'hôte du `configUrl` ne lui sert à RIEN, et un document d'organisation hébergé hors de
 * la plateforme affichée restait illisible — état dégradé permanent, empreintes de
 * configuration durablement divergentes entre A et B (§8.1.3, règle 2). Le worker, lui,
 * émet depuis l'origine de l'extension, où cette permission porte.
 *
 * Seul le document d'ORGANISATION passe par ici. Le fichier de dépôt vit sur l'origine de
 * la page affichée : le lire directement est correct, et le relayer exigerait au contraire
 * une permission d'hôte sur github.com que le manifeste ne déclare plus (PR #28). */
export function relayOrgConfigRead(url: string): Promise<ConfigRead> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: unknown, reason: string): void => {
      if (settled) return;
      settled = true;
      resolve(asConfigRead(value, reason));
    };
    try {
      const runtime = chrome?.runtime;
      if (!runtime?.sendMessage) return settle(undefined, 'no extension relay');
      const returned = runtime.sendMessage({ kind: 'cct-fetch-config', url }, (response) => {
        // Lire `lastError` est ce qui l'ACQUITTE : sans cette lecture, un worker endormi
        // ou une réponse perdue laisse un « Unchecked runtime.lastError » en console. Sa
        // valeur ne change rien ici — pas de réponse exploitable vaut `unreachable`.
        void runtime.lastError;
        settle(response, 'no response from relay');
      });
      // Forme promesse (aucun rappel appelé) : le premier des deux qui arrive tranche.
      const thenable = returned as Promise<unknown> | undefined;
      if (typeof thenable?.then === 'function') {
        thenable.then(
          (response) => settle(response, 'no response from relay'),
          (e) => settle(undefined, String(e))
        );
      }
    } catch (e) {
      settle(undefined, String(e));
    }
  });
}

/** §9.2.3 — l'état dégradé se signale « dans les options ET dans son indicateur » : la
 * page d'options lit `degradedState` dans chrome.storage.local ; c'est ici qu'il s'écrit,
 * à chaque résolution de configuration.
 *
 * La clé porte le MOTIF quand il est connu (`repo: HTTP 429`), et non plus le seul mot
 * `unreachable`. La page d'options affiche déjà cette valeur telle quelle : c'est la
 * différence entre « l'extension n'a pas pu lire » et « voici quoi corriger ». `unreachable`
 * reste le repli, pour qu'une dégradation sans motif se signale quand même. */
export function writeDegradedState(degraded: boolean, reason: string | null = null): void {
  writeCurrentState({ degradedState: degraded ? (reason?.trim() || 'unreachable') : false });
}

/** Plancher côté A : politique d'entreprise poussée par le navigateur —
 * chrome.storage.managed, nœud 3rdparty (§8.1.1). Canal muet → plancher par défaut. */
async function readManagedFloor(): Promise<Floor | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.managed) return resolve(null);
      chrome.storage.managed.get((items) => {
        const floor = items?.['floor'];
        resolve(floor && typeof floor === 'object' ? (floor as Floor) : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** Forme sûre de la valeur publiée : elle vient du stockage, donc de l'extérieur de ce
 * module — une entrée absente ou malformée vaut liste vide, jamais une exception. */
function normalizeExtraHosts(stored: unknown): ExtraHostsByPlatform {
  const value = stored as Partial<ExtraHostsByPlatform> | undefined;
  return {
    github: Array.isArray(value?.github) ? value.github : [],
    azdo: Array.isArray(value?.azdo) ? value.azdo : [],
  };
}

/** Hôtes accordés via `optional_host_permissions` (§2, §A.4, §B.4), déjà répartis par
 * plateforme — LU, jamais calculé ici.
 *
 * Ce module est bundlé dans `content.js` et s'exécute comme script de contenu, où Chrome
 * n'expose PAS `chrome.permissions` : y croiser les origines accordées avec leurs
 * étiquettes rendrait toujours des listes vides, sans erreur visible (revue Codex, PR
 * #29). Le calcul vit donc dans `background.ts`, qui publie son résultat sous
 * `EXTRA_HOSTS_KEY` dans `chrome.storage.local` — accessible, lui, depuis un script de
 * contenu — et le republie à chaque changement de permission ou d'étiquette. */
export async function readExtraHostsByPlatform(): Promise<ExtraHostsByPlatform> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.local?.get) return resolve(EMPTY_EXTRA_HOSTS);
      chrome.storage.local.get([EXTRA_HOSTS_KEY], (items) => {
        resolve(normalizeExtraHosts(items?.[EXTRA_HOSTS_KEY]));
      });
    } catch {
      resolve(EMPTY_EXTRA_HOSTS);
    }
  });
}

/** Consentement de télémétrie (§10) — décision LOCALE de la personne (§8.1.2), portant sur
 * un point de collecte PRÉCIS : c'est le troisième verrou décrit en tête de `telemetry.ts`,
 * celui qu'aucune configuration de dépôt ne peut ouvrir à sa place. */
async function readTelemetryConsent(): Promise<TelemetryConsent | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.local?.get) return resolve(null);
      chrome.storage.local.get([TELEMETRY_CONSENT_KEY], (items) =>
        resolve(parseConsent(items?.[TELEMETRY_CONSENT_KEY]))
      );
    } catch {
      resolve(null);
    }
  });
}

/** Journal LOCAL des dégradations de sélecteurs (§9.4, CA-11). « Toujours », dit le CA —
 * sans condition, là où la remontée télémétrique, elle, est conditionnée. La page d'options
 * lisait déjà `selectorFailures` ; rien ne l'écrivait, et le journal y était donc
 * perpétuellement vide. Borné aux 50 dernières : c'est un journal de diagnostic, pas une
 * archive, et `chrome.storage.local` est une ressource partagée. */
const SELECTOR_LOG_LIMIT = 50;

/** Le point de collecte déclaré par la politique d'entreprise (§10).
 *
 * Il ne transite plus par une clé partagée que chaque onglet réécrivait : la page d'options
 * lit la MÊME politique, au même endroit. Une valeur relayée d'onglet en onglet faisait que
 * la case pouvait consentir à autre chose que ce qu'elle affichait, et qu'un onglet dont la
 * télémétrie était désactivée effaçait l'adresse pour tous les autres (revue Codex, PR #31). */
async function readManagedEndpoint(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.managed) return resolve(null);
      chrome.storage.managed.get((items) => resolve(managedEndpoint(items?.['telemetry'])));
    } catch {
      resolve(null);
    }
  });
}

/** Le « dépôt » du §10, tel qu'il part dans les compteurs : hôte et portée, rien d'autre.
 * UNE définition, parce que l'armement et le réarmement doivent produire exactement la même
 * chaîne — sinon un simple changement de forme passerait pour un changement de dépôt. */
function prTelemetryKey(pr: PrRef): string {
  return `${pr.host}/${pr.scope.join('/')}`;
}

/** Période de vidange des compteurs (§10). Assez longue pour que ce qui part soit un
 * agrégat et non une trace d'activité minute par minute. */
export const TELEMETRY_FLUSH_MS = 5 * 60_000;

/** Ajoute UNE dégradation au journal partagé.
 *
 * La première version écrivait le journal en mémoire de CET onglet par-dessus la clé
 * entière : la première dégradation après un rechargement effaçait tout l'historique, et
 * deux onglets s'effaçaient l'un l'autre — le « 50 dernières » annoncé n'était que les 50
 * dernières du dernier onglet à avoir écrit (revue Codex, PR #31). D'où le passage par
 * `appendToJournal`, qui relit avant d'écrire, et l'ajout de la SEULE entrée nouvelle. */
function persistSelectorFailure(entry: { chain: string; at: string }): void {
  void appendToJournal('selectorFailures', [entry], SELECTOR_LOG_LIMIT, (e) => e.chain);
}

async function readUserLanguage(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.sync) return resolve(null);
      chrome.storage.sync.get(['language'], (items) => {
        resolve(typeof items?.['language'] === 'string' ? (items['language'] as string) : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** §5.2 — valide la préférence stockée des raccourcis directs et la fusionne avec la
 * table par défaut : une entrée « Alt+X » → label surcharge ou étend, une entrée à
 * valeur vide DÉSACTIVE le raccourci par défaut. Copie sans prototype (§5.2). */
export function mergeDirectShortcuts(stored: unknown): Record<string, string> {
  const merged: Record<string, string> = Object.assign(Object.create(null), DEFAULT_DIRECT_SHORTCUTS);
  if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      const m = /^alt\+([a-z])$/i.exec(key);
      if (!m || typeof value !== 'string') continue;
      const combo = `Alt+${m[1]!.toUpperCase()}`;
      if (value === '') delete merged[combo];
      else merged[combo] = value;
    }
  }
  return merged;
}

async function readDirectShortcuts(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.sync) return resolve(mergeDirectShortcuts(null));
      chrome.storage.sync.get(['directShortcuts'], (items) => {
        resolve(mergeDirectShortcuts(items?.['directShortcuts']));
      });
    } catch {
      resolve(mergeDirectShortcuts(null));
    }
  });
}

/** Renvoie de quoi révoquer les DEUX observations armées ici — celle des éditeurs (§5.1) et
 * celle du bandeau (§5.5). Sans emploi en production, où elles vivent le temps de l'onglet,
 * mais un appelant qui n'est pas un onglet doit pouvoir les rendre : deux observations sur
 * le même document se répondent l'une à l'autre, et deux `bootstrap()` successifs
 * empileraient un contrôleur par éditeur (revue Codex, PR #26). */
export async function bootstrap(doc: Document = document): Promise<() => void> {
  const url = new URL(doc.location.href);
  // Un seul produit, un adaptateur par plateforme, activé sur les hôtes autorisés (§2).
  // Sélection par HÔTE (matchesHost), pas par matches() — qui exige en plus une URL de
  // PR : bootstrap() ne s'exécute qu'une fois, à l'injection du script, alors que la
  // navigation SPA vers une PR arrive presque toujours ENSUITE (liste des PR,
  // notifications, tableau de bord). Exiger une PR ici laissait l'extension
  // intégralement inactive — aucun adaptateur choisi, donc aucun observateur armé — tant
  // qu'un rechargement complet ne la relançait pas directement sur l'URL de la PR.
  const extraHosts = await readExtraHostsByPlatform();
  // L'activation se décide sur la RÉPARTITION PUBLIÉE (`selectPlatform`), pas sur le
  // `matchesHost()` des adaptateurs : celui-ci dit « je sais parler à cet hôte », jamais
  // « j'ai le droit d'y être ». Les faire coïncider laissait `dev.azure.com` et
  // `*.visualstudio.com` — défauts en dur des adaptateurs, mais bel et bien soumis à une
  // permission optionnelle — actifs après révocation (revue Codex, PR #29).
  const platform = selectPlatform(url.hostname, extraHosts);

  // Un seul guet pour les TROIS transitions, parce que ce sont trois cas d'une même
  // question — « quelle plateforme sert cet hôte, maintenant ? » :
  //   • plus aucune  → révocation (l'onglet doit être rendu)
  //   • une, alors qu'il n'y en avait pas → activation tardive (répartition pas encore
  //     publiée à l'injection, ou hôte classé depuis les réglages, onglet déjà ouvert)
  //   • une AUTRE → reclassement : l'onglet tournait sur le mauvais adaptateur
  // Un booléen « un adaptateur matche » ne distinguait pas le troisième cas du statu quo.
  let live = true;
  let replacement: (() => void) | null = null;
  let teardown = () => {};
  let stopWatch = () => {};
  const restart = () => {
    stopWatch();
    teardown();
    void bootstrap(doc).then((dispose) => {
      replacement = dispose;
      if (!live) dispose(); // défait entre-temps : ne rien laisser derrière
    });
  };
  stopWatch = watchExtraHosts(url, (next) => {
    if (!live || selectPlatform(url.hostname, next) === platform) return;
    restart();
  });
  const disposeAll = () => {
    live = false;
    stopWatch();
    teardown();
    replacement?.();
  };

  if (!platform) return disposeAll;

  // Hors contexte d'extension (aucun `chrome.runtime`), il n'y a pas de relais à employer :
  // laisser l'adaptateur lire par lui-même, ce qui est le comportement correct partout où
  // l'origine appelante a le droit de lire. Ne jamais imposer un relais absent, qui rendrait
  // toute configuration d'organisation `unreachable`.
  //
  // Et même avec un relais, il ne sert QUE les origines tierces : voir `relayableFrom()`.
  const readOrgConfig = hasExtensionRelay() ? relayableFrom(url) : undefined;

  // Un émetteur par onglet, DÉSARMÉ : il ne comptera rien tant que la configuration
  // résolue n'aura pas dit qu'on en a le droit (§10, voir telemetry.ts). Il est construit
  // ici, avant l'adaptateur, parce que `SelectorLog` reçoit son rappel à la construction.
  const telemetry = new TelemetryCounters();

  /** Les dégradations de sélecteurs détectées AVANT que l'armement soit conclu.
   *
   * `armFor()` est lancé sans être attendu — il ne peut pas l'être : la navigation, elle,
   * est synchrone. Il se suspend aussitôt sur la résolution de configuration et sur les
   * lectures de stockage, pendant que le rendu continue et SONDE les sélecteurs. La
   * dégradation la plus attendue de toutes — un bouton d'envoi introuvable au chargement
   * d'une PR — tombait donc systématiquement dans cet intervalle, était refusée par un
   * émetteur encore désarmé, et n'était jamais rejouée : un diagnostic ne se répète pas
   * (revue Codex, PR #31).
   *
   * Le tampon ne relâche pas la règle de l'émetteur (« compté sans être armé est perdu ») :
   * il ne vit que dans cet intervalle-là, il est JETÉ dès qu'on apprend qu'on n'a pas le
   * droit d'émettre — armement rendant `null`, changement de PR, retrait de consentement —
   * et il est borné, une PR pathologique ne devant pas faire enfler la mémoire d'un onglet. */
  const PENDING_DEGRADATIONS_LIMIT = 20;
  let pendingDegradations: TelemetryEvent[] = [];
  const dropPendingDegradations = (): void => {
    pendingDegradations = [];
  };
  const count = (event: TelemetryEvent): boolean => {
    if (telemetry.count(event)) return true;
    // `count()` rend aussi `false` hors vocabulaire : c'est `armed` qui distingue « pas
    // encore le droit » de « jamais compté, et à juste titre ».
    if (
      event.kind === 'selector-degradation' &&
      !telemetry.armed &&
      pendingDegradations.length < PENDING_DEGRADATIONS_LIMIT
    ) {
      pendingDegradations.push(event);
    }
    return false;
  };

  // Un seul rappel, deux effets, et c'est voulu : la dégradation de sélecteur se journalise
  // LOCALEMENT dans tous les cas (§9.4, CA-11) et ne se remonte que si la télémétrie est
  // armée. Le tri entre les deux vit dans l'émetteur, pas ici.
  const log = new SelectorLog((event) => {
    persistSelectorFailure({ chain: event.chain, at: new Date().toISOString() });
    count(event);
  });

  const adapter: PlatformAdapter & { matchesHost(url: URL): boolean } =
    platform === 'github'
      ? new GithubClientAdapter({ documentRef: doc, extraHosts: extraHosts.github, readOrgConfig, log })
      : new AzdoClientAdapter({ documentRef: doc, extraHosts: extraHosts.azdo, readOrgConfig, log });

  const resolver = new ClientConfigResolver(readManagedFloor);
  const currentUser = await adapter.getCurrentUser();

  // Révoqué : plus aucun contrôleur ne doit s'attacher. Comme pour le rendu du bandeau,
  // déconnecter l'observateur ne suffit pas — un `attach()` déjà parti traverse plusieurs
  // `await` avant d'installer quoi que ce soit, et aboutirait après la révocation.
  let disposed = false;
  // ...et les contrôleurs DÉJÀ attachés doivent être défaits, pas seulement empêchés :
  // chacun a posé une barre d'outils, une saisie rapide et des écouteurs clavier/clic que
  // seul son `dispose()` retire. Une première version ne coupait que les deux
  // observations, laissant toute cette surface vivante sur un hôte devenu non autorisé
  // jusqu'au rechargement de la page (revue Codex, PR #29).
  //
  // `controller` est `null` pour un éditeur CONNU mais SANS contrôleur — mode `off` au
  // moment de sa découverte, ou depuis désarmé par un changement de configuration en direct
  // (revue Reefact, PR #39) : sans cette troisième possibilité, un éditeur ignoré en `off`
  // ne réapparaissait dans aucun registre, et un passage ultérieur à `enforce`/`warn` ne
  // l'attachait donc jamais — jusqu'à sa fermeture/réouverture ou au rechargement de la
  // page. L'éditeur (le handle brut de la plateforme) est conservé dans les deux cas : il
  // suffit, à lui seul, à reconstruire un contrôleur si le mode redevient actif.
  // `builtSignature` — la signature (`renderConfigSignatureOf`) de la configuration qui a
  // SERVI À CONSTRUIRE le contrôleur courant, `null` tant qu'aucun n'a encore été bâti :
  // sans elle, chaque rendu non navigué (y compris ceux qu'une mutation ORDINAIRE de la
  // page déclenche sur la même PR, sans le moindre changement de configuration) aurait
  // reconstruit barre d'outils et saisie rapide pour rien — perdant focus et saisie en
  // cours à chaque nouveau commentaire ailleurs sur la page (revue Codex, PR #39).
  //
  // `generation` — incrémentée SYNCHRONEMENT à chaque `reconcile()` qui doit (re)construire
  // un contrôleur, AVANT tout `await` : deux réconciliations concurrentes sur la MÊME
  // entrée (un rendu qui en chevauche un autre pendant que le premier attend la langue ou
  // les raccourcis stockés) verraient sinon toutes deux `entry.controller === null` et
  // construiraient chacune la leur, la plus lente écrasant la plus rapide dans `entry
  // .controller` sans jamais défaire celle qu'elle remplace — deux barres d'outils vivantes
  // à la fois, ou pire, une réconciliation PLUS ANCIENNE qui réinstalle un contrôleur actif
  // après qu'une PLUS RÉCENTE est passée en `off` (revue Codex, PR #39). Comme JavaScript
  // est mono-thread, l'incrément de la SECONDE réconciliation s'exécute nécessairement
  // avant que la PREMIÈRE ne reprenne après son `await` — celle-ci se retrouve donc avec
  // une génération périmée et renonce juste avant d'attacher, quel que soit l'ordre dans
  // lequel les deux se terminent.
  type EditorEntry = {
    editor: Parameters<Parameters<PlatformAdapter['observeEditors']>[0]>[0];
    element: Element;
    controller: EditorController | null;
    builtSignature: string | null;
    generation: number;
  };
  const knownEditors = new Set<EditorEntry>();

  /** Libère les éditeurs dont l'élément a quitté le document — attachés ou non.
   *
   * Sans cela, le `Set` ci-dessus — introduit pour que la révocation défasse les
   * contrôleurs — retenait aussi toutes les entrées MORTES, avec leur DOM détaché, leur
   * configuration et l'adaptateur, jusqu'à la fermeture de l'onglet. Sur une page de revue
   * en SPA, où l'on ouvre et referme des éditeurs en continu, cela grossit sans borne.
   * Avant l'introduction du `Set` ces objets étaient collectables : le correctif de la
   * révocation avait donc créé une fuite (revue Codex, PR #29).
   *
   * Le nettoyage se fait à chaque attachement plutôt que sur un minuteur : c'est le seul
   * instant où l'on sait qu'un éditeur vient d'apparaître, donc qu'un autre a pu partir. */
  const releaseDetached = (): void => {
    for (const entry of knownEditors) {
      if (entry.element.isConnected) continue;
      // Générateur incrémenté AVANT le retrait (revue Codex, PR #39) : une réconciliation
      // encore en vol pour cette entrée (`reconcile()`, en attente des lectures de stockage)
      // ne connaît que la clé `entry`, jamais son appartenance à `knownEditors` — sans ce
      // bump, elle passerait ses deux contrôles de génération après ce retrait et attacherait
      // un contrôleur tout neuf à un sous-arbre DÉTACHÉ, sur une entrée que plus rien ne
      // référence : ni `revoke()` (qui ne parcourt que `knownEditors`) ni un passage à `off`
      // (qui doit trouver l'entrée pour la réconcilier) ne pourraient plus jamais le disposer.
      entry.generation++;
      entry.controller?.dispose();
      knownEditors.delete(entry);
    }
  };

  /** (Ré)synchronise UN éditeur connu avec la configuration COURANTE — à sa découverte
   * (`attach`, plus bas) ET à chaque ré-résolution de la configuration affichée (revue
   * Reefact, PR #39, `onPrChange` ci-dessous) : symétrique dans les deux sens, l'attache
   * si le mode redevient actif après avoir été ignoré (`off` → `warn`/`enforce`), le
   * détache si le mode devient `off` après avoir été actif (§7 — extension entièrement
   * inactive, `dispose()` retire déjà tout ce qu'`attach()` avait posé, barre d'outils et
   * saisie rapide comprises).
   *
   * Sur un éditeur déjà attaché, une configuration qui n'a PAS changé pour lui (même
   * signature qu'à sa dernière construction) ne fait que repousser le résumé publié le plus
   * frais — sans reconstruire quoi que ce soit, ce qui perdrait focus et saisie en cours à
   * chaque rendu non navigué, y compris ceux qu'une simple mutation ailleurs sur la page
   * déclenche. Une configuration qui A changé pour lui (labels, décorations, langue —
   * `renderConfigSignatureOf` couvre tout ce dont dépendent la barre d'outils et la saisie
   * rapide) le reconstruit entièrement : ni `buildToolbar()` ni `attachQuickInput()` ne
   * relisent la configuration après leur construction, un simple échange de
   * `deps.resolved` les aurait laissés offrir les anciens labels/abréviations et jamais les
   * nouveaux (revue Codex, PR #39). */
  const reconcile = async (entry: EditorEntry, resolved: ResolvedClientConfig): Promise<void> => {
    if (disposed) return;
    // Incrémentée ICI, avant même de savoir quelle branche suit — inconditionnellement,
    // donc AUSSI sur un passage à `off` — pas seulement avant l'`await` de la branche de
    // construction : n'importe quel appel de `reconcile()` sur cette entrée périme toute
    // construction de contrôleur encore en vol pour elle, quelle que soit la branche que
    // CET appel-ci emprunte lui-même. Sans ce placement, un passage à `off` n'invalidait pas
    // une reconstruction déjà en vol (elle n'attend, elle, qu'un `await` plus bas) — celle-ci
    // pouvait reprendre après coup et réinstaller un contrôleur actif malgré le mode
    // désormais inactif (revue Codex, PR #39).
    const generation = ++entry.generation;
    if (resolved.config.mode === 'off') {
      // §7 : mode off = extension entièrement inactive. L'entrée reste connue — seul son
      // contrôleur part — pour pouvoir réattacher sans réobserver le DOM si le mode
      // redevient actif.
      entry.controller?.dispose();
      entry.controller = null;
      entry.builtSignature = null;
      return;
    }
    const signature = renderConfigSignatureOf(resolved);
    if (entry.controller && entry.builtSignature === signature) {
      // `published` relu ICI, jamais gardé de l'attachement d'origine — sans quoi le résumé
      // publié resterait figé pendant que la configuration, elle, avance (revue Reefact, PR
      // #39) : le mode `enforce`/écart d'empreinte se jugerait alors sur un résumé périmé.
      entry.controller.updateResolved(resolved, adapter.readPublishedResult());
      return;
    }
    // Jamais attaché (découvert en `off`, ou tout juste réactivé), OU une configuration
    // RÉELLEMENT différente pour cet éditeur : (re)construit exactement comme `attach()`
    // l'aurait fait à la découverte. L'ANCIEN contrôleur, s'il existe, reste actif — garde
    // et blocage compris — jusqu'à ce que le remplaçant soit prêt : le défaire tout de suite,
    // avant les deux lectures asynchrones qui suivent, laissait l'éditeur sans AUCUNE garde
    // pendant leur durée (le bouton de soumission dégrisé, aucun clic intercepté) — un
    // commentaire invalide restait alors soumissible tant qu'elles n'avaient pas abouti,
    // potentiellement indéfiniment si l'une d'elles ne répondait jamais (revue Codex, PR
    // #39). Seul un passage à `off` (branche ci-dessus) défait immédiatement : §7 veut alors
    // l'extension inactive tout de suite, pas seulement une fois un remplaçant prêt qui
    // n'existera jamais dans ce cas.
    const previousController = entry.controller;
    const published = adapter.readPublishedResult();
    // La garde de l'ancien contrôleur passe IMMÉDIATEMENT à la NOUVELLE configuration
    // (revue Reefact, PR #39) : le laisser en place ne devait éviter qu'une fenêtre SANS
    // AUCUNE garde (revue Codex, PR #39, ci-dessus) — pas geler sa décision sur l'ANCIENNE
    // configuration pendant toute la durée des deux lectures qui suivent. Sans ce rappel,
    // un passage `warn → enforce` laissait un commentaire invalide publiable jusqu'à leur
    // fin, et un passage à l'état dégradé (ou `enforce → warn`) pouvait continuer de
    // bloquer alors que le §5.4 exige déjà de désarmer. `updateResolved()` ne touche que la
    // validation (`deps.resolved`/`deps.published`, `refresh()`) — jamais la barre d'outils
    // ni la saisie rapide, qui restent celles de l'ANCIENNE configuration le temps que le
    // remplaçant soit prêt, exactement comme voulu.
    previousController?.updateResolved(resolved, published);
    const lang = resolveUiLanguage(await readUserLanguage(), resolved.config, doc.documentElement.lang || null);
    const directShortcuts = await readDirectShortcuts(); // §5.2 — préférence locale (§8.1.2)
    // Supplanté par une réconciliation plus récente sur la MÊME entrée, ou révoqué, pendant
    // les lectures ci-dessus : ne rien construire ni rien défaire au nom d'une génération
    // périmée — l'ancien contrôleur reste en place tel quel, une réconciliation plus
    // récente (ou `revoke()`) en décidera.
    if (disposed || generation !== entry.generation) return;
    const controller = new EditorController({
      adapter,
      editor: entry.editor,
      resolved,
      published,
      lang,
      currentUserLogin: currentUser.login,
      directShortcuts,
      telemetry: count,
      // Repris tel quel de l'ancien contrôleur (revue Codex, PR #39) : cette reconstruction
      // peut survenir sans que le diagnostic affiché change (langue, style de badge, TTL,
      // état dégradé) — un `#countedCodes` reparti de zéro recompterait alors un code
      // toujours présent, jamais disparu depuis l'ancien contrôleur.
      initialCountedCodes: previousController?.snapshotCountedCodes(),
    });
    if (disposed || generation !== entry.generation) return;
    previousController?.dispose();
    controller.attach();
    entry.controller = controller;
    entry.builtSignature = signature;
  };

  const attach = async (editor: Parameters<Parameters<PlatformAdapter['observeEditors']>[0]>[0]) => {
    if (disposed) return;
    // Résolution hors chemin critique : la NFR d'injection porte sur l'appel du cb (§10).
    const resolved = await resolver.resolve(adapter, editor.context.pr);
    writeDegradedState(resolved.degraded, resolved.degradedReason); // §9.2.3 — visible dans les options
    if (disposed) return;
    const entry: EditorEntry = { editor, element: editor.element, controller: null, builtSignature: null, generation: 0 };
    releaseDetached();
    knownEditors.add(entry);
    await reconcile(entry, resolved);
  };

  const editors = adapter.observeEditors((editor) => void attach(editor));

  /** L'armement vit au niveau de la PR AFFICHÉE, pas de la découverte d'un éditeur —
   * `observePrChromeNavigation` sonde les sélecteurs dès l'injection, une PR sans composeur
   * rendu doit remonter ses dégradations comme les autres (CA-11), et deux attachements
   * concurrents armaient chacun de leur côté (revue Codex, PR #31).
   *
   * DEUX raisons de réarmer, et elles ne se traitent pas pareil :
   *   • la PR affichée CHANGE — il faut désarmer tout de suite, avant la moindre lecture
   *     asynchrone, sinon ce qui est compté sur la nouvelle part au nom de l'ancienne ;
   *   • la même PR est RÉSOLUE À NOUVEAU (expiration du TTL, changement de politique ou de
   *     consentement) — désarmer serait ici gratuit et ferait perdre l'agrégat en cours ;
   *     on recalcule, et `arm()` ne vidange que si la cible a effectivement changé. */
  let armedFor: { pr: PrRef; key: string } | null = null;
  /** Génération : toute invocation en vol est invalidée par la suivante.
   *
   * La clé de PR ne suffit pas — c'était le défaut restant. Sur un RETRAIT DE CONSENTEMENT,
   * la PR ne change pas : une invocation partie avant le retrait, avec l'ancien
   * consentement en main, passait donc les deux contrôles de clé et réarmait après que le
   * retrait avait désarmé. L'onglet reprenait ses envois (revue Codex, PR #31). Un compteur
   * incrémenté à CHAQUE appel invalide les précédentes quelle qu'en soit la cause. */
  let armGeneration = 0;

  const armFor = async (pr: PrRef | null, reason: 'pr' | 'refresh'): Promise<void> => {
    if (disposed) return;
    const generation = ++armGeneration;
    const key = pr === null ? null : prTelemetryKey(pr);
    if (reason === 'pr' && key !== armedFor?.key) {
      // Vidanger AVANT de désarmer : `arm(null)` jette, et ce qui a été compté pour la PR
      // précédente lui appartient légitimement. Le désarmement protège d'une mauvaise
      // attribution, il n'est pas une raison de perdre la mesure.
      telemetry.flush();
      telemetry.arm(null);
      // Ce qui a été sondé avant ce changement appartient à la PR précédente : le rejouer
      // ici l'attribuerait à la nouvelle.
      dropPendingDegradations();
    }
    if (pr === null || key === null) {
      armedFor = null;
      telemetry.arm(null);
      dropPendingDegradations();
      return;
    }
    armedFor = { pr, key };
    const resolved = await resolver.resolve(adapter, pr); // en cache le plus souvent
    if (disposed || generation !== armGeneration) return;
    // Toute frontière asynchrone se re-vérifie, pas seulement la première.
    const [endpoint, consent] = await Promise.all([readManagedEndpoint(), readTelemetryConsent()]);
    if (disposed || generation !== armGeneration) return;
    const target = telemetryTarget(resolved.config, endpoint, consent, key);
    telemetry.arm(target);
    // L'armement CONCLUT l'intervalle : ce qui a été sondé pendant est crédité maintenant,
    // ou perdu pour de bon si la réponse est « pas de télémétrie ».
    const pending = pendingDegradations;
    dropPendingDegradations();
    if (target !== null) for (const event of pending) telemetry.count(event);
  };

  /** Le consentement peut être RETIRÉ, et la politique d'entreprise peut changer, pendant
   * que l'onglet vit. Sans ces écoutes, la case décochée ne changeait rien pour les onglets
   * déjà ouverts : ils continuaient à vidanger jusqu'au rechargement (revue Codex, PR #31).
   * On désarme immédiatement — donc en jetant ce qui était compté, puisqu'on vient
   * d'apprendre qu'on n'avait peut-être plus le droit d'émettre — puis on réévalue. */
  const onTelemetryInputChanged = (
    changes: Record<string, { newValue?: unknown }>,
    area: string
  ): void => {
    const consentChanged = area === 'local' && TELEMETRY_CONSENT_KEY in changes;
    if (!consentChanged && area !== 'managed') return;
    // Désarmer JETTE les compteurs, et c'est fait exprès : on vient d'apprendre qu'on n'a
    // peut-être plus le droit d'émettre. Encore faut-il l'avoir appris. La zone `managed`
    // porte AUSSI `allowedHosts` et `floor` : un hôte d'entreprise ajouté par la politique
    // faisait perdre jusqu'à un intervalle de vidange de compteurs à tous les onglets
    // ouverts, pour se réarmer aussitôt sur exactement la même cible (revue Codex, PR #31).
    // Une politique de télémétrie inchangée n'a rien à révoquer ; la réévaluation, elle,
    // reste due — le mode effectif peut avoir changé avec le plancher —, et `arm()` ne
    // vidange que si la cible a réellement bougé.
    const telemetryPolicyChanged = area === 'managed' && 'telemetry' in changes;
    if (consentChanged || telemetryPolicyChanged) {
      telemetry.arm(null);
      dropPendingDegradations();
    }
    void armFor(armedFor?.pr ?? null, 'refresh');
  };
  try {
    chrome?.storage?.onChanged?.addListener(onTelemetryInputChanged);
  } catch {
    // Hors contexte d'extension : rien à écouter.
  }

  // `onPrChange` porte les DEUX cas : un changement de PR (désarmement immédiat) et une
  // simple ré-résolution de la même PR après expiration du TTL — l'onglet restait sinon armé
  // sur l'ancienne configuration alors que l'interface adoptait la nouvelle (revue Codex,
  // PR #31).
  const stopPrChrome = observePrChromeNavigation(adapter, resolver, doc, Date.now, (pr, changed, resolved) => {
    void armFor(pr, changed ? 'pr' : 'refresh');
    // Éditeurs DÉJÀ CONNUS (§5, revue Codex et Reefact, PR #39) : chacun garde la
    // configuration capturée à son propre `attach()` tant que rien ne la lui repousse —
    // sans ce geste, un éditeur ouvert avant une ré-résolution (TTL expiré, ou sondage
    // périodique du §8.1.2) continuerait à valider et à bloquer l'envoi sur une
    // configuration périmée jusqu'à sa fermeture/réouverture. `reconcile()` couvre aussi
    // les DEUX transitions de mode — attache un éditeur ignoré en `off` si le mode redevient
    // actif, détache un éditeur actif si le mode passe à `off` — jamais seulement l'échange
    // de configuration d'un éditeur qui resterait attaché. `resolved` est `null` sur une
    // navigation (`changed: true`, chaque éditeur de la page qui vient d'arriver reçoit la
    // sienne, fraîche, via son propre `attach()`) ou sans PR affichée — rien à resynchroniser
    // dans les deux cas.
    if (resolved) {
      releaseDetached();
      for (const entry of knownEditors) void reconcile(entry, resolved);
    }
  });

  // Vidange : périodique, et à la fermeture de l'onglet. `pagehide` et non `unload` —
  // celui-ci empêche la mise en cache arrière/avant et n'est plus fiable ; `keepalive`
  // (telemetry.ts) est ce qui laisse la dernière requête partir malgré la fermeture.
  const flushTimer = setInterval(() => telemetry.flush(), TELEMETRY_FLUSH_MS);
  const flushOnHide = () => telemetry.flush();
  doc.defaultView?.addEventListener('pagehide', flushOnHide);

  const revoke = () => {
    disposed = true;
    try {
      chrome?.storage?.onChanged?.removeListener?.(onTelemetryInputChanged);
    } catch {
      // Hors contexte d'extension : rien à retirer.
    }
    clearInterval(flushTimer);
    doc.defaultView?.removeEventListener('pagehide', flushOnHide);
    // Une dernière vidange AVANT de désarmer : les compteurs de la session comptent autant
    // que les autres, et `arm(null)` les jette.
    telemetry.flush();
    telemetry.arm(null);
    editors.dispose();
    stopPrChrome();
    for (const entry of knownEditors) entry.controller?.dispose();
    knownEditors.clear();
  };

  // §2 — RETRAIT de la permission d'hôte, l'onglet restant ouvert. Désenregistrer le
  // script de contenu (background.ts) n'empêche que les injections FUTURES : celui déjà
  // en place continue sinon d'observer le DOM, de poser la barre d'outils et de griser le
  // bouton d'envoi sur un hôte qui n'est plus autorisé, jusqu'au rechargement de la page
  // (revue Codex, PR #29). C'est `teardown` que le guet armé plus haut appellera.
  teardown = revoke;
  return disposeAll;
}

/** Livre chaque nouvelle répartition publiée. Ne juge de rien : c'est `selectPlatform()`
 * qui décide, chez l'appelant, si quelque chose a changé pour l'hôte courant. */
function watchExtraHosts(url: URL, onPublished: (next: ExtraHostsByPlatform) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== 'local' || !(EXTRA_HOSTS_KEY in changes)) return;
    onPublished(normalizeExtraHosts(changes[EXTRA_HOSTS_KEY]?.newValue));
  };
  try {
    if (!chrome?.storage?.onChanged?.addListener) return () => {};
    chrome.storage.onChanged.addListener(listener);
    return () => chrome?.storage?.onChanged?.removeListener?.(listener);
  } catch {
    return () => {};
  }
}

function currentPrOf(adapter: PlatformAdapter): PrRef | null {
  return (adapter as GithubClientAdapter | AzdoClientAdapter).currentPr?.() ?? null;
}

/** Élément après lequel monter le bandeau (§5.5) — surface d'affichage, hors contrat
 * §9.2.3 : un adaptateur qui ne l'expose pas laisse le repli sur le haut du document. */
function bannerMountOf(adapter: PlatformAdapter): Element | null {
  const withMount = adapter as PlatformAdapter & { getBannerMount?: () => Element | null };
  return withMount.getBannerMount?.() ?? null;
}

function renderedThreadsOf(adapter: PlatformAdapter): { id: string; element: Element }[] {
  const withRenderedThreads = adapter as PlatformAdapter & {
    getRenderedThreadElements?: () => { id: string; element: Element }[];
  };
  return withRenderedThreads.getRenderedThreadElements?.() ?? [];
}

export function prKeyFor(pr: PrRef | null): string | null {
  return pr ? `${pr.host}/${pr.scope.join('/')}#${pr.number}` : null;
}

/** Fenêtre de rattrapage après une navigation vers une PR : tant qu'aucun rendu n'a rien
 * montré ET que cette fenêtre n'est pas écoulée, on retente. C'est un budget de TEMPS, pas
 * un nombre de tentatives — une PR chargée sous forte charge réseau peut mettre plusieurs
 * secondes à peupler ses fils/son statut publié, quel que soit le nombre de mutations DOM
 * observées entre-temps (un compteur de tentatives s'épuiserait en quelques dizaines de
 * millisecondes dès que la configuration est en cache, bien avant que le contenu n'arrive
 * — précisément pendant l'hydratation qu'il est censé attendre). Réinitialisée à chaque PR. */
export const RENDER_RETRY_WINDOW_MS = 5000;

/** Espacement minimal entre deux tentatives déclenchées par une rafale de mutations que le
 * rendu en cours a manquée (streaming de commentaires, virtualisation) : sans lui, chaque
 * rafale se traduirait par une relecture DOM/réseau immédiate à chaque mutation reçue
 * pendant le rendu précédent. Choix d'ingénierie, pas une exigence du §10 — cette NFR ne
 * borne que l'appel du `cb` d'`observeEditors` (§9.2.3), jamais `renderPrChrome`. Ne
 * s'applique qu'au rattrapage, jamais au premier rendu d'une navigation ni à un changement
 * du résumé publié — les deux restent immédiats. */
export const RENDER_RETRY_THROTTLE_MS = 250;

/** PLAFOND du rattrapage de la configuration EFFECTIVE (§8.1.2) sur un onglet inerte :
 * `run()` ne se déclenche que sur mutation DOM ou changement de PR — un onglet resté
 * ouvert sans nouvelle activité (pas de commentaire, pas de navigation, pas de changement
 * d'état de fil) ne relit donc jamais la configuration après l'expiration de son TTL
 * (`configCacheTtlSeconds`, une heure par défaut), même si une modification d'organisation
 * ou de dépôt — censée s'appliquer en direct (§8.1.3, ligne « Élargissant ») — a eu lieu
 * entre-temps (revue Codex, PR #38). Ce que la vérification affiche en dépend tout entier :
 * pas seulement le badge, mais le verdict de conformité rendu par `decorateComment`.
 *
 * Ce n'est PAS un sondage rapide : dix fois plus long que `RENDER_RETRY_THROTTLE_MS`
 * n'aurait aucun sens ici, la staleness tolérée se compte en minutes, pas en
 * millisecondes. UN PLAFOND, pas un rythme fixe (revue Reefact, PR #39) : un `setInterval`
 * bloqué sur cette seule valeur laisserait, sous un `configCacheTtlSeconds` d'entreprise
 * de 30 ou 60 s, jusqu'à cinq minutes s'écouler entre l'expiration RÉELLE du cache et le
 * prochain réveil — une fenêtre de divergence bien plus large que le TTL que
 * l'administration a choisi. `scheduleNextConfigPoll` (plus bas) reprogramme donc chaque
 * réveil sur `min(CONFIG_POLL_INTERVAL_MS, dernier TTL connu)`, jamais sur cette constante
 * seule : elle ne sert plus que de repli tant qu'aucune résolution n'a encore appris le TTL
 * réel, et de PLAFOND une fois qu'il est connu, pour ne jamais descendre EN DESSOUS d'un
 * TTL d'entreprise plus généreux (chaque réveil ne coûte qu'un `resolver.resolve()`, sans
 * effet tant que le cache du résolveur n'a pas expiré lui-même). */
export const CONFIG_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** PLANCHER du rattrapage — sans lui, un `configCacheTtlSeconds` de `0` (valeur légale,
 * §8.1.2 : « aucun minimum ni maximum ») ferait reprogrammer le prochain réveil à `0` ms,
 * un sondage en boucle serrée sur un onglet pourtant inerte. `0` demande déjà une fraîcheur
 * maximale à chaque rendu DÉCLENCHÉ (mutation, navigation) ; un onglet SANS mutation n'a pas
 * à sonder plus vite que cela pour autant — quelques secondes restent une fenêtre de
 * divergence négligeable devant le reste du §8.1.3. */
export const CONFIG_POLL_MIN_INTERVAL_MS = 5000;

/** Signature légère du résumé publié (§5.5, §6.5, §8.1.3 règle 2, CA-03) : par valeur, pas
 * par identité d'objet — l'adaptateur peut renvoyer un objet neuf à chaque lecture. Les
 * quatre premiers champs sont EXACTEMENT ceux que le rendu AFFICHE — `state` pilote le
 * grisage §6.5, `unresolvedBlockingCount` le titre du bandeau, `mode` et `coreVersion` la
 * ligne « jugée par … » (`ui/banner.ts`, `banner.judged`) : un check qui se termine à
 * nouveau avec le même décompte mais un `core` ou un `mode` différent doit rester détecté.
 *
 * `configFingerprint` et `activatedAt` EN PLUS (revue Codex, PR #39) : ni l'un ni l'autre ne
 * change ce que le bandeau AFFICHE, mais tous deux entrent dans `decideGuard()` — l'écart
 * d'empreinte (§8.1.3 règle 2) et le périmètre d'activation (§6.2.3) — dont dépend le
 * blocage des éditeurs déjà ouverts, relu à chaque réconciliation (`reconcile()`,
 * `bootstrap()`). Sans eux, un check serveur qui fait avancer SEULEMENT `configFingerprint`
 * (l'extension a déjà adopté la config B, le serveur la publie enfin) laisse `chromeSig`
 * inchangé si state/count/mode/coreVersion ne bougent pas : `run()` ne re-rend jamais,
 * `onPrChange` n'appelle donc jamais `reconcile()`, et l'écart d'empreinte qui aurait dû se
 * résorber reste vrai indéfiniment — un blocage qui devrait se réarmer (ou se désarmer)
 * ne le fait jamais tant qu'aucun AUTRE champ du résumé ne change par ailleurs. */
export function publishedSignatureOf(adapter: PlatformAdapter): string | null {
  const p = adapter.readPublishedResult();
  return p
    ? `${p.state}|${p.unresolvedBlockingCount}|${p.mode}|${p.coreVersion}|${p.configFingerprint}|${p.activatedAt ?? ''}`
    : null;
}

/** Signature de tout ce que `renderPrChrome` peut afficher pour la PR courante — le résumé
 * publié (`publishedSignatureOf`), PLUS l'identité des fils rendus (pas seulement leur
 * nombre : React peut remplacer un fil par un autre sans changer le compte) et le nombre de
 * commentaires visibles dans le DOM ; PLUS, seulement si `probeCompletionControl`, la
 * présence du bouton de complétion. Sans ces signaux, un premier rendu où le résumé publié
 * apparaît AVANT le reste de la page (bouton pas encore rendu, fils/commentaires pas encore
 * chargés) suffit à satisfaire `hasSomethingToShow` — le bandeau s'affiche, `showedSomething`
 * se fige, et le bouton de complétion comme les fils chargés ensuite ne reçoivent jamais
 * leur grisage/leurs badges.
 *
 * `probeCompletionControl` : `getCompletionControl()` journalise une dégradation de
 * sélecteur (§9.4) à CHAQUE appel où il ne trouve rien — un bouton absent est la norme sur
 * une PR fermée ou sans droit de fusion, pas une dégradation. L'inclure dans une signature
 * recalculée à chaque mutation ferait grossir `SelectorLog.failures` (et la télémétrie
 * opt-in, §10) sans borne pour toute la durée de vie de l'onglet — `observePrChromeNavigation`
 * ne sonde donc que dans la fenêtre d'hydratation (`RENDER_RETRY_WINDOW_MS`) ; au-delà, ce
 * champ se fige (`'?'`), et seuls le résumé publié et les fils/commentaires — sans effet de
 * bord, `queryChainAll` ne journalise rien — restent surveillés indéfiniment.
 *
 * Ne porte QUE de l'état appartenant à la plateforme — jamais ce que notre propre rendu
 * écrit : c'est `ownOutputSignatureOf`, capturée après le rendu, qui couvre ce versant. */
function chromeSignatureOf(adapter: PlatformAdapter, probeCompletionControl: boolean): string {
  const completion = probeCompletionControl ? (adapter.getCompletionControl() !== null ? '1' : '0') : '?';
  return `${completion}|${contentSignatureOf(adapter)}`;
}

/** Le CONTENU que la plateforme rend — résumé publié, fils, nombre de corps de commentaire —
 * sans le bouton de complétion, et c'est toute la raison d'être de cette séparation : ce
 * bouton n'est pas du contenu, et sa sonde change de valeur (`'?'`) au franchissement de la
 * fenêtre d'hydratation, sans que la page ait bougé d'un pixel. Une comparaison faite au
 * travers de cette bascule verrait un changement qui n'existe pas.
 *
 * C'est ce que compare `run()` pour décider si une page qui n'a encore RIEN montré mérite un
 * nouveau rendu passé la fenêtre (voir là-bas). Sans effet de bord : aucune de ces trois
 * lectures ne journalise de dégradation de sélecteur, contrairement à `getCompletionControl()`. */
function contentSignatureOf(adapter: PlatformAdapter): string {
  const published = publishedSignatureOf(adapter) ?? '';
  const threadIds = renderedThreadsOf(adapter)
    .map((t) => t.id)
    .join(',');
  return `${published}|${threadIds}|${renderedCommentCountOf(adapter)}`;
}

/** Nombre de corps de commentaire que la PLATEFORME rend — **jamais** le nombre de ceux que
 * nous décorons, et les deux ont cessé de coïncider le jour où la description de la PR est
 * sortie du périmètre (§4.1) : l'adaptateur GitHub la compte ici et l'écarte de
 * `getRenderedComments()`.
 *
 * Sonde le COMPTE, jamais getRenderedComments() : cette dernière calcule bodyText (clone
 * du sous-arbre dès qu'un badge est posé) pour chaque commentaire, un coût proportionnel
 * à tout le DOM des commentaires rendus, à chaque mutation, pour la durée de vie de
 * l'onglet. Repli sur getRenderedComments().length pour les adaptateurs (de test) qui
 * n'exposent pas la sonde dédiée. */
function renderedCommentCountOf(adapter: PlatformAdapter): number {
  const withRendered = adapter as PlatformAdapter & {
    getRenderedCommentCount?: () => number;
    getRenderedComments?: () => unknown[];
  };
  return withRendered.getRenderedCommentCount?.() ?? withRendered.getRenderedComments?.().length ?? 0;
}

/** Corps de commentaire rendus — les éléments SEULS, jamais `getRenderedComments()` : cette
 * dernière calcule aussi `bodyText`, donc un clone de sous-arbre par commentaire décoré, un
 * coût que `ownOutputSignatureOf` paierait à chaque mutation pour la durée de vie de
 * l'onglet (même raison que la sonde de COMPTE de `chromeSignatureOf`). Vide pour un
 * adaptateur qui ne l'expose pas : la surface d'affichage du §5.5 est hors du contrat
 * normatif §9.2.3, un adaptateur n'a pas à la porter pour être valide. */
function renderedCommentElementsOf(adapter: PlatformAdapter): Element[] {
  const withElements = adapter as PlatformAdapter & { getRenderedCommentElements?: () => Element[] };
  return withElements.getRenderedCommentElements?.() ?? [];
}

/** Ce que NOTRE rendu écrit dans la page, et que la plateforme peut défaire : le texte des
 * fils et des corps de commentaire — nos badges et notre masquage de préfixe y entrent — et
 * la présence de nos deux surfaces (§5.5). Quatre angles morts que le décompte seul laissait
 * ouverts (revue Codex, PR #26 ; puis les deux défauts d'édition ci-dessous) :
 *
 * - une racine éditée SUR PLACE (`issue: a` corrigé en `issue: b`) ne change ni le nombre de
 *   fils, ni leurs identifiants, ni le nombre de commentaires — la signature de plateforme
 *   restait identique, `run()` sortait avant de reconstruire, et le bandeau, qui affiche
 *   désormais le SUJET, gardait un texte périmé ;
 * - une réhydratation React qui remplace le parent auquel le bandeau est adossé
 *   (`bannerMount`) emporte notre élément sans rien changer à cet état de plateforme : rien
 *   ne le faisait revenir ;
 * - un commentaire de la CONVERSATION mis à jour par son auteur : la plateforme réécrit le
 *   corps rendu, ce qui emporte nos badges ET le masquage du préfixe, sans changer le nombre
 *   de commentaires ni rien de ce que porte `chromeSignatureOf`. Les fils RENDUS
 *   (`getRenderedThreadElements`) ne couvrent pas ce cas : sur GitHub ils ne désignent que
 *   les fils de revue (`[data-testid="review-thread"]`,
 *   `.js-resolvable-timeline-thread-container`), jamais un commentaire de premier niveau.
 *   Rien ne bougeait donc dans aucune des deux signatures, `run()` sortait, et le
 *   commentaire restait DÉFINITIVEMENT sans badge, préfixe structuré réapparu en clair ;
 * - une de nos écritures SANS TEXTE défaite seule, texte et badges intacts — masquage du
 *   préfixe, mise en avant du sujet, respiration : voir `textlessWritesMapOf`, qui dit
 *   pourquoi le digest de texte est aveugle à ce cas-là par construction.
 *
 * Le texte, et pas seulement la PRÉSENCE de nos nœuds (un simple compte de `.cct-badge`
 * suffirait à rattraper un corps réécrit) : nous n'avons pas MESURÉ comment chaque
 * plateforme applique une édition — remplacement du sous-arbre rendu, ou correctif ciblé sur
 * les seuls nœuds de texte. Le second laisserait nos badges en place et PÉRIMÉS, un défaut
 * qu'aucun compte ne verrait ; le digest de texte couvre les deux sans avoir à trancher.
 * Il ne couvre en revanche PAS ce que `display: none` soustrait au rendu sans le soustraire
 * à `textContent` : c'est exactement l'objet du quatrième point ci-dessus.
 *
 * **Capturée APRÈS le rendu, jamais avant.** C'est tout l'intérêt de la séparer de
 * `chromeSignatureOf` : nos badges et nos insertions modifient précisément ce qu'elle
 * mesure. Comparée à une photo prise AVANT notre écriture, chaque rendu se re-déclencherait
 * lui-même — un cycle de rendu supplémentaire à chaque passage, qui déstabilise la
 * coalescence des mutations et retarde d'autant le retrait d'un bandeau périmé. Comparée à
 * l'état laissé par le rendu précédent, seule une main EXTÉRIEURE la fait bouger. */
function ownOutputSignatureOf(adapter: PlatformAdapter, doc: Document): string {
  const comments = renderedCommentElementsOf(adapter);
  const surfaces = [...renderedThreadsOf(adapter).map((t) => t.element), ...comments];
  return `${textDigestOf(surfaces)}|${textlessWritesMapOf(comments)}|${injectedSurfacesOf(doc)}`;
}

/** Nos écritures SANS TEXTE, commentaire par commentaire — celles qu'un digest de texte ne
 * peut pas voir disparaître, et il faut dire pourquoi chacune y échappe :
 *
 * - `.cct-hidden-prefix` masque son contenu par `display: none`, une propriété de RENDU :
 *   `textContent` continue de le rapporter mot pour mot. Remplacer le wrapper par son propre
 *   texte — ce que fait une réhydratation qui reconstruit le sous-arbre de texte natif sans
 *   toucher à nos badges, restés à côté — laisse donc `textContent` RIGOUREUSEMENT identique.
 *   Le préfixe structuré redevenait visible sans que rien ne bouge dans aucune des deux
 *   signatures : `run()` sortait avant `decorateComment()`, dont l'entretien inconditionnel du
 *   masquage (ui/badges.ts, revue Reefact PR #40) n'était alors jamais atteint — la réparation
 *   existait, la porte pour y arriver, non (revue Reefact, PR #42) ;
 * - `.cct-subject` n'AJOUTE aucun texte : il enveloppe celui que l'auteur a écrit. Le défaire
 *   rend ses enfants au parent, `textContent` inchangé — le sujet perd son gras, et la ligne
 *   des badges le sujet qu'elle porte, en silence ;
 * - `.cct-subject-break` est vide par construction : sa présence ou son absence ne change
 *   jamais un seul caractère.
 *
 * Trois `querySelector` par corps au lieu d'un, à chaque mutation : c'est le prix d'une
 * couverture qui suit ce que le rendu pose réellement, et il reste très en deçà du digest de
 * texte déjà payé sur les mêmes éléments (une lecture de `textContent` et un passage sur tous
 * ses caractères).
 *
 * Par COMMENTAIRE, pas un compte global : un compte suffirait à voir une perte sèche, mais
 * pas un échange — un corps qui perd un wrapper pendant qu'un autre le gagne dans la même
 * salve. Une chaîne positionnelle distingue les deux.
 *
 * Un `0` n'est PAS une anomalie à rattraper indéfiniment : un commentaire sans préfixe, dont
 * la projection en badges serait à perte, dont le sujet n'a pas pu être borné, ou dont le
 * corps reprend au paragraphe suivant (donc sans espaceur), n'a jamais le wrapper
 * correspondant — et son `0` est le même d'un rendu au suivant, stable, donc sans boucle. */
const TEXTLESS_WRITES = ['.cct-hidden-prefix', '.cct-subject', '.cct-subject-break'];

function textlessWritesMapOf(commentElements: Element[]): string {
  let map = '';
  for (const element of commentElements) {
    for (const selector of TEXTLESS_WRITES) map += element.querySelector(selector) === null ? '0' : '1';
  }
  return map;
}

/** Empreinte 32 bits (FNV-1a) du texte des éléments où notre rendu écrit. Le coût est assumé
 * et reste bien inférieur à celui que `getRenderedComments()` fait rejeter plus haut : une
 * lecture de `textContent` par élément et un passage sur ses caractères, là où l'autre CLONE
 * le sous-arbre de chaque commentaire. Un corps de commentaire déjà contenu dans un conteneur
 * de fil est parcouru deux fois : le dédoublonner coûterait un `closest()` par commentaire,
 * plus cher que le second passage qu'il éviterait. */
function textDigestOf(elements: Element[]): string {
  let hash = 0x811c9dc5;
  for (const element of elements) {
    const text = element.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(36);
}

/** Présence de nos deux surfaces injectées. Deux requêtes de sélecteur, sans effet de bord
 * ni journalisation. Une absence LÉGITIME — décompte nul pour le bandeau, aucun fil pour le
 * filtre — est un état stable d'un rendu au suivant : rien ne bascule, rien ne boucle. */
function injectedSurfacesOf(doc: Document): string {
  const banner = doc.querySelector('.cct-banner') !== null ? '1' : '0';
  const filter = doc.querySelector('.cct-thread-filter') !== null ? '1' : '0';
  return `${banner}${filter}`;
}

/** Signature de TOUT ce qu'une configuration résolue (§8.1.2) peut faire varier côté client
 * — rendu ET grisage — délibérément PLUS LARGE que `fingerprint()` (core/,
 * config/fingerprint.ts), qui ne couvre que le domaine du VERDICT partagé par les deux
 * composants (§9.2.2) et exclut à dessein `language`, `badgeStyle`, l'icône d'un label :
 * autant de clés qui ne changent aucun verdict mais que `renderPrChrome`/`decorateComment`
 * affichent bel et bien (revue Codex, PR #39). Comparer seulement `fingerprint()` dans
 * `pollConfig` (voir `observePrChromeNavigation`) aurait laissé un changement de langue ou
 * de style de badge, survenu pendant que l'onglet est inerte, ne jamais atteindre la page
 * tant qu'aucun champ du domaine de verdict n'avait lui-même changé.
 *
 * `degraded` (§5.4, condition 4) EN PLUS de `config` — pas seulement `EffectiveConfig` (revue
 * Reefact, PR #39) : il vit à côté de `config` dans `ResolvedClientConfig`, jamais dedans, et
 * une lecture qui devient `unreachable` peut très bien retomber, par repli, sur une
 * configuration effective IDENTIQUE à celle d'avant (mêmes valeurs par défaut). Sans lui, ce
 * repli ne changerait rien à la signature : `pollConfig` conclurait à tort que rien n'a
 * changé, et un éditeur déjà ouvert garderait `degraded: false` — donc un blocage actif —
 * alors que le §5.4 exige justement de le désarmer dès qu'une lecture est dégradée.
 *
 * `JSON.stringify`, sans projection à la main pour la partie configuration : une liste de
 * champs choisie ici referait, pour le RENDU, exactement l'erreur que ce commentaire décrit
 * pour `fingerprint()` — une clé de rendu ajoutée plus tard resterait invisible tant que
 * personne ne pense à l'ajouter à la liste. */
function renderConfigSignatureOf(resolved: { config: EffectiveConfig; degraded: boolean }): string {
  return JSON.stringify({ config: resolved.config, degraded: resolved.degraded });
}

/** Ré-invoque `renderPrChrome` quand le contexte de PR change (§5.5, §6.5) — navigation
 * SPA vers une PR différente (ou plus aucune) —, tant que le dernier rendu sur la MÊME PR
 * n'a rien eu à montrer (fenêtre `RENDER_RETRY_WINDOW_MS` : au premier chargement direct
 * d'une PR, `getThreads()` et le statut publié se lisent dans le DOM, que GitHub/AzDO
 * peuplent de façon asynchrone — fils chargés en différé, statut de check encore en vol),
 * et quand la signature de la « barre » (`chromeSignatureOf`) CHANGE après coup, même une
 * fois quelque chose déjà affiché : §5.5 fait du résumé publié la source qui fait autorité
 * « dès qu'il est présent sur la page », et §6.5 grise/dégrise le bouton de complétion sur
 * son seul état — un rendu figé sur le premier résultat lu contredirait CA-03 dès que le
 * check se termine après coup, ou laisserait un bouton apparu plus tard, ou des fils
 * chargés ensuite, sans grisage ni badge. Ce dernier cas ignore délibérément la fenêtre : ce
 * n'est pas un chargement encore en cours, juste une donnée qui a changé, et elle doit être
 * adoptée quel que soit l'âge de la PR.
 *
 * Le déclencheur générique — MutationObserver sur le document — couvre Turbo comme les
 * vues React qui n'émettent pas d'événement Turbo (§A.3), et vaut à l'identique sur Azure
 * DevOps (§B.3).
 *
 * Un seul rendu à la fois : le rendu écrit lui-même dans le DOM (bandeau, badges), donc
 * réagir à chaque mutation sans coalescing ferait boucler l'observateur sur ses propres
 * écritures. Les mutations survenues pendant un rendu en vol en déclenchent exactement une
 * autre à sa fin, temporisée (§10). */
export function observePrChromeNavigation(
  adapter: PlatformAdapter,
  resolver: ClientConfigResolver,
  doc: Document,
  // Horloge injectable — même convention que ClientConfigResolver (config-resolver.ts) —
  // pour tester la fenêtre RENDER_RETRY_WINDOW_MS sans dépendre d'une attente réelle.
  now: () => number = Date.now,
  /** Appelé quand une configuration effective est adoptée pour la PR affichée — `changed`
   * distingue une NAVIGATION (`true`, la PR n'est plus la même) d'une simple ré-résolution
   * de la même PR (`false`, expiration du TTL). `null` quand la page ne montre plus de PR.
   *
   * C'est le seul signal de ce module lié à la PR et non à un éditeur : la télémétrie s'y
   * arme (voir `armFor`), parce qu'une PR sans composeur rendu doit remonter ses
   * dégradations comme les autres (CA-11), et parce qu'un onglet restait armé sur l'ancienne
   * configuration quand celle-ci se rafraîchissait sans navigation (revue Codex, PR #31).
   *
   * `resolved` porte la configuration EFFECTIVEMENT appliquée par le rendu qui a produit cet
   * appel — `null` sur une navigation (`changed: true`, pas encore résolue à cet instant) ou
   * sans PR affichée. `bootstrap()` s'en sert pour rafraîchir les éditeurs déjà attachés
   * (revue Codex, PR #39) : sans ce signal, un éditeur ouvert avant qu'un sondage périodique
   * ou une expiration de TTL ne change la configuration continuerait à valider et à bloquer
   * l'envoi sur celle, périmée, capturée à son propre `attach()`. */
  onPrChange: (pr: PrRef | null, changed: boolean, resolved: ResolvedClientConfig | null) => void = () => {},
  /** Injectable pour les tests (une horloge réelle, pas `now`, gouverne `setTimeout` — voir
   * `CONFIG_POLL_INTERVAL_MS`) : une valeur courte y remplace les cinq minutes de production
   * sans attendre cette durée pour de vrai. `0` désactive le sondage. */
  configPollIntervalMs: number = CONFIG_POLL_INTERVAL_MS,
  /** Injectable pour les mêmes raisons que `configPollIntervalMs`, et pour la même raison
   * qu'elle est SÉPARÉE de lui (voir `CONFIG_POLL_MIN_INTERVAL_MS`) : un test qui veut
   * vérifier qu'un TTL COURT borne la cadence a besoin d'un plancher tout aussi court, sous
   * peine que le plancher de production (5 s) masque l'effet du TTL qu'il teste. */
  configPollMinIntervalMs: number = CONFIG_POLL_MIN_INTERVAL_MS
  /** Révoque l'observation : déconnecte l'observateur et annule un rattrapage en attente.
   * Sans emploi en production — l'observateur vit le temps de l'onglet — mais nécessaire à
   * tout appelant qui n'est PAS un onglet : deux observations concurrentes sur le même
   * document se répondent l'une à l'autre, chacune voyant dans les écritures de l'autre une
   * page modifiée sous elle. */
): (() => void) {
  let lastPrKey: string | null = null;
  let lastChromeSig: string | null = null;
  // Pendant de `lastChromeSig` pour la branche « rien montré » de `run()` — voir là-bas
  // pourquoi les deux ne se confondent pas.
  let lastContentSig: string | null = null;
  // État de ce que NOTRE dernier rendu a laissé dans la page (`ownOutputSignatureOf`) —
  // écrit à la FIN du rendu, jamais au début, pour que nos propres écritures ne se
  // re-déclenchent pas elles-mêmes.
  let lastOwnSig: string | null = null;
  let hasRendered = false;
  let showedSomething = false;
  let retryUntil = 0;
  let inFlight = false;
  let missedMutation = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // Révoquée : plus rien ne doit écrire dans la page. Déconnecter l'observateur et annuler
  // le minuteur ne suffit pas — un rendu EN VOL au moment de la révocation en reprogramme un
  // à sa fin, qui rendrait ensuite dans un document dont cette observation ne sait plus rien.
  let disposed = false;
  // Filtre par label choisi par l'utilisateur (§5.5) — vit ICI, pas dans renderPrChrome (qui
  // reconstruit la barre de puces à chaque appel, y compris sur la MÊME PR une fois D3 en
  // jeu) : sans cet état, chaque rendu répété repartirait sur « tous », perdant la sélection.
  let selectedLabel: string | null = null;
  // Pliage du bandeau choisi par l'utilisateur, et situation qui l'a motivé (§5.5). Vit ICI
  // pour la même raison que le filtre : renderPrChrome reconstruit le bandeau à chaque appel.
  let bannerOpen: boolean | null = null;
  let bannerBlocked: boolean | null = null;
  // Signature de TOUT ce que la configuration effective (§8.1.2) peut faire varier dans le
  // rendu — `renderConfigSignatureOf`, jamais `resolved.fingerprint` (revue Codex, PR #39) :
  // ce dernier ne couvre que le domaine du VERDICT partagé par les deux composants (§9.2.2)
  // et exclut à dessein `language`, `badgeStyle`, l'icône d'un label — autant de clés qui ne
  // changent aucun verdict mais que `renderPrChrome`/`decorateComment` affichent bel et
  // bien. Telle qu'appliquée par le DERNIER rendu réel — posée juste après lui (voir la fin
  // de `run()`), jamais par `pollConfig` : un sondage qui se contenterait de comparer ses
  // propres lectures successives raterait tout changement survenu AVANT son premier réveil.
  // `null` tant qu'aucun rendu n'a encore eu lieu pour la PR affichée (pas de référence à
  // comparer, donc pas de sondage actif).
  let lastRenderConfigSignature: string | null = null;
  // Posé par `pollConfig` quand elle constate un écart : fait sauter la comparaison de
  // signatures ci-dessous pour LE PROCHAIN `run()`, sans quoi un changement de
  // configuration qui ne modifie ni le résumé publié de la plateforme ni notre propre
  // sortie (chromeSig/ownSig ignorent l'un comme l'autre la configuration résolue
  // localement) resterait invisible jusqu'à la prochaine navigation.
  let forceRender = false;
  let configPollTimer: ReturnType<typeof setTimeout> | null = null;
  // Dernier `configCacheTtlSeconds` appris, converti en ms — `null` tant qu'aucune
  // résolution n'a encore répondu. Sert de PLAFOND au délai du prochain réveil (revue
  // Reefact, PR #39) : voir `CONFIG_POLL_INTERVAL_MS`.
  let knownConfigTtlMs: number | null = null;

  /** Délai du PROCHAIN réveil — jamais `configPollIntervalMs` seul (revue Reefact, PR #39) :
   * une fois le TTL effectif connu, il plafonne le délai, pour qu'un `configCacheTtlSeconds`
   * d'entreprise plus court que `configPollIntervalMs` ne laisse pas s'écouler, entre
   * l'expiration RÉELLE du cache et le prochain réveil, plus de temps que ce TTL lui-même.
   *
   * `CONFIG_POLL_MIN_INTERVAL_MS` borne le TTL, PAS le résultat final — sur `configPollIntervalMs`
   * lui-même (l'override injecté par les tests, entre autres, pour ne pas attendre les cinq
   * minutes de production pour de vrai) : le plancher protège contre un `configCacheTtlSeconds`
   * de `0` (valeur légale) qui reprogrammerait sinon un réveil immédiat en boucle serrée,
   * jamais contre un `configPollIntervalMs` délibérément COURT — les deux répondent à des
   * questions différentes, et confondre les deux plafonds aurait fait remonter à cinq
   * secondes minimum jusqu'au réglage explicite des tests. */
  const nextConfigPollDelay = (): number => {
    const effectiveTtlMs = knownConfigTtlMs === null ? configPollIntervalMs : Math.max(configPollMinIntervalMs, knownConfigTtlMs);
    return Math.min(configPollIntervalMs, effectiveTtlMs);
  };

  /** Réveil périodique, indépendant de toute mutation DOM (§8.1.2, revue Codex PR #38) :
   * un onglet resté inerte doit quand même remarquer qu'un plancher, une configuration
   * d'organisation ou de dépôt a changé une fois le TTL du résolveur écoulé. Ne lit QUE la
   * configuration — jamais `getThreads()` ni le DOM — pour rester bon marché tant que rien
   * n'a changé : la plupart des réveils ne coûtent qu'un cache hit du résolveur.
   *
   * Renvoie une promesse — jamais `void` — pour que `scheduleNextConfigPoll` reprogramme le
   * réveil SUIVANT seulement une fois celui-ci conclu, avec un `knownConfigTtlMs` à jour
   * (revue Reefact, PR #39) : reprogrammer avant coup l'aurait fait partir sur la valeur
   * encore ANCIENNE, un cycle de retard derrière le TTL réellement en vigueur. */
  const pollConfig = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    const pr = currentPrOf(adapter);
    if (!pr) return Promise.resolve(); // rien à surveiller hors PR
    // La référence n'est posée qu'APRÈS un rendu réel (voir `run()`, plus bas) — jamais ici :
    // sinon un changement survenu AVANT le tout premier réveil s'établirait lui-même comme
    // référence, sans jamais être détecté.
    if (lastRenderConfigSignature === null) return Promise.resolve();
    return resolver.resolve(adapter, pr).then((resolved) => {
      if (disposed) return;
      knownConfigTtlMs = resolved.config.configCacheTtlSeconds * 1000;
      if (renderConfigSignatureOf(resolved) === lastRenderConfigSignature) return;
      forceRender = true;
      run();
    });
  };
  /** Reprogramme le réveil à venir, en écrasant celui déjà en attente s'il y en a un
   * (revue Reefact, PR #39) : sans ce remplacement, le tout premier réveil — programmé
   * AVANT même le premier rendu, donc avant que `knownConfigTtlMs` ne soit connu — resterait
   * calé sur le seul `configPollIntervalMs` jusqu'à son terme, quel que soit le TTL appris
   * entre-temps par ce tout premier rendu. Rappelée depuis `run()` dès qu'un rendu apprend
   * un TTL plus frais, elle raccourcit alors l'attente au lieu de laisser filer un délai
   * déjà obsolète dès sa programmation. Idempotente sur un onglet actif : chaque rendu la
   * rappelle, ce qui repousse d'autant le réveil — sans conséquence, puisqu'un onglet qui
   * rend encore n'est justement pas la situation que ce réveil existe pour couvrir. */
  const scheduleNextConfigPoll = (): void => {
    if (disposed || configPollIntervalMs <= 0) return;
    if (configPollTimer !== null) clearTimeout(configPollTimer);
    configPollTimer = setTimeout(() => void pollConfig().finally(scheduleNextConfigPoll), nextConfigPollDelay());
  };
  scheduleNextConfigPoll();

  const run = (): void => {
    if (disposed) return;
    if (inFlight) {
      missedMutation = true; // traité en une seule relance temporisée à la fin du rendu en cours
      return;
    }
    const key = prKeyFor(currentPrOf(adapter));
    const nowMs = now();
    const navigated = !hasRendered || key !== lastPrKey;
    if (navigated) {
      hasRendered = true;
      lastPrKey = key;
      // AVANT tout rendu : c'est ici que la PR affichée change, et l'armement de la
      // télémétrie doit suivre ce changement-là, pas celui d'un éditeur.
      onPrChange(currentPrOf(adapter), true, null);
      showedSomething = false;
      lastOwnSig = null;
      retryUntil = nowMs + RENDER_RETRY_WINDOW_MS;
      selectedLabel = null; // nouveau contexte de PR : le filtre repart à zéro
      bannerOpen = null; // et le pliage aussi : le choix portait sur une autre PR
      bannerBlocked = null;
      // Nouvelle PR : la référence de config du sondage périodique portait sur l'ancienne,
      // et comparer les deux n'aurait aucun sens. Le prochain sondage établira une nouvelle
      // référence sans forcer de rendu (voir `pollConfig`).
      lastRenderConfigSignature = null;
    }
    // Sonde le bouton de complétion (chromeSignatureOf) seulement dans la fenêtre
    // d'hydratation de CETTE PR — jamais indéfiniment (§9.4, cf. chromeSignatureOf).
    const probeCompletionControl = navigated || nowMs <= retryUntil;
    const chromeSig = key === null ? null : chromeSignatureOf(adapter, probeCompletionControl);
    // Lu à CHAQUE tour, y compris quand `showedSomething` est vrai : c'est la référence que
    // la branche « rien montré » compare, et la laisser se figer sur un tour sauté ferait
    // dépendre le réveil de l'ordre des tours.
    const contentSig = key === null ? null : contentSignatureOf(adapter);
    if (!navigated && !forceRender) {
      if (showedSomething) {
        // Deux versants, et il faut les deux : l'état de la PLATEFORME a-t-il changé, et ce
        // que notre dernier rendu a laissé est-il toujours là, intact ? Une racine éditée sur
        // place ou un bandeau emporté par une réhydratation ne bougent que le second.
        // Sans PR affichée, ce second versant n'existe pas — nous n'avons rien à protéger sur
        // une page qui n'est pas une PR, et le mesurer y ferait réagir cette observation à
        // des écritures qui ne sont pas les siennes.
        const ownSig = key === null ? null : ownOutputSignatureOf(adapter, doc);
        if (chromeSig === lastChromeSig && ownSig === lastOwnSig) return; // rien de neuf à montrer
      } else if (nowMs > retryUntil && contentSig === lastContentSig) {
        // Fenêtre d'hydratation écoulée, rien montré — et la page n'a TOUJOURS pas bougé.
        // La seconde moitié de cette condition est le correctif (revue Reefact, PR #49) :
        // sans elle, la fenêtre était une date de PÉREMPTION et non une borne au martèlement.
        // Le cas se voit sur `Files changed`, qui ne rend AUCUNE description de PR (§4.1) :
        // tant qu'aucun fil n'existe, cette vue n'a rien à montrer, l'observateur se taisait
        // cinq secondes plus tard, et le premier commentaire inline publié ensuite ne
        // recevait ni badge ni bandeau avant un rechargement complet. Le compte des corps
        // rendus le réveille désormais — et une page qui ne bouge pas ressort toujours ici,
        // sans rendre, ce que garde le test « une PR réellement vide n'est pas retentée
        // indéfiniment ».
        //
        // `contentSig`, jamais `chromeSig` : ce dernier porte la sonde du bouton de
        // complétion, qui bascule à `'?'` au franchissement de cette même fenêtre (voir
        // `chromeSignatureOf`) — la comparaison y verrait un changement à chaque fois, pour
        // une page identique, et rendrait la borne inopérante.
        return;
      }
    }
    // Consommé ici, que le rendu ait été déclenché par `forceRender` ou non : un
    // `pollConfig` qui l'a posé pendant qu'un rendu était déjà en vol (`inFlight`, plus
    // haut) le laisse survivre jusqu'à la relance temporisée qui le consommera à son tour —
    // jamais perdu, jamais consommé deux fois pour un seul écart constaté.
    forceRender = false;
    lastChromeSig = chromeSig;
    lastContentSig = contentSig;
    inFlight = true;
    // Une navigation peut survenir pendant les lectures asynchrones : le rendu vérifie
    // alors qu'il porte toujours sur la PR affichée avant d'écrire quoi que ce soit.
    // `disposed` entre dans la validité du rendu, et pas seulement la clé de PR : révoquée
    // pendant que `resolver.resolve()` ou `getThreads()` sont en vol, l'observation
    // déconnecte bien l'observateur, mais CE rendu-là aboutirait quand même et écrirait dans
    // une page dont elle ne sait plus rien (revue Codex, PR #26).
    void renderPrChrome(adapter, resolver, doc, () => !disposed && key === prKeyFor(currentPrOf(adapter)), {
      get: () => selectedLabel,
      set: (label) => {
        selectedLabel = label;
      },
    }, {
      // Le défaut ne s'applique qu'au premier montage sur cette PR, ou lorsque le caractère
      // bloquant a changé — là, la situation n'est plus celle sur laquelle l'utilisateur
      // s'était prononcé. Entre les deux, son choix tient.
      resolve: (blocksMerge) => {
        if (bannerBlocked !== blocksMerge) {
          bannerBlocked = blocksMerge;
          bannerOpen = null;
        }
        return bannerOpen ?? blocksMerge;
      },
      set: (open) => {
        bannerOpen = open;
      },
      clear: () => {
        bannerOpen = null;
        bannerBlocked = null;
      },
    })
      .then(({ showed, resolved }) => {
        // La PR AFFICHÉE MAINTENANT, jamais `lastPrKey` (revue Codex, PR #39) : `lastPrKey`
        // n'est réécrite que par un `run()` qui PROCÈDE jusqu'à sa branche `navigated` — un
        // `run()` qui arrive pendant que CE rendu-ci est encore `inFlight` se contente de
        // poser `missedMutation` et ressort aussitôt, sans y toucher. Une navigation survenue
        // pendant les lectures asynchrones de ce rendu (`getThreads()`, `resolver.resolve()`)
        // laissait donc `lastPrKey` égal à `key` malgré le changement de PR réel : ce garde-fou
        // ne détectait rien, et `onPrChange` plus bas publiait la configuration de l'ANCIENNE
        // PR pour un éditeur déjà découvert sur la NOUVELLE — ses règles de dépôt restaient
        // celles d'un autre repository jusqu'à un tout AUTRE changement visible.
        if (key !== prKeyFor(currentPrOf(adapter))) return; // supplanté par une navigation : ce rendu ne fait plus foi
        // Ce rendu a résolu la configuration effective — éventuellement une NOUVELLE, le
        // cache du résolveur ayant expiré. La télémétrie doit s'aligner sur celle-là, sans
        // désarmer : `changed: false` recalcule la cible et ne vidange que si elle diffère.
        // `resolved` — CELLE que ce rendu vient d'appliquer, jamais une relecture séparée —
        // laisse aussi `bootstrap()` rafraîchir les éditeurs déjà attachés (revue Codex, PR
        // #39) : un éditeur ouvert avant ce rendu garde sinon la configuration figée à son
        // propre `attach()`, sans jamais apprendre qu'elle vient de changer.
        if (!navigated) onPrChange(currentPrOf(adapter), false, resolved);
        showedSomething = showed;
        // Photo prise ICI, une fois nos badges posés et nos surfaces montées : c'est ce que
        // la page doit encore porter au prochain réveil. Toute différence constatée ensuite
        // vient d'une main extérieure, jamais de la nôtre.
        lastOwnSig = key === null ? null : ownOutputSignatureOf(adapter, doc);
        // Référence du sondage périodique (`pollConfig`), alignée EXACTEMENT sur ce que CE
        // rendu vient d'appliquer — jamais sur une relecture séparée, qui ouvrirait une
        // fenêtre où `configCacheTtlSeconds: 0` (valeur légale) la ferait déjà diverger de
        // ce que la page affiche réellement (revue Codex, PR #39).
        lastRenderConfigSignature = resolved ? renderConfigSignatureOf(resolved) : null;
        // TTL appris ICI aussi, pas seulement par `pollConfig` (revue Reefact, PR #39) :
        // une navigation ou une mutation peuvent résoudre une config plus fraîche — donc un
        // TTL plus fraîchement connu — bien avant le prochain réveil périodique.
        if (resolved) {
          knownConfigTtlMs = resolved.config.configCacheTtlSeconds * 1000;
          // Raccourcit le réveil déjà programmé si ce TTL, fraîchement appris, est plus
          // strict que ce sur quoi il était calé (revue Reefact, PR #39) — voir
          // `scheduleNextConfigPoll`.
          scheduleNextConfigPoll();
        }
      })
      .finally(() => {
        inFlight = false;
        if (missedMutation && retryTimer === null && !disposed) {
          missedMutation = false;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            run();
          }, RENDER_RETRY_THROTTLE_MS);
        }
      });
  };

  run();
  const observer = new MutationObserver(run);
  // `characterData` en plus de `childList` (§5.5) : la ligne cc/1 ou un fil peuvent être mis
  // à jour par une mutation de TEXTE sur un nœud déjà en place, pas seulement par un ajout/
  // retrait de nœud — sans quoi ce cas précis échapperait à l'observateur, contredisant « dès
  // qu'il est présent » (§5.5). `run()` reste bon marché sur un déclenchement sans rien de
  // neuf : une comparaison de clé/signature, puis un retour immédiat.
  observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  return () => {
    disposed = true;
    observer.disconnect();
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (configPollTimer !== null) {
      clearTimeout(configPollTimer);
      configPollTimer = null;
    }
  };
}

/** Rend le bandeau et l'état de complétion pour la PR courante. `showed` vaut `true` quand
 * l'issue est définitive — rien à retenter tant que la PR ne change pas (pas de PR, mode
 * `off`, ou bandeau effectivement affiché) — et `false` quand la PR est active mais que
 * rien n'a été trouvé à montrer : ce cas-là reste ambigu (page encore en cours
 * d'hydratation, ou PR réellement sans fil ni statut) et `observePrChromeNavigation` doit
 * retenter au prochain signe de vie de la page plutôt que de conclure trop tôt.
 *
 * `resolved` porte la configuration EFFECTIVEMENT appliquée par CE rendu — `null`
 * uniquement quand aucune PR n'est affichée, seul cas où `resolver.resolve()` n'est jamais
 * appelé. L'appelant s'en sert pour tenir sa propre référence (§8.1.2) et pour rafraîchir
 * les éditeurs déjà attachés (revue Codex, PR #39) : la relire lui-même par un second
 * `resolver.resolve()` ouvrait une fenêtre où, `configCacheTtlSeconds` valant `0` (valeur
 * légale), cette seconde lecture peut renvoyer une configuration DÉJÀ différente de celle
 * que ce rendu vient d'appliquer — la référence retenue ne correspondrait alors plus à la
 * page réellement affichée. */
async function renderPrChrome(
  adapter: PlatformAdapter,
  resolver: ClientConfigResolver,
  doc: Document,
  // Une navigation plus récente peut avoir supplanté celle-ci pendant les résolutions
  // asynchrones ci-dessous (§ observePrChromeNavigation) : par défaut (appel direct, hors
  // navigation observée) toujours actuel.
  isCurrent: () => boolean = () => true,
  // Filtre par label persistant à travers les rendus répétés sur la MÊME PR (§5.5) — porté
  // par observePrChromeNavigation, jamais par cette fonction qui reconstruit la barre de
  // puces depuis rien à chaque appel.
  filterState: { get: () => string | null; set: (label: string | null) => void } = {
    get: () => null,
    set: () => {},
  },
  // Pliage du bandeau, même raison et même portée que `filterState` (§5.5) : `resolve` rend
  // l'ouverture à appliquer pour la situation courante, `set` enregistre un choix de
  // l'utilisateur.
  bannerState: {
    resolve: (blocksMerge: boolean) => boolean;
    set: (open: boolean) => void;
    clear: () => void;
  } = {
    resolve: (blocksMerge) => blocksMerge,
    set: () => {},
    clear: () => {},
  }
): Promise<{ showed: boolean; resolved: ResolvedClientConfig | null }> {
  const clearStaleBanner = () => {
    // Un fil masqué par le filtre local du §5.5 (applyLabelFilter) porte un `display:
    // none` posé sur l'élément de PAGE, pas sur la barre qu'on s'apprête à retirer : une
    // barre reconstruite repart sur « tous », mais sans ce geste les fils resteraient
    // masqués pour rien, orphelins du filtre qui les a cachés.
    // clearLabelFilter ne touche QUE ce que ce filtre avait lui-même masqué — jamais un
    // `display` que la plateforme porte pour ses propres raisons (fil réduit, virtualisé).
    clearLabelFilter(renderedThreadsOf(adapter));
    for (const stale of doc.querySelectorAll('.cct-banner')) stale.remove();
    for (const stale of doc.querySelectorAll('.cct-thread-filter')) stale.remove();
  };
  // Défait le rendu des commentaires publiés (§5.5) — seulement quand on quitte le contexte
  // qui le justifiait (plus de PR, ou extension désactivée) : un rendu normal ne doit JAMAIS
  // passer par ici, sous peine de défaire puis refaire le même rendu à chaque relecture, sans
  // bénéfice, juste du DOM churn.
  //
  // TOUT ce que pose `decorateComment`, pas seulement ce qui se voit : ne retirer que les
  // badges laissait le préfixe structuré masqué, donc une partie du texte de l'auteur invisible,
  // posée par une extension qui se déclare pourtant inactive (§7).
  const clearDecorations = () => {
    clearCommentDecorations(doc);
  };

  const pr = currentPrOf(adapter);
  if (!pr) {
    if (isCurrent()) {
      clearStaleBanner();
      clearDecorations();
    }
    return { showed: true, resolved: null }; // pas de PR : rien à retenter tant que la navigation ne change pas
  }
  const resolved = await resolver.resolve(adapter, pr);
  writeDegradedState(resolved.degraded, resolved.degradedReason); // §9.2.3 — visible dans les options
  if (resolved.config.mode === 'off') {
    if (isCurrent()) {
      clearStaleBanner();
      clearDecorations();
      // §7 : mode off = extension entièrement inactive. Un grisage posé par un rendu
      // ANTÉRIEUR (mode enforce/warn encore actif à ce moment-là) ne doit pas survivre au
      // passage à off — sinon aria-disabled/cct-merge-blocked/title restent affichés par
      // une extension qui prétend ne plus intervenir. `lang` est sans effet ici : la
      // branche de dégrisage de applyCompletionState ne le lit pas.
      applyCompletionState(adapter.getCompletionControl(), null, '');
    }
    return { showed: true, resolved }; // désactivé : un état délibéré, pas un chargement encore en cours
  }
  const lang = resolveUiLanguage(await readUserLanguage(), resolved.config, doc.documentElement.lang || null);
  const profile = adapter.platformProfile();

  const threads = await adapter.getThreads();
  // Lu APRÈS le dernier `await`, jamais avant : `isCurrent()` ne protège que contre un
  // changement de PR (§ observePrChromeNavigation), pas contre un second changement du
  // résumé publié survenant PENDANT ces résolutions asynchrones sur la MÊME PR — une
  // lecture faite plus tôt écrirait alors un résumé déjà périmé. Aucun `await` ne sépare
  // plus cette lecture de son utilisation : rien ne peut plus s'intercaler avant l'écriture
  // (§5.5, CA-03).
  const published = adapter.readPublishedResult();
  if (!isCurrent()) return { showed: true, resolved }; // supplanté entre-temps : la navigation suivante prend le relais
  clearStaleBanner(); // efface le bandeau d'un contexte précédent avant d'insérer le sien
  const model = buildBannerModel(
    published,
    threads,
    resolved.config,
    profile.id,
    profile.suggestionInfoString
  );
  // Le rendu a une issue définitive dès qu'il y a quelque chose à montrer OU à filtrer :
  // le filtre par label du §5.5 porte sur la liste des fils, pas sur les seuls fils
  // bloquants — une page sans fil bloquant mais avec des fils reste filtrable (composant B
  // non déployé compris, §10). Ce que chacune des deux surfaces affiche ensuite est décidé
  // séparément : le bandeau se tait sur un décompte nul, le filtre n'existe pas sans fil.
  // Le bandeau disparaît (décompte retombé à zéro) : le choix de pliage s'efface avec lui.
  // Sans cela, un fil bloquant APPARU ENSUITE rouvrirait sur la décision que l'utilisateur
  // avait prise pour la situation précédente — repliée — au lieu de son défaut déplié : le
  // caractère bloquant n'aurait pas « changé » entre les deux rendus qui portent un bandeau
  // (revue Codex, PR #26).
  if (!bannerHasContent(model)) bannerState.clear();

  const hasSomethingToShow = model.count > 0 || published !== null || threads.length > 0;
  if (hasSomethingToShow) {
    const labelOfThread = new Map<string, string | null>();
    for (const t of threads) {
      const a = analyze(
        {
          body: t.root.body,
          platform: profile,
          isSystemGenerated: t.root.isSystemGenerated,
          zone: 'thread-root',
          canCarryBlockingState: t.canCarryBlockingState,
          author: t.root.author,
        },
        resolved.config
      );
      labelOfThread.set(t.id, a.resolved?.label.id ?? null);
    }

    if (bannerHasContent(model)) {
      const banner = renderBanner(model, published, lang, {
        open: bannerState.resolve(bannerBlocksMerge(published)),
        onToggle: (open) => bannerState.set(open),
      });
      // « En tête de PR » (§5.5) : après l'en-tête que l'adaptateur désigne, donc dans le
      // flux de la page. Le repli sur le haut du document ne vaut que si rien n'apparie —
      // au-dessus du chrome de la plateforme, un encart flottant se lit comme une greffe,
      // pas comme une partie de la PR.
      const mount = bannerMountOf(adapter);
      if (mount?.parentNode) mount.insertAdjacentElement('afterend', banner);
      else doc.body.insertAdjacentElement('afterbegin', banner);
    }

    // Filtre local par label, « dans la liste des fils de discussion » (§5.5) : en tête des
    // fils rendus, jamais dans le bandeau. Seuls les labels effectivement PRÉSENTS sur la
    // page sont proposés — filtrer sur un label qu'aucun fil ne porte ne masquerait que
    // tout, et treize puces pour trois fils sont un décor, pas un outil.
    const rendered = renderedThreadsOf(adapter);
    const present = new Set([...labelOfThread.values()].filter((id): id is string => id !== null));
    const filterLabelIds = enabledLabels(resolved.config)
      .map((l) => l.id)
      .filter((id) => present.has(id));
    let selectedLabel = filterState.get();
    if (selectedLabel !== null && !filterLabelIds.includes(selectedLabel)) {
      // Le label sélectionné a disparu des puces reconstruites — configuration rafraîchie
      // sur la MÊME PR (§5.5, revue Codex round 5), ou dernier fil qui le portait résolu :
      // la sélection mémorisée doit suivre, sous peine de continuer à filtrer sur un label
      // fantôme pendant que l'affichage dit « tous ».
      selectedLabel = null;
      filterState.set(null);
    }
    if (rendered.length > 0 && filterLabelIds.length > 0) {
      const filter = renderThreadFilter({
        labels: filterLabelIds,
        lang,
        selected: selectedLabel,
        onSelect: (labelId) => {
          filterState.set(labelId);
          applyLabelFilter(renderedThreadsOf(adapter), labelOfThread, labelId);
          for (const chip of filter.querySelectorAll('.cct-filter-chip')) {
            chip.setAttribute('aria-pressed', String((chip as HTMLElement).dataset['label'] === (labelId ?? '')));
          }
        },
      });
      rendered[0]!.element.insertAdjacentElement('beforebegin', filter);
      // Réapplique le filtre restauré aux fils de PAGE — renderThreadFilter n'a positionné
      // que l'état des puces, pas le `display` des fils (§5.5).
      if (selectedLabel !== null) applyLabelFilter(rendered, labelOfThread, selectedLabel);
    }
  }

  // Repassé par la porte : la navigation ou la révocation ont pu survenir APRÈS celle du
  // bandeau, ces deux écritures-ci étant les dernières du rendu. Le décompte reste rendu
  // (`hasSomethingToShow`), seul l'effet de bord est abandonné.
  if (!isCurrent()) return { showed: hasSomethingToShow, resolved };

  // Badges des commentaires publiés (§5.5) — rendu visuel, contenu stocké intact.
  const withRendered = adapter as PlatformAdapter & {
    getRenderedComments?: () => { element: Element; bodyText: string }[];
  };
  if (withRendered.getRenderedComments) {
    for (const { element, bodyText } of withRendered.getRenderedComments()) {
      decorateComment(element, bodyText, resolved.config, profile, lang);
    }
  }

  applyCompletionState(adapter.getCompletionControl(), published, lang);
  // Des commentaires rendus valent, EUX AUSSI, une issue définitive — au même titre qu'un
  // bandeau affiché. `hasSomethingToShow` ne regardait que le bandeau et son décompte
  // (résumé publié, fils) : sur une PR dont l'extension ne montre RIEN D'AUTRE que les
  // badges de ses commentaires — composant B non déployé (§10), aucun fil de revue —, ce
  // rendu concluait `showed: false` indéfiniment. `observePrChromeNavigation` traite ce
  // `false` comme « la page s'hydrate encore, réessaie » : passé `RENDER_RETRY_WINDOW_MS`,
  // il cesse alors de rendre TOUT COURT, et plus aucune mise à jour de commentaire ne
  // reçoit ses badges — la fenêtre d'hydratation devenait une date de péremption pour la
  // seule surface que cette PR affichait. `showed: true` ne fige rien : la reprise passe
  // alors par les signatures (`chromeSignatureOf`/`ownOutputSignatureOf`), qui rendent dès
  // que quoi que ce soit change — strictement plus réactif que l'expiration d'une fenêtre.
  //
  // Le compte vient de la SONDE de plateforme, et non du nombre de commentaires que la
  // boucle ci-dessus vient de décorer : depuis que la description de la PR est écartée des
  // badges (§4.1), les deux diffèrent d'exactement un sur une page de conversation — et une
  // PR encore SANS AUCUN COMMENTAIRE serait retombée à zéro, donc `showed: false`, donc
  // muette après `RENDER_RETRY_WINDOW_MS` : le premier commentaire posté n'aurait plus reçu
  // ses badges avant un rechargement. Ce que ce booléen a toujours voulu dire est « la page
  // portait des corps de commentaire », pas « nous avons peint quelque chose » — un
  // commentaire sans préfixe était déjà compté sans recevoir le moindre badge.
  return { showed: hasSomethingToShow || renderedCommentCountOf(adapter) > 0, resolved };
}

/** Porte le `title`/`aria-disabled` NATIFS du bouton (branche protégée, revue requise…)
 * capturés juste avant de les écraser par notre propre grisage — jamais réappliqués tant
 * que la classe posée par nous est déjà là, sous peine d'écraser la valeur capturée par
 * notre PROPRE écriture lors d'un second cycle échec→échec. Chaîne vide = attribut natif
 * absent (absence et valeur `""` se restaurent de la même façon : retrait de l'attribut) —
 * un `aria-disabled="true"` natif préexistant serait sinon indiscernable du nôtre, qu'on
 * pose avec la MÊME valeur, et se ferait retirer avec lui au dégrisage. */
const NATIVE_TITLE_MARKER = 'cctNativeTitle';
const NATIVE_ARIA_DISABLED_MARKER = 'cctNativeAriaDisabled';

/** §6.5 : grise le bouton de complétion si et seulement si PublishedSummary.state vaut
 * 'failure' — jamais à partir des compteurs. Visuel : le clic n'est PAS intercepté. */
export function applyCompletionState(
  control: SubmitControl | null,
  published: PublishedSummary | null,
  lang: string
): void {
  if (!control) return;
  if (published?.state === 'failure') {
    if (!control.element.classList.contains('cct-merge-blocked')) {
      (control.element as HTMLElement).dataset[NATIVE_TITLE_MARKER] = control.element.getAttribute('title') ?? '';
      (control.element as HTMLElement).dataset[NATIVE_ARIA_DISABLED_MARKER] =
        control.element.getAttribute('aria-disabled') ?? '';
    }
    control.element.setAttribute('aria-disabled', 'true');
    control.element.classList.add('cct-merge-blocked');
    control.element.setAttribute('title', ui(lang, 'merge.blocked'));
  } else if (control.element.classList.contains('cct-merge-blocked')) {
    // aria-disabled et title sont tous deux restaurés à leur valeur NATIVE capturée plus
    // haut, jamais simplement retirés — sinon un état natif préexistant (branche protégée,
    // revue requise…) disparaît pour de bon après un seul cycle de grisage.
    const nativeAriaDisabled = (control.element as HTMLElement).dataset[NATIVE_ARIA_DISABLED_MARKER];
    if (nativeAriaDisabled) control.element.setAttribute('aria-disabled', nativeAriaDisabled);
    else control.element.removeAttribute('aria-disabled');
    delete (control.element as HTMLElement).dataset[NATIVE_ARIA_DISABLED_MARKER];
    const nativeTitle = (control.element as HTMLElement).dataset[NATIVE_TITLE_MARKER];
    if (nativeTitle) control.element.setAttribute('title', nativeTitle);
    else control.element.removeAttribute('title');
    delete (control.element as HTMLElement).dataset[NATIVE_TITLE_MARKER];
    control.element.classList.remove('cct-merge-blocked');
  }
}
