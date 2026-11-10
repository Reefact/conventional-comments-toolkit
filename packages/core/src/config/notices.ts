// Fabrique des avis de configuration (§5.3, §9.2.1). Un avis porte une CLÉ de message
// stable et ses paramètres, pour que l'interface le rende dans SA langue (§10) — et non une
// phrase anglaise figée au moment où core l'écrit. `message` reste fourni, rendu en anglais
// depuis le même catalogue : c'est la forme lisible d'un journal ou d'un test, jamais ce
// qu'une interface affiche.

import type { Notice, NoticeKind, NoticeParams } from '../types.js';
import { t } from '../i18n/index.js';

export function makeNotice(kind: NoticeKind, code: string, params: NoticeParams = {}, ref?: string): Notice {
  return {
    kind,
    code,
    params,
    message: t('en', `notice.${code}`, params),
    ...(ref !== undefined ? { ref } : {}),
  };
}

/** Le texte d'un avis dans la langue de l'interface. Un avis sans `code` — écrit par un
 * appelant qui ne passe pas par `makeNotice()` — garde son `message` tel quel : il n'y a
 * rien d'autre à rendre. */
export function noticeText(
  lang: string | null | undefined,
  notice: Pick<Notice, 'message'> & { code?: string; params?: NoticeParams }
): string {
  if (notice.code === undefined) return notice.message;
  return t(lang, `notice.${notice.code}`, notice.params ?? {});
}
