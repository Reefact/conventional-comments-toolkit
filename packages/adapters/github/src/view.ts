// Quelle VUE de GitHub la page affiche-t-elle ? — l'aiguillage entre la Conversation classique
// et la page Overview (préversion du 2026-11-05, #131).
//
// Les deux vues se servent à la MÊME URL (`/pull/N`, un compte inscrit choisissant par
// `?overview=true` ou `?overview=false`) : l'URL dit l'onglet, seule la page dit la vue. Le
// marqueur est MESURÉ — `#overview-comments` sur les captures Overview, sur aucune autre
// (`selectors.overviewPage`).
//
// Le jour où l'Overview sera la seule version, `'classic'` disparaît de ce type, et le compilateur
// désigne chaque branche à retirer.

import { queryChain } from '@cct/adapter-shared';
import { selectors } from './selectors.js';

/** `'overview'` et `'classic'` : l'onglet Conversation d'une PR, dans l'une ou l'autre vue.
 * `'other'` : tout le reste — un autre onglet de la PR (Files changed, Commits, Checks), ou une
 * page qui n'est pas une PR. */
export type GithubView = 'overview' | 'classic' | 'other';

/** L'onglet Conversation : `/owner/repo/pull/N`, rien après le numéro qu'une barre finale. */
const CONVERSATION_PATH = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/;

export function githubView(doc: Document): GithubView {
  if (!CONVERSATION_PATH.test(doc.location?.pathname ?? '')) return 'other';
  // Une page Overview en cours de chargement ne porte pas encore son marqueur, et se lit alors
  // `'classic'` : ce qu'elle sonde trop tôt est journalisé, puis marqué rattrapé quand la page
  // arrive (`SelectorLog.recovered`), comme tout relevé pris avant le rendu (#127).
  return queryChain(doc, selectors.overviewPage).element ? 'overview' : 'classic';
}

/** L'URL désigne-t-elle une PR, quel qu'en soit l'onglet ? */
export function isPullRequestPath(doc: Document): boolean {
  return /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/.test(doc.location?.pathname ?? '');
}
