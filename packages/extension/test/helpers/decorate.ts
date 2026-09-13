// Le raccourci des tests qui ne portent PAS sur la forme du corps rendu (§5.5).
//
// `decorateComment()` EXIGE désormais cette forme. Le défaut nommé qui vivait dans sa signature
// se justifiait par ces appels-ci — plus de cent, qui ne s'intéressent pas au sujet —, mais un
// défaut ne choisit pas à qui il profite : un futur appel de PRODUCTION omettant de consulter
// l'adaptateur compilait, et recevait `<p>` / `<br>`, soit l'hypothèse GitHub que la scission
// des plateformes existe pour sortir du code partagé (revue Reefact, PR #66).
//
// Le raccourci n'a donc pas disparu, il a CHANGÉ DE CÔTÉ : ici, où fournir une forme arbitraire
// est légitime et visible, plutôt que dans le contrat que le code livré doit respecter.
//
// Les tests qui portent, eux, sur la forme appellent `decorateComment()` directement avec la
// leur — c'est tout `rendered-body-shape.test.ts`, y compris le cas `null`.
import { MARKDOWN_HTML_BODY_SHAPE } from '@cct/adapter-shared';
import type { EffectiveConfig, PlatformProfile } from '@cct/core';
import { decorateComment } from '../../src/ui/badges.js';

export function decorateWithHtmlShape(
  commentBodyElement: Element,
  bodyText: string,
  config: EffectiveConfig,
  platform: PlatformProfile,
  lang: string
): void {
  decorateComment(commentBodyElement, bodyText, config, platform, lang, MARKDOWN_HTML_BODY_SHAPE);
}
