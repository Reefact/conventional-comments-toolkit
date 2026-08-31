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

import type { ConfigRead, Floor, PrRef, PublishedSummary } from '@cct/core';
import type { PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { analyze, enabledLabels } from '@cct/core';
import { ClientConfigResolver, resolveUiLanguage } from './config-resolver.js';
import {
  EMPTY_EXTRA_HOSTS,
  EXTRA_HOSTS_KEY,
  selectPlatform,
  type ExtraHostsByPlatform,
} from './host-platform.js';
import { DEFAULT_DIRECT_SHORTCUTS, EditorController } from './editor-controller.js';
import { bannerBlocksMerge, bannerHasContent, buildBannerModel, renderBanner } from './ui/banner.js';
import { applyLabelFilter, clearLabelFilter, renderThreadFilter } from './ui/thread-filter.js';
import { decorateComment } from './ui/badges.js';
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
 * à chaque résolution de configuration. */
export function writeDegradedState(degraded: boolean): void {
  try {
    chrome?.storage?.local?.set?.({ degradedState: degraded ? 'unreachable' : false });
  } catch {
    // Hors contexte d'extension (tests) : sans conséquence.
  }
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
  const readOrgConfig = hasExtensionRelay() ? relayOrgConfigRead : undefined;

  const adapter: PlatformAdapter & { matchesHost(url: URL): boolean } =
    platform === 'github'
      ? new GithubClientAdapter({ documentRef: doc, extraHosts: extraHosts.github, readOrgConfig })
      : new AzdoClientAdapter({ documentRef: doc, extraHosts: extraHosts.azdo, readOrgConfig });

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
  const attached = new Set<{ controller: EditorController; element: Element }>();

  /** Libère les contrôleurs dont l'éditeur a quitté le document.
   *
   * Sans cela, le `Set` ci-dessus — introduit pour que la révocation défasse les
   * contrôleurs — retenait aussi tous les contrôleurs MORTS, avec leur DOM détaché, leur
   * configuration et l'adaptateur, jusqu'à la fermeture de l'onglet. Sur une page de revue
   * en SPA, où l'on ouvre et referme des éditeurs en continu, cela grossit sans borne.
   * Avant l'introduction du `Set` ces objets étaient collectables : le correctif de la
   * révocation avait donc créé une fuite (revue Codex, PR #29).
   *
   * Le nettoyage se fait à chaque attachement plutôt que sur un minuteur : c'est le seul
   * instant où l'on sait qu'un éditeur vient d'apparaître, donc qu'un autre a pu partir. */
  const releaseDetached = (): void => {
    for (const entry of attached) {
      if (entry.element.isConnected) continue;
      entry.controller.dispose();
      attached.delete(entry);
    }
  };

  const attach = async (editor: Parameters<Parameters<PlatformAdapter['observeEditors']>[0]>[0]) => {
    if (disposed) return;
    // Résolution hors chemin critique : la NFR d'injection porte sur l'appel du cb (§10).
    const resolved = await resolver.resolve(adapter, editor.context.pr);
    writeDegradedState(resolved.degraded); // §9.2.3 — visible dans les options
    if (resolved.config.mode === 'off') return; // §7 — extension inactive
    const published = adapter.readPublishedResult();
    const lang = resolveUiLanguage(await readUserLanguage(), resolved.config, doc.documentElement.lang || null);
    const controller = new EditorController({
      adapter,
      editor,
      resolved,
      published,
      lang,
      currentUserLogin: currentUser.login,
      directShortcuts: await readDirectShortcuts(), // §5.2 — préférence locale (§8.1.2)
    });
    if (disposed) return; // révoqué pendant les lectures ci-dessus : ne rien installer
    controller.attach();
    releaseDetached();
    attached.add({ controller, element: editor.element });
  };

  const editors = adapter.observeEditors((editor) => void attach(editor));

  // Bandeau (§5.5) et grisage du bouton de complétion (§6.5) — ré-armés à chaque
  // navigation SPA vers un contexte de PR différent, pas seulement au chargement initial
  // du script : Turbo/React ne rechargent pas le document, donc sans ce ré-armement la
  // barre reste absente d'une PR atteinte par un lien interne tant qu'un rechargement
  // complet ne relance pas bootstrap().
  const stopPrChrome = observePrChromeNavigation(adapter, resolver, doc);
  const revoke = () => {
    disposed = true;
    editors.dispose();
    stopPrChrome();
    for (const { controller } of attached) controller.dispose();
    attached.clear();
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

/** Signature légère du résumé publié (§5.5, §6.5, §8.1.3 règle 2, CA-03) : par valeur, pas
 * par identité d'objet — l'adaptateur peut renvoyer un objet neuf à chaque lecture. Les
 * quatre champs sont EXACTEMENT ceux que le rendu affiche — `state` pilote le grisage
 * §6.5, `unresolvedBlockingCount` le titre du bandeau, `mode` et `coreVersion` la ligne
 * « jugée par … » (`ui/banner.ts`, `banner.judged`) : un check qui se termine à nouveau
 * avec le même décompte mais un `core` ou un `mode` différent doit rester détecté. */
export function publishedSignatureOf(adapter: PlatformAdapter): string | null {
  const p = adapter.readPublishedResult();
  return p ? `${p.state}|${p.unresolvedBlockingCount}|${p.mode}|${p.coreVersion}` : null;
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
  const withRendered = adapter as PlatformAdapter & {
    getRenderedCommentCount?: () => number;
    getRenderedComments?: () => unknown[];
  };
  const published = publishedSignatureOf(adapter) ?? '';
  const completion = probeCompletionControl ? (adapter.getCompletionControl() !== null ? '1' : '0') : '?';
  const rendered = renderedThreadsOf(adapter);
  const threadIds = rendered.map((t) => t.id).join(',');
  // Sonde le COMPTE, jamais getRenderedComments() : cette dernière calcule bodyText (clone
  // du sous-arbre dès qu'un badge est posé) pour chaque commentaire, un coût proportionnel
  // à tout le DOM des commentaires rendus, à chaque mutation, pour la durée de vie de
  // l'onglet. Repli sur getRenderedComments().length pour les adaptateurs (de test) qui
  // n'exposent pas la sonde dédiée.
  const commentCount = withRendered.getRenderedCommentCount?.() ?? withRendered.getRenderedComments?.().length ?? 0;
  return `${published}|${completion}|${threadIds}|${commentCount}`;
}

/** Ce que NOTRE rendu écrit dans la page, et que la plateforme peut défaire : le texte des
 * fils — nos badges y entrent — et la présence de nos deux surfaces (§5.5). Deux angles
 * morts que le décompte seul laissait ouverts (revue Codex, PR #26) :
 *
 * - une racine éditée SUR PLACE (`issue: a` corrigé en `issue: b`) ne change ni le nombre de
 *   fils, ni leurs identifiants, ni le nombre de commentaires — la signature de plateforme
 *   restait identique, `run()` sortait avant de reconstruire, et le bandeau, qui affiche
 *   désormais le SUJET, gardait un texte périmé ;
 * - une réhydratation React qui remplace le parent auquel le bandeau est adossé
 *   (`bannerMount`) emporte notre élément sans rien changer à cet état de plateforme : rien
 *   ne le faisait revenir.
 *
 * **Capturée APRÈS le rendu, jamais avant.** C'est tout l'intérêt de la séparer de
 * `chromeSignatureOf` : nos badges et nos insertions modifient précisément ce qu'elle
 * mesure. Comparée à une photo prise AVANT notre écriture, chaque rendu se re-déclencherait
 * lui-même — un cycle de rendu supplémentaire à chaque passage, qui déstabilise la
 * coalescence des mutations et retarde d'autant le retrait d'un bandeau périmé. Comparée à
 * l'état laissé par le rendu précédent, seule une main EXTÉRIEURE la fait bouger. */
function ownOutputSignatureOf(adapter: PlatformAdapter, doc: Document): string {
  return `${textDigestOf(renderedThreadsOf(adapter))}|${injectedSurfacesOf(doc)}`;
}

/** Empreinte 32 bits (FNV-1a) du texte des fils rendus. Le coût est assumé et reste bien
 * inférieur à celui que `getRenderedComments()` fait rejeter plus haut : une lecture de
 * `textContent` par conteneur de fil et un passage sur ses caractères, là où l'autre CLONE
 * le sous-arbre de chaque commentaire. */
function textDigestOf(renderedThreads: { id: string; element: Element }[]): string {
  let hash = 0x811c9dc5;
  for (const { element } of renderedThreads) {
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
  now: () => number = Date.now
  /** Révoque l'observation : déconnecte l'observateur et annule un rattrapage en attente.
   * Sans emploi en production — l'observateur vit le temps de l'onglet — mais nécessaire à
   * tout appelant qui n'est PAS un onglet : deux observations concurrentes sur le même
   * document se répondent l'une à l'autre, chacune voyant dans les écritures de l'autre une
   * page modifiée sous elle. */
): (() => void) {
  let lastPrKey: string | null = null;
  let lastChromeSig: string | null = null;
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
      showedSomething = false;
      lastOwnSig = null;
      retryUntil = nowMs + RENDER_RETRY_WINDOW_MS;
      selectedLabel = null; // nouveau contexte de PR : le filtre repart à zéro
      bannerOpen = null; // et le pliage aussi : le choix portait sur une autre PR
      bannerBlocked = null;
    }
    // Sonde le bouton de complétion (chromeSignatureOf) seulement dans la fenêtre
    // d'hydratation de CETTE PR — jamais indéfiniment (§9.4, cf. chromeSignatureOf).
    const probeCompletionControl = navigated || nowMs <= retryUntil;
    const chromeSig = key === null ? null : chromeSignatureOf(adapter, probeCompletionControl);
    if (!navigated) {
      if (showedSomething) {
        // Deux versants, et il faut les deux : l'état de la PLATEFORME a-t-il changé, et ce
        // que notre dernier rendu a laissé est-il toujours là, intact ? Une racine éditée sur
        // place ou un bandeau emporté par une réhydratation ne bougent que le second.
        // Sans PR affichée, ce second versant n'existe pas — nous n'avons rien à protéger sur
        // une page qui n'est pas une PR, et le mesurer y ferait réagir cette observation à
        // des écritures qui ne sont pas les siennes.
        const ownSig = key === null ? null : ownOutputSignatureOf(adapter, doc);
        if (chromeSig === lastChromeSig && ownSig === lastOwnSig) return; // rien de neuf à montrer
      } else if (nowMs > retryUntil) {
        return; // fenêtre d'hydratation écoulée, rien à montrer et toujours pas plus de contenu
      }
    }
    lastChromeSig = chromeSig;
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
      .then((showed) => {
        if (key !== lastPrKey) return; // supplanté par une navigation : ce rendu ne fait plus foi
        showedSomething = showed;
        // Photo prise ICI, une fois nos badges posés et nos surfaces montées : c'est ce que
        // la page doit encore porter au prochain réveil. Toute différence constatée ensuite
        // vient d'une main extérieure, jamais de la nôtre.
        lastOwnSig = key === null ? null : ownOutputSignatureOf(adapter, doc);
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
  };
}

/** Rend le bandeau et l'état de complétion pour la PR courante. Renvoie `true` quand
 * l'issue est définitive — rien à retenter tant que la PR ne change pas (pas de PR, mode
 * `off`, ou bandeau effectivement affiché) — et `false` quand la PR est active mais que
 * rien n'a été trouvé à montrer : ce cas-là reste ambigu (page encore en cours
 * d'hydratation, ou PR réellement sans fil ni statut) et `observePrChromeNavigation` doit
 * retenter au prochain signe de vie de la page plutôt que de conclure trop tôt. */
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
): Promise<boolean> {
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
  // Retire les badges posés par un rendu antérieur (§5.5) — seulement quand on quitte le
  // contexte qui les justifiait (plus de PR, ou extension désactivée) : un rendu normal
  // ne doit JAMAIS passer par ici, sous peine de retirer puis réinsérer les mêmes badges à
  // chaque relecture, sans bénéfice, juste du DOM churn.
  const clearBadges = () => {
    for (const badge of doc.querySelectorAll('.cct-badge')) badge.remove();
  };

  const pr = currentPrOf(adapter);
  if (!pr) {
    if (isCurrent()) {
      clearStaleBanner();
      clearBadges();
    }
    return true; // pas de PR : rien à retenter tant que la navigation ne change pas
  }
  const resolved = await resolver.resolve(adapter, pr);
  writeDegradedState(resolved.degraded); // §9.2.3 — visible dans les options
  if (resolved.config.mode === 'off') {
    if (isCurrent()) {
      clearStaleBanner();
      clearBadges();
      // §7 : mode off = extension entièrement inactive. Un grisage posé par un rendu
      // ANTÉRIEUR (mode enforce/warn encore actif à ce moment-là) ne doit pas survivre au
      // passage à off — sinon aria-disabled/cct-merge-blocked/title restent affichés par
      // une extension qui prétend ne plus intervenir. `lang` est sans effet ici : la
      // branche de dégrisage de applyCompletionState ne le lit pas.
      applyCompletionState(adapter.getCompletionControl(), null, '');
    }
    return true; // désactivé : un état délibéré, pas un chargement encore en cours
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
  if (!isCurrent()) return true; // supplanté entre-temps : la navigation suivante prend le relais
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
  if (!isCurrent()) return hasSomethingToShow;

  // Badges des commentaires publiés (§5.5) — rendu visuel, contenu stocké intact.
  const withRendered = adapter as PlatformAdapter & {
    getRenderedComments?: () => { element: Element; bodyText: string }[];
  };
  if (withRendered.getRenderedComments) {
    for (const { element, bodyText } of withRendered.getRenderedComments()) {
      decorateComment(element, bodyText, resolved.config, profile);
    }
  }

  applyCompletionState(adapter.getCompletionControl(), published, lang);
  return hasSomethingToShow;
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
