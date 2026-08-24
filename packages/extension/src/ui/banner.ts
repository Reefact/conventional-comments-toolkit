// Bandeau de tête de PR (§5.5) : le DÉCOMPTE vient du résumé publié, qui fait autorité ;
// les ANCRES viennent du DOM, qui porte les fils. Les deux divergent, et c'est assumé —
// l'écart devient une ligne à part entière plutôt qu'une soustraction laissée au lecteur.
// Sans résumé publié, vue locale explicitement marquée, `unknown` compté non résolu.
//
// Ce n'est PAS un panneau d'alerte. Le verdict de conformité appartient au check de la
// plateforme, qui est déjà rouge et bloque déjà la complétion ; le redire ici dévaluerait
// les deux. Ce que la plateforme ne sait pas dire, c'est LESQUELS — la notion de fil
// bloquant vit dans le texte de nos commentaires, pas dans son modèle de données. D'où un
// sommaire : la liste courte de ce qui sépare l'auteur du merge, chaque entrée nommée par
// ce qu'elle dit et par qui l'a écrite, jamais par son rang dans le DOM.

import {
  analyze,
  matchPrefix,
  type CommentAnalysis,
  type EffectiveConfig,
  type PublishedSummary,
  type ThreadInfo,
} from '@cct/core';
import { ui } from './strings.js';

/** Une entrée du sommaire : de quoi reconnaître le fil sans l'ouvrir. */
export interface BannerAnchor {
  threadId: string;
  href: string;
  /** Identifiant du label résolu — jamais vide en pratique, un fil bloquant en porte un. */
  label: string;
  /** Sujet de la racine, vide lorsqu'il est absent (`E-EMPTY-SUBJECT`, §3.5.2). */
  subject: string;
  /** Login de l'auteur de la racine, vide si la page ne l'a pas rendu. */
  author: string;
}

export interface BannerModel {
  /** Décompte affiché en titre : publié si présent, sinon vue locale. */
  count: number;
  /** Ancres appariées dans le DOM. */
  anchors: BannerAnchor[];
  /** Vrai si le décompte vient du résumé publié (autorité), faux pour la vue locale. */
  fromPublished: boolean;
  /** Vrai quand `fromPublished` et que des fils comptés n'ont pas été appariés (§5.5). */
  partial: boolean;
}

/** Sujet de la racine, lu dans la ligne de préfixe déjà normalisée par `analyze()` —
 * jamais redécoupé à la main : la grammaire du §3.1 vit dans `matchPrefix`, et elle seule. */
function subjectOf(analysis: CommentAnalysis): string {
  if (analysis.prefixLine === null) return '';
  return matchPrefix(analysis.prefixLine)?.subject?.trim() ?? '';
}

/** Fil bloquant vu localement, avec l'analyse qui l'a établi — l'appelant en tire label et
 * sujet sans repasser `analyze()` sur le même corps. */
function blockingUnresolvedWithAnalysis(
  threads: ThreadInfo[],
  config: EffectiveConfig,
  platformId: string,
  suggestionInfoString: string | null
): { thread: ThreadInfo; analysis: CommentAnalysis }[] {
  const out: { thread: ThreadInfo; analysis: CommentAnalysis }[] = [];
  for (const t of threads) {
    if (!t.canCarryBlockingState) continue;
    const analysis = analyze(
      {
        body: t.root.body,
        platform: { id: platformId, suggestionInfoString },
        isSystemGenerated: t.root.isSystemGenerated,
        zone: 'thread-root',
        canCarryBlockingState: true,
        author: t.root.author,
      },
      config
    );
    if (!analysis.blocking) continue;
    if (t.resolution === 'resolved') continue; // unknown → non résolu
    out.push({ thread: t, analysis });
  }
  return out;
}

/** Fil bloquant vu localement : racine bloquante au sens du §3.3 (départage compris),
 * état non résolu — `unknown` compté non résolu, comme au §B.5. */
export function localBlockingUnresolved(
  threads: ThreadInfo[],
  config: EffectiveConfig,
  platformId: string,
  suggestionInfoString: string | null
): ThreadInfo[] {
  return blockingUnresolvedWithAnalysis(threads, config, platformId, suggestionInfoString).map((x) => x.thread);
}

export function buildBannerModel(
  published: PublishedSummary | null,
  threads: ThreadInfo[],
  config: EffectiveConfig,
  platformId: string,
  suggestionInfoString: string | null
): BannerModel {
  const local = blockingUnresolvedWithAnalysis(threads, config, platformId, suggestionInfoString);
  const anchors: BannerAnchor[] = local.map(({ thread, analysis }) => ({
    threadId: thread.id,
    href: thread.root.permalink,
    label: analysis.resolved?.label.id ?? '',
    subject: subjectOf(analysis),
    author: thread.root.author.login,
  }));
  if (published !== null) {
    // CA-03 : le décompte affiché est le décompte publié, jamais le nombre d'ancres.
    const count = published.unresolvedBlockingCount;
    return { count, anchors, fromPublished: true, partial: anchors.length < count };
  }
  return { count: local.length, anchors, fromPublished: false, partial: false };
}

/** Vrai lorsque le bandeau a quelque chose à annoncer. Décompte nul : rien, pas même une
 * barre vide — le check vert dit déjà tout, et une PR saine ne se décore pas. En vue
 * publiée, ce décompte fait autorité : des ancres locales sur un décompte à zéro sont des
 * fils que le serveur ne compte pas, les afficher contredirait la source de vérité. */
export function bannerHasContent(model: BannerModel): boolean {
  return model.count > 0;
}

export function renderBanner(model: BannerModel, published: PublishedSummary | null, lang: string): HTMLElement {
  const doc = globalThis.document;
  // `<details>` natif plutôt qu'un pliage maison : rôle, état et navigation clavier sont
  // déjà exposés par le navigateur (§10, accessibilité). Déplié quand un résultat publié
  // compte des fils — c'est l'instant où l'on cherche lesquels ; replié en vue locale, où
  // rien ne bloque et rien ne presse.
  const root = doc.createElement('details');
  root.className = 'cct-banner';
  root.dataset['view'] = model.fromPublished ? 'published' : 'local';
  root.open = model.fromPublished;

  const head = doc.createElement('summary');
  head.className = 'cct-banner-head';

  // Icône ET texte, jamais la couleur seule (§10) : le fanion porte l'alerte sans emprunter
  // la sémantique « erreur » d'un rouge que rien ici ne justifie.
  const glyph = doc.createElement('span');
  glyph.className = 'cct-banner-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '⚑';
  head.appendChild(glyph);

  const count = doc.createElement('strong');
  count.className = 'cct-banner-count';
  count.textContent = ui(lang, model.fromPublished ? 'banner.count' : 'banner.count.local', { count: model.count });
  head.appendChild(count);

  const hint = doc.createElement('span');
  hint.className = 'cct-banner-hint';
  hint.textContent = ui(lang, model.fromPublished ? 'banner.hint' : 'banner.hint.local');
  head.appendChild(hint);

  root.appendChild(head);

  const list = doc.createElement('ul');
  list.className = 'cct-banner-list';
  for (const anchor of model.anchors) {
    const li = doc.createElement('li');
    li.dataset['threadId'] = anchor.threadId;
    if (anchor.label) {
      const badge = doc.createElement('span');
      badge.className = 'cct-banner-label';
      badge.textContent = anchor.label;
      li.appendChild(badge);
    }
    const a = doc.createElement('a');
    a.className = 'cct-banner-subject';
    a.href = anchor.href;
    // Un fil se reconnaît à ce qu'il dit. À défaut de sujet — le cas `E-EMPTY-SUBJECT` —
    // on le dit aussi, plutôt que de retomber sur un identifiant de machine.
    a.textContent = anchor.subject || ui(lang, 'banner.untitled');
    li.appendChild(a);
    if (anchor.author) {
      const author = doc.createElement('span');
      author.className = 'cct-banner-author';
      author.textContent = `@${anchor.author}`;
      li.appendChild(author);
    }
    list.appendChild(li);
  }

  // L'écart entre décompte publié et ancres appariées est une LIGNE, pas une note de bas de
  // bandeau : une liste dont une entrée est déclarée hors de portée se lit comme un fait,
  // là où une liste silencieusement incomplète se lit comme un bug. Sans `data-thread-id` —
  // elle ne désigne aucun fil de cette page, c'est tout son propos.
  if (model.partial) {
    const missing = doc.createElement('li');
    missing.className = 'cct-banner-unlocated';
    missing.textContent = ui(lang, 'banner.unlocated', { missing: model.count - model.anchors.length });
    list.appendChild(missing);
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
