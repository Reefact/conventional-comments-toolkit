// Script de contenu (composant A) : choisit l'adaptateur par domaine, résout la
// configuration (hors chemin critique — l'assistance démarre avec le cache), attache un
// contrôleur par éditeur, rend bandeau et grisage du bouton de complétion (§6.5).

import type { Floor, PublishedSummary } from '@cct/core';
import type { PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { analyze, enabledLabels } from '@cct/core';
import { ClientConfigResolver, resolveUiLanguage } from './config-resolver.js';
import { EditorController } from './editor-controller.js';
import { buildBannerModel, renderBanner } from './ui/banner.js';
import { decorateComment } from './ui/badges.js';
import { ui } from './ui/strings.js';

declare const chrome: {
  storage?: {
    managed?: { get: (cb: (items: Record<string, unknown>) => void) => void };
    sync?: { get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void };
  };
  runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> };
} | undefined;

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
    });
    controller.attach();
  };

  adapter.observeEditors((editor) => void attach(editor));

  // Bandeau (§5.5) et grisage du bouton de complétion (§6.5).
  void renderPrChrome(adapter, resolver, doc);
}

async function renderPrChrome(
  adapter: PlatformAdapter,
  resolver: ClientConfigResolver,
  doc: Document
): Promise<void> {
  const pr = (adapter as GithubClientAdapter | AzdoClientAdapter).currentPr?.();
  if (!pr) return;
  const resolved = await resolver.resolve(adapter, pr);
  if (resolved.config.mode === 'off') return;
  const published = adapter.readPublishedResult();
  const lang = resolveUiLanguage(await readUserLanguage(), resolved.config, doc.documentElement.lang || null);
  const profile = adapter.platformProfile();

  const threads = await adapter.getThreads();
  const model = buildBannerModel(
    published,
    threads,
    resolved.config,
    profile.id,
    profile.suggestionInfoString,
    profile.slashPrefixes
  );
  if (model.count > 0 || published !== null) {
    // Filtre local par label (§5.5) : masque les ancres du bandeau ET les fils rendus.
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
    const banner = renderBanner(model, published, lang, {
      filterLabels: enabledLabels(resolved.config).map((l) => l.id),
      onFilter: (labelId) => {
        for (const li of banner.querySelectorAll('li[data-thread-id]')) {
          const threadId = (li as HTMLElement).dataset['threadId']!;
          const visible = labelId === null || labelOfThread.get(threadId) === labelId;
          (li as HTMLElement).style.display = visible ? '' : 'none';
        }
      },
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
}

// Point d'entrée du script de contenu : auto-exécution dans une page réelle (jamais
// sous test, où bootstrap() est appelée explicitement).
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome?.runtime) {
  void bootstrap();
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
