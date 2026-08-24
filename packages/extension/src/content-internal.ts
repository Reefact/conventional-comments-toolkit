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
import { applyLabelFilter, buildBannerModel, renderBanner } from './ui/banner.js';
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
  const adapters: PlatformAdapter[] = [
    new GithubClientAdapter({ documentRef: doc }),
    new AzdoClientAdapter({ documentRef: doc }),
  ];
  const adapter = adapters.find((a) => a.matches(url));
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

export function prKeyFor(pr: PrRef | null): string | null {
  return pr ? `${pr.host}/${pr.scope.join('/')}#${pr.number}` : null;
}

/** Borne de sûreté : nombre de rendus infructueux tolérés sur une même PR avant de cesser
 * de retenter. La convergence tient au coalescing ci-dessous (un rendu à la fois, relancé
 * une fois s'il a manqué des mutations) — cette borne garantit la terminaison même si une
 * page mute sans jamais rien faire apparaître, sans quoi une PR réellement dépourvue de fil
 * ferait retenter le rendu à chaque frappe de l'utilisateur. Réinitialisée à chaque PR. */
const MAX_EMPTY_RENDER_ATTEMPTS = 20;

/** Ré-invoque `renderPrChrome` quand le contexte de PR change (§5.5, §6.5) — navigation
 * SPA vers une PR différente (ou plus aucune) — ET, sur la MÊME PR, tant que le dernier
 * rendu n'a rien eu à montrer : au premier chargement direct d'une PR, `getThreads()` et le
 * statut publié se lisent dans le DOM, que GitHub/AzDO peuplent de façon asynchrone (fils
 * chargés en différé, statut de check encore en vol). Sans cette relance, une lecture faite
 * trop tôt reste définitive et la barre n'apparaît jamais avant un rechargement complet —
 * ce qui explique qu'elle manque parfois dès la toute première visite d'une PR, et pas
 * seulement après une navigation SPA. Le déclencheur générique — MutationObserver sur le
 * document — couvre Turbo comme les vues React qui n'émettent pas d'événement Turbo (§A.3),
 * et vaut à l'identique sur Azure DevOps (§B.3).
 *
 * Un seul rendu à la fois : le rendu écrit lui-même dans le DOM (bandeau, badges), donc
 * réagir à chaque mutation sans coalescing ferait boucler l'observateur sur ses propres
 * écritures. Les mutations survenues pendant un rendu en vol en déclenchent exactement un
 * autre à sa fin, et une PR dont le rendu a montré quelque chose n'est plus retentée. */
export function observePrChromeNavigation(adapter: PlatformAdapter, resolver: ClientConfigResolver, doc: Document): void {
  let lastPrKey: string | null = null;
  let hasRendered = false;
  let showedSomething = false;
  let emptyAttempts = 0;
  let inFlight = false;
  let missedMutation = false;

  const run = (): void => {
    if (inFlight) {
      missedMutation = true; // traité en une seule relance à la fin du rendu en cours
      return;
    }
    const key = prKeyFor(currentPrOf(adapter));
    if (!hasRendered || key !== lastPrKey) {
      hasRendered = true;
      lastPrKey = key;
      showedSomething = false;
      emptyAttempts = 0;
    } else if (showedSomething || emptyAttempts >= MAX_EMPTY_RENDER_ATTEMPTS) {
      return;
    }
    emptyAttempts++;
    inFlight = true;
    // Une navigation peut survenir pendant les lectures asynchrones : le rendu vérifie
    // alors qu'il porte toujours sur la PR affichée avant d'écrire quoi que ce soit.
    void renderPrChrome(adapter, resolver, doc, () => key === prKeyFor(currentPrOf(adapter)))
      .then((showed) => {
        if (key === lastPrKey) showedSomething = showed;
      })
      .finally(() => {
        inFlight = false;
        if (missedMutation) {
          missedMutation = false;
          run();
        }
      });
  };

  run();
  const observer = new MutationObserver(run);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
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
  isCurrent: () => boolean = () => true
): Promise<boolean> {
  const clearStaleBanner = () => {
    for (const stale of doc.querySelectorAll('.cct-banner')) stale.remove();
  };

  const pr = currentPrOf(adapter);
  if (!pr) {
    if (isCurrent()) clearStaleBanner();
    return true; // pas de PR : rien à retenter tant que la navigation ne change pas
  }
  const resolved = await resolver.resolve(adapter, pr);
  writeDegradedState(resolved.degraded); // §9.2.3 — visible dans les options
  if (resolved.config.mode === 'off') {
    if (isCurrent()) clearStaleBanner();
    return true; // désactivé : un état délibéré, pas un chargement encore en cours
  }
  const published = adapter.readPublishedResult();
  const lang = resolveUiLanguage(await readUserLanguage(), resolved.config, doc.documentElement.lang || null);
  const profile = adapter.platformProfile();

  const threads = await adapter.getThreads();
  if (!isCurrent()) return true; // supplanté entre-temps : la navigation suivante prend le relais
  clearStaleBanner(); // efface le bandeau d'un contexte précédent avant d'insérer le sien
  const model = buildBannerModel(
    published,
    threads,
    resolved.config,
    profile.id,
    profile.suggestionInfoString,
    profile.slashPrefixes
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
    const withRenderedThreads = adapter as PlatformAdapter & {
      getRenderedThreadElements?: () => { id: string; element: Element }[];
    };
    const banner = renderBanner(model, published, lang, {
      filterLabels: enabledLabels(resolved.config).map((l) => l.id),
      onFilter: (labelId) =>
        applyLabelFilter(
          banner,
          withRenderedThreads.getRenderedThreadElements?.() ?? [],
          labelOfThread,
          labelId
        ),
    });
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

/** §6.5 : grise le bouton de complétion si et seulement si PublishedSummary.state vaut
 * 'failure' — jamais à partir des compteurs. Visuel : le clic n'est PAS intercepté. */
export function applyCompletionState(
  control: SubmitControl | null,
  published: PublishedSummary | null,
  lang: string
): void {
  if (!control) return;
  if (published?.state === 'failure') {
    control.element.setAttribute('aria-disabled', 'true');
    control.element.classList.add('cct-merge-blocked');
    control.element.setAttribute('title', ui(lang, 'merge.blocked'));
  } else {
    control.element.removeAttribute('aria-disabled');
    control.element.classList.remove('cct-merge-blocked');
  }
}
