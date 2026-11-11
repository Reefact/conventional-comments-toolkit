// Fabrique des avis de configuration (§5.3, §9.2.1). Un avis porte une CLÉ de message
// stable et ses paramètres, pour que l'interface le rende dans SA langue (§10) — et non une
// phrase anglaise figée au moment où core l'écrit. `message` reste fourni, rendu en anglais
// depuis le même catalogue : c'est la forme lisible d'un journal ou d'un test, jamais ce
// qu'une interface affiche.

import type { Notice, NoticeKind, NoticeParams } from '../types.js';
import { t } from '../i18n/index.js';

/** Le niveau de configuration en cause (§5.3, « cite le niveau de configuration en cause ») :
 * le plancher d'entreprise, le document d'organisation, le fichier du dépôt — ou la
 * configuration FUSIONNÉE, pour un fait qui ne naît que de la réunion des niveaux (deux labels
 * qui se masquent l'un l'autre peuvent venir de deux documents différents, ou des défauts).
 *
 * Porté par le paramètre `level`, et rendu par le catalogue (`notice.level.<niveau>`) dans le
 * paramètre `{where}` : une seule phrase par message, le niveau entre parenthèses après la
 * sorte — « Configuration invalide (fichier du dépôt) : … ». La parenthèse évite tout accord
 * de genre ou de nombre avec le reste de la phrase, ce que des variantes par niveau auraient
 * dû porter pour chacun des messages. */
export const NOTICE_LEVELS = ['floor', 'org', 'repo', 'merged'] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

/** Longueur au-delà de laquelle une valeur venue d'un document — un motif d'allowlist, une
 * entrée de `toolCommands` — est tronquée dans le texte d'un avis. */
export const NOTICE_VALUE_MAX = 40;

/** Une valeur venue d'un document, réduite à ce qu'un avis peut citer : caractères de contrôle
 * et de mise en forme bidirectionnelle remplacés par U+FFFD — un retour à la ligne ou un
 * renversement de sens ne doit pas réarranger la phrase qui le cite —, puis tronquée à
 * `NOTICE_VALUE_MAX` caractères, marque d'élision comprise. Le texte est posé par
 * `textContent`, jamais interprété comme du HTML : la troncature borne la LONGUEUR, elle n'a
 * pas à neutraliser de balise. */
export function citedValue(value: string): string {
  const clean = value.replace(/[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g, '�');
  const chars = [...clean];
  return chars.length <= NOTICE_VALUE_MAX ? clean : `${chars.slice(0, NOTICE_VALUE_MAX - 1).join('')}…`;
}

export function makeNotice(kind: NoticeKind, code: string, params: NoticeParams = {}, ref?: string): Notice {
  const notice = { kind, code, params, ...(ref !== undefined ? { ref } : {}) };
  return { ...notice, message: noticeText('en', { ...notice, message: '' }) };
}

/** Le même avis, attribué à un niveau. `parseConfigDocument()` et `vetFloor()` l'appliquent à
 * TOUT ce qu'ils signalent : un avis de niveau document ne peut pas oublier de dire de quel
 * document il parle. */
export function withLevel(notice: Notice, level: NoticeLevel): Notice {
  return makeNotice(notice.kind, notice.code, { ...notice.params, level }, notice.ref);
}

/** Le texte d'un avis dans la langue de l'interface. Un avis sans `code` — écrit par un
 * appelant qui ne passe pas par `makeNotice()` — garde son `message` tel quel : il n'y a
 * rien d'autre à rendre. */
export function noticeText(
  lang: string | null | undefined,
  notice: Pick<Notice, 'message'> & { code?: string; params?: NoticeParams }
): string {
  if (notice.code === undefined) return notice.message;
  const params = { ...(notice.params ?? {}) };
  if (typeof params['level'] === 'string') params['where'] = t(lang, `notice.level.${params['level']}`);
  return t(lang, `notice.${notice.code}`, params);
}
