// Bandeau de tête de PR (§5.5) : sa source est UNIQUE, les fils lus dans le DOM de la page
// (`getThreads()`). Décompte et ancres viennent donc de la même liste et ne peuvent pas
// diverger. `unknown` est compté non résolu, comme au §B.5. Une rédaction antérieure
// préférait le décompte publié par un vérificateur ; ce vérificateur est retiré (§2).
//
// Ce n'est PAS un panneau d'alerte : le produit SIGNALE les fils bloquants non résolus, il
// n'empêche pas de fusionner (O3, §2). Ce que la plateforme ne sait pas dire, c'est LESQUELS
// — la notion de fil bloquant vit dans le texte de nos commentaires, pas dans son modèle de
// données. D'où un sommaire : la liste courte des points encore ouverts, chaque entrée nommée
// par ce qu'elle dit et par qui l'a écrite, jamais par son rang dans le DOM.

import {
  analyze,
  matchPrefix,
  type CommentAnalysis,
  type EffectiveConfig,
  type ThreadInfo,
} from '@cct/core';
import { ui } from './strings.js';
import { listen } from '../error-capture.js';

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
  /** Décompte affiché en titre : les fils bloquants non résolus lus dans la page (§5.5). */
  count: number;
  /** Une ancre par fil compté. */
  anchors: BannerAnchor[];
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
  // CA-03 : le décompte est celui des fils que `isBlocking()` tient pour bloquants, la même
  // liste qui porte les ancres.
  return { count: local.length, anchors };
}

/** Vrai lorsque le bandeau a quelque chose à annoncer. Décompte nul : rien, pas même une
 * barre vide — une PR sans fil bloquant ouvert ne se décore pas. */
export function bannerHasContent(model: BannerModel): boolean {
  return model.count > 0;
}

export interface BannerRenderOptions {
  /** Ouverture à appliquer, quand elle ne doit pas suivre le défaut — typiquement le choix
   * que l'utilisateur a fait sur cette PR (§5.5). */
  open?: boolean;
  /** Notifie chaque changement d'ouverture, pour que ce choix survive au rendu suivant. */
  onToggle?: (open: boolean) => void;
}

export function renderBanner(
  model: BannerModel,
  lang: string,
  options: BannerRenderOptions = {}
): HTMLElement {
  const doc = globalThis.document;

  // `<details>` natif plutôt qu'un pliage maison : rôle, état et navigation clavier sont
  // déjà exposés par le navigateur (§10, accessibilité). Replié par défaut : le bandeau
  // signale, il n'interrompt pas la lecture de la PR (O3).
  //
  // Un DÉFAUT, pas un verdict : le bandeau est reconstruit à chaque rendu — et depuis que
  // le texte des fils est surveillé, une simple réponse ou une correction en place en
  // déclenche un. Réappliquer le défaut à chaque fois rouvrirait un bandeau que
  // l'utilisateur vient de replier (revue Codex, PR #26). L'appelant garde donc son choix
  // et nous le repasse ici, tant que la situation qui l'a motivé n'a pas changé.
  const root = doc.createElement('details');
  root.className = 'cct-banner';
  root.open = options.open ?? false;
  if (options.onToggle) {
    const notify = options.onToggle;
    listen('render', root, 'toggle', () => notify(root.open));
  }

  const head = doc.createElement('summary');
  head.className = 'cct-banner-head';
  // Région live (§10) : le bandeau est inséré APRÈS le chargement — des fils chargés de
  // façon asynchrone changent le décompte sans que rien ne le signale à un lecteur
  // d'écran. L'ancien `role="status"` sur la racine assurait cette annonce ; il ne peut pas
  // y revenir, `<details>` y perdrait sa sémantique de pliage (revue Codex, PR #26).
  // Ici plutôt que sur la racine, pour deux raisons : le contenu d'un `<details>` replié
  // n'est pas dans l'arbre d'accessibilité, donc jamais annoncé — et une région live posée
  // sur la racine ferait relire TOUTE la liste à chaque dépliage, un geste de l'utilisateur
  // qui n'a rien d'une nouvelle. `aria-live` est une propriété : le `<summary>` reste un
  // bouton de pliage, là où `role="status"` écraserait ce rôle.
  head.setAttribute('aria-live', 'polite');
  head.setAttribute('aria-atomic', 'true'); // la ligne entière, jamais le seul mot qui change

  // Icône ET texte, jamais la couleur seule (§10) : le fanion porte l'alerte sans emprunter
  // la sémantique « erreur » d'un rouge que rien ici ne justifie.
  const glyph = doc.createElement('span');
  glyph.className = 'cct-banner-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '⚑';
  head.appendChild(glyph);

  const count = doc.createElement('strong');
  count.className = 'cct-banner-count';
  count.textContent = ui(lang, 'banner.count', { count: model.count });
  head.appendChild(count);

  // Le décompte seul, sans sous-titre : il est ce que la page montre (§5.5), et il n'y a plus
  // d'autre source à laquelle le comparer — une réserve sans alternative ne ferait que semer le
  // doute (décision du propriétaire, D5). Rien n'y présente ces fils comme un préalable à la
  // fusion : le produit signale, il n'empêche pas (O3, §2).
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

  root.appendChild(list);

  return root;
}
