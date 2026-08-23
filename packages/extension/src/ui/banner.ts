// Bandeau de tête de PR (§5.5) : le DÉCOMPTE vient du résumé publié, qui fait autorité ;
// les ANCRES viennent du DOM, qui porte les fils. Les deux divergent, et c'est assumé —
// quand il apparie moins d'ancres, le bandeau l'indique. Sans résumé publié, vue locale
// explicitement marquée, `unknown` compté non résolu.

import { analyze, type EffectiveConfig, type PublishedSummary, type ThreadInfo } from '@cct/core';
import type { PlatformAdapter } from '@cct/adapter-shared';
import { ui } from './strings.js';

export interface BannerModel {
  /** Décompte affiché en titre : publié si présent, sinon vue locale. */
  count: number;
  /** Ancres appariées dans le DOM. */
  anchors: { threadId: string; href: string }[];
  /** Vrai si le décompte vient du résumé publié (autorité), faux pour la vue locale. */
  fromPublished: boolean;
  /** « N sur M localisés » quand fromPublished et anchors.length < count (§5.5). */
  partial: boolean;
}

/** Fil bloquant vu localement : racine bloquante au sens du §3.3 (départage compris),
 * état non résolu — `unknown` compté non résolu, comme au §B.5. */
export function localBlockingUnresolved(
  threads: ThreadInfo[],
  config: EffectiveConfig,
  platformId: string,
  suggestionInfoString: string | null,
  slashPrefixes: string[]
): ThreadInfo[] {
  return threads.filter((t) => {
    if (!t.canCarryBlockingState) return false;
    const a = analyze(
      {
        body: t.root.body,
        platform: { id: platformId, suggestionInfoString, slashPrefixes },
        isSystemGenerated: t.root.isSystemGenerated,
        zone: 'thread-root',
        canCarryBlockingState: true,
        author: t.root.author,
      },
      config
    );
    if (!a.blocking) return false;
    return t.resolution !== 'resolved'; // unknown → non résolu
  });
}

export function buildBannerModel(
  published: PublishedSummary | null,
  threads: ThreadInfo[],
  config: EffectiveConfig,
  platformId: string,
  suggestionInfoString: string | null,
  slashPrefixes: string[]
): BannerModel {
  const local = localBlockingUnresolved(threads, config, platformId, suggestionInfoString, slashPrefixes);
  const anchors = local.map((t) => ({ threadId: t.id, href: t.root.permalink }));
  if (published !== null) {
    // CA-03 : le décompte affiché est le décompte publié, jamais le nombre d'ancres.
    const count = published.unresolvedBlockingCount;
    return { count, anchors, fromPublished: true, partial: anchors.length < count };
  }
  return { count: local.length, anchors, fromPublished: false, partial: false };
}

export interface BannerRenderOptions {
  /** Labels disponibles pour le filtre local (§5.5). */
  filterLabels?: string[];
  /** Appelé quand le filtre change ; null = tous. */
  onFilter?: (labelId: string | null) => void;
}

export function renderBanner(
  model: BannerModel,
  published: PublishedSummary | null,
  lang: string,
  options: BannerRenderOptions = {}
): HTMLElement {
  const doc = globalThis.document;
  const root = doc.createElement('div');
  root.className = 'cct-banner';
  root.setAttribute('role', 'status');

  const title = doc.createElement('strong');
  title.textContent = model.fromPublished
    ? ui(lang, 'banner.title', { count: model.count })
    : ui(lang, 'banner.local', { count: model.count });
  root.appendChild(title);

  if (model.partial) {
    const partial = doc.createElement('span');
    partial.className = 'cct-banner-partial';
    partial.textContent = ` — ${ui(lang, 'banner.partial', { located: model.anchors.length, count: model.count })}`;
    root.appendChild(partial);
  }

  // Filtre local par label dans la liste des fils (§5.5).
  if (options.filterLabels && options.filterLabels.length > 0) {
    const filterLabel = doc.createElement('label');
    filterLabel.className = 'cct-banner-filter';
    filterLabel.textContent = ` ${ui(lang, 'banner.filter')} : `;
    const select = doc.createElement('select');
    const all = doc.createElement('option');
    all.value = '';
    all.textContent = ui(lang, 'banner.filter.all');
    select.appendChild(all);
    for (const id of options.filterLabels) {
      const option = doc.createElement('option');
      option.value = id;
      option.textContent = id;
      select.appendChild(option);
    }
    select.addEventListener('change', () => options.onFilter?.(select.value === '' ? null : select.value));
    filterLabel.appendChild(select);
    root.appendChild(filterLabel);
  }

  const list = doc.createElement('ul');
  for (const anchor of model.anchors) {
    const li = doc.createElement('li');
    li.dataset['threadId'] = anchor.threadId;
    const a = doc.createElement('a');
    a.href = anchor.href;
    a.textContent = anchor.threadId;
    li.appendChild(a);
    list.appendChild(li);
  }
  root.appendChild(list);

  // Panneau de diagnostic : « jugée en enforce par core/ 1.4.0 » — affichage, rien de
  // plus ; un écart de coreVersion ne déclenche rien (§6.3.1, CA-32).
  if (published) {
    const judged = doc.createElement('small');
    judged.className = 'cct-banner-judged';
    judged.textContent = ui(lang, 'banner.judged', {
      mode: published.mode,
      coreVersion: published.coreVersion,
    });
    root.appendChild(judged);
  }
  return root;
}

/** §5.5 — filtre local par label « dans la liste des fils de discussion » : masque les
 * ancres du bandeau ET les fils rendus de la page. `labelId` null = tous. Purement
 * visuel — le contenu stocké et le DOM des fils restent intacts. */
export function applyLabelFilter(
  banner: HTMLElement,
  renderedThreads: { id: string; element: Element }[],
  labelOfThread: Map<string, string | null>,
  labelId: string | null
): void {
  for (const li of banner.querySelectorAll('li[data-thread-id]')) {
    const threadId = (li as HTMLElement).dataset['threadId']!;
    const visible = labelId === null || labelOfThread.get(threadId) === labelId;
    (li as HTMLElement).style.display = visible ? '' : 'none';
  }
  for (const { id, element } of renderedThreads) {
    const visible = labelId === null || labelOfThread.get(id) === labelId;
    (element as HTMLElement).style.display = visible ? '' : 'none';
  }
}
