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

import type { Floor, PrRef, PublishedSummary } from '@cct/core';
import type { PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { analyze, enabledLabels } from '@cct/core';
import { ClientConfigResolver, resolveUiLanguage } from './config-resolver.js';
import { DEFAULT_DIRECT_SHORTCUTS, EditorController } from './editor-controller.js';
import { applyLabelFilter, buildBannerModel, clearLabelFilter, renderBanner } from './ui/banner.js';
import { decorateComment } from './ui/badges.js';
import { ui } from './ui/strings.js';

declare const chrome: {
  storage?: {
    managed?: { get: (cb: (items: Record<string, unknown>) => void) => void };
    sync?: { get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void };
    local?: { set?: (items: Record<string, unknown>) => void };
  };
  runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> };
} | undefined;

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

export async function bootstrap(doc: Document = document): Promise<void> {
  const url = new URL(doc.location.href);
  // Un seul produit, un adaptateur par plateforme, activé sur les hôtes autorisés (§2).
  // Sélection par HÔTE (matchesHost), pas par matches() — qui exige en plus une URL de
  // PR : bootstrap() ne s'exécute qu'une fois, à l'injection du script, alors que la
  // navigation SPA vers une PR arrive presque toujours ENSUITE (liste des PR,
  // notifications, tableau de bord). Exiger une PR ici laissait l'extension
  // intégralement inactive — aucun adaptateur choisi, donc aucun observateur armé — tant
  // qu'un rechargement complet ne la relançait pas directement sur l'URL de la PR.
  const adapters: (PlatformAdapter & { matchesHost(url: URL): boolean })[] = [
    new GithubClientAdapter({ documentRef: doc }),
    new AzdoClientAdapter({ documentRef: doc }),
  ];
  const adapter = adapters.find((a) => a.matchesHost(url));
  if (!adapter) return;

  const resolver = new ClientConfigResolver(readManagedFloor);
  const currentUser = await adapter.getCurrentUser();

  const attach = async (editor: Parameters<Parameters<PlatformAdapter['observeEditors']>[0]>[0]) => {
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
    controller.attach();
  };

  adapter.observeEditors((editor) => void attach(editor));

  // Bandeau (§5.5) et grisage du bouton de complétion (§6.5) — ré-armés à chaque
  // navigation SPA vers un contexte de PR différent, pas seulement au chargement initial
  // du script : Turbo/React ne rechargent pas le document, donc sans ce ré-armement la
  // barre reste absente d'une PR atteinte par un lien interne tant qu'un rechargement
  // complet ne relance pas bootstrap().
  observePrChromeNavigation(adapter, resolver, doc);
}

function currentPrOf(adapter: PlatformAdapter): PrRef | null {
  return (adapter as GithubClientAdapter | AzdoClientAdapter).currentPr?.() ?? null;
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
 * bord, `queryChainAll` ne journalise rien — restent surveillés indéfiniment. */
function chromeSignatureOf(adapter: PlatformAdapter, probeCompletionControl: boolean): string {
  const withRendered = adapter as PlatformAdapter & {
    getRenderedCommentCount?: () => number;
    getRenderedComments?: () => unknown[];
  };
  const published = publishedSignatureOf(adapter) ?? '';
  const completion = probeCompletionControl ? (adapter.getCompletionControl() !== null ? '1' : '0') : '?';
  const threadIds = renderedThreadsOf(adapter)
    .map((t) => t.id)
    .join(',');
  // Sonde le COMPTE, jamais getRenderedComments() : cette dernière calcule bodyText (clone
  // du sous-arbre dès qu'un badge est posé) pour chaque commentaire, un coût proportionnel
  // à tout le DOM des commentaires rendus, à chaque mutation, pour la durée de vie de
  // l'onglet — alors que seul le compte importe ici. Repli sur getRenderedComments().length
  // pour les adaptateurs (de test) qui n'exposent pas la sonde dédiée.
  const commentCount = withRendered.getRenderedCommentCount?.() ?? withRendered.getRenderedComments?.().length ?? 0;
  return `${published}|${completion}|${threadIds}|${commentCount}`;
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
): void {
  let lastPrKey: string | null = null;
  let lastChromeSig: string | null = null;
  let hasRendered = false;
  let showedSomething = false;
  let retryUntil = 0;
  let inFlight = false;
  let missedMutation = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // Filtre par label choisi par l'utilisateur (§5.5) — vit ICI, pas dans renderPrChrome (qui
  // reconstruit le bandeau à chaque appel, y compris sur la MÊME PR une fois D3 en jeu) : sans
  // cet état, chaque rendu répété repartirait sur « tous », perdant la sélection.
  let selectedLabel: string | null = null;

  const run = (): void => {
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
      retryUntil = nowMs + RENDER_RETRY_WINDOW_MS;
      selectedLabel = null; // nouveau contexte de PR : le filtre repart à zéro
    }
    // Sonde le bouton de complétion (chromeSignatureOf) seulement dans la fenêtre
    // d'hydratation de CETTE PR — jamais indéfiniment (§9.4, cf. chromeSignatureOf).
    const probeCompletionControl = navigated || nowMs <= retryUntil;
    const chromeSig = key === null ? null : chromeSignatureOf(adapter, probeCompletionControl);
    if (!navigated) {
      if (showedSomething) {
        if (chromeSig === lastChromeSig) return; // rien de neuf à montrer
      } else if (nowMs > retryUntil) {
        return; // fenêtre d'hydratation écoulée, rien à montrer et toujours pas plus de contenu
      }
    }
    lastChromeSig = chromeSig;
    inFlight = true;
    // Une navigation peut survenir pendant les lectures asynchrones : le rendu vérifie
    // alors qu'il porte toujours sur la PR affichée avant d'écrire quoi que ce soit.
    void renderPrChrome(adapter, resolver, doc, () => key === prKeyFor(currentPrOf(adapter)), {
      get: () => selectedLabel,
      set: (label) => {
        selectedLabel = label;
      },
    })
      .then((showed) => {
        if (key === lastPrKey) showedSomething = showed;
      })
      .finally(() => {
        inFlight = false;
        if (missedMutation && retryTimer === null) {
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
  // par observePrChromeNavigation, jamais par cette fonction qui reconstruit le bandeau (et
  // son `<select>`) depuis rien à chaque appel.
  filterState: { get: () => string | null; set: (label: string | null) => void } = {
    get: () => null,
    set: () => {},
  }
): Promise<boolean> {
  const clearStaleBanner = () => {
    // Un fil masqué par le filtre local du §5.5 (applyLabelFilter) porte un `display:
    // none` posé sur l'élément de PAGE, pas sur le bandeau qu'on s'apprête à retirer : un
    // nouveau bandeau reconstruit son propre filtre (remis sur « tous »), mais sans ce
    // geste les fils resteraient masqués pour rien, orphelins du filtre qui les a cachés.
    // clearLabelFilter ne touche QUE ce que ce filtre avait lui-même masqué — jamais un
    // `display` que la plateforme porte pour ses propres raisons (fil réduit, virtualisé).
    clearLabelFilter(renderedThreadsOf(adapter));
    for (const stale of doc.querySelectorAll('.cct-banner')) stale.remove();
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
    profile.suggestionInfoString,
    profile.slashCommands,
    profile.commandPrefixes
  );
  // Le bandeau se rend dès qu'il y a quelque chose à montrer OU à filtrer : le filtre
  // par label du §5.5 porte sur la liste des fils, pas sur les seuls fils bloquants —
  // une page sans fil bloquant mais avec des fils reste filtrable (composant B non
  // déployé compris, §10).
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
    // Fils rendus sur la page — surface d'affichage, hors contrat §9.2.3 : le filtre les
    // masque AUSSI, pas seulement les ancres du bandeau (§5.5).
    const enabledLabelIds = enabledLabels(resolved.config).map((l) => l.id);
    let selectedLabel = filterState.get();
    if (selectedLabel !== null && !enabledLabelIds.includes(selectedLabel)) {
      // Une configuration rafraîchie sur la MÊME PR (§5.5, revue Codex round 5) a désactivé
      // le label sélectionné : le `<select>` reconstruit retombe sur « tous » (aucune
      // `<option>` ne correspond) — la sélection mémorisée doit suivre, sous peine de
      // continuer à filtrer sur un label fantôme pendant que l'affichage dit « tous ».
      selectedLabel = null;
      filterState.set(null);
    }
    const banner = renderBanner(model, published, lang, {
      filterLabels: enabledLabelIds,
      selectedLabel,
      onFilter: (labelId) => {
        filterState.set(labelId);
        applyLabelFilter(banner, renderedThreadsOf(adapter), labelOfThread, labelId);
      },
    });
    // Réapplique le filtre restauré aux fils de PAGE — renderBanner n'a positionné que le
    // `<select>` lui-même, pas le `display` des fils/ancres (§5.5).
    if (selectedLabel !== null) applyLabelFilter(banner, renderedThreadsOf(adapter), labelOfThread, selectedLabel);
    doc.body.insertAdjacentElement('afterbegin', banner);
  }

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
