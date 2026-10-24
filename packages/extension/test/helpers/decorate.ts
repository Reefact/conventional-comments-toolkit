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
import type { RenderedBodyShape } from '@cct/adapter-shared';
import type { EffectiveConfig, PlatformProfile } from '@cct/core';
import { decorateComment } from '../../src/ui/badges.js';

/** La forme `<p>`/`<br>` d'un rendu Markdown → HTML ordinaire, pour les tests qui ont besoin
 * d'UNE forme sans que ce soit leur sujet. C'est celle que GitHub a mesurée
 * (`GITHUB_BODY_SHAPE`, @cct/adapter-github), redéclarée ici plutôt qu'importée : un test du
 * noyau ne dépend d'aucun paquet de plateforme — le garde d'isolation le refuse au code livré,
 * et un test qui passerait par là referait de GitHub la forme « par défaut » que le paquet
 * partagé a cessé d'offrir. */
export const HTML_SHAPE: RenderedBodyShape = Object.freeze({
  paragraphTags: Object.freeze(['P']),
  lineBreakTag: 'BR',
});

export function decorateWithHtmlShape(
  commentBodyElement: Element,
  bodyText: string,
  config: EffectiveConfig,
  platform: PlatformProfile,
  lang: string
): void {
  decorateComment(commentBodyElement, bodyText, config, platform, lang, HTML_SHAPE);
}
