// Vérifié par `npm run typecheck:tests` (tsconfig.test.json), jamais exécuté : la PREUVE, par le
// compilateur, que le contrat client est complet (§9.2.3). Le reste de la suite est transpilé
// par vitest sans vérification de type — un `implements PlatformAdapter` dans un `.test.ts` n'y
// est jamais contrôlé —, d'où ce fichier à part, et le tsconfig qui l'inclut.
//
// Chaque bloc retire UN membre d'un adaptateur complet et affirme que l'objet obtenu ne compile
// pas. La directive `@ts-expect-error` se vérifie dans les deux sens : si un membre redevenait
// optionnel dans `PlatformAdapter`, l'objet incomplet compilerait, la directive deviendrait
// inutile, et TypeScript signale une directive inutile comme une erreur. Le garde se vérifie
// donc en le retirant, comme tout correctif de ce dépôt.
import type { PlatformAdapter } from '@cct/adapter-shared';
import { NEUTRAL_EDITOR_CHROME } from '@cct/adapter-shared';

const complete: PlatformAdapter = {
  currentPr: () => null,
  platformProfile: () => ({ id: 'acme', suggestionInfoString: null }),
  getRepoConfig: async () => ({ status: 'absent' }),
  getOrgConfig: async () => ({ status: 'absent' }),
  observeEditors: () => ({ dispose: () => {} }),
  getEditorChrome: () => NEUTRAL_EDITOR_CHROME,
  renderedBodyShape: () => null,
  getSubmitControls: () => [],
  readValue: () => '',
  writeValue: () => {},
  getThreads: async () => [],
  getCompletionControl: () => null,
  getCurrentUser: async () => ({ id: 'login:x', login: 'x', isServiceAccount: false }),
  readPublishedResult: () => null,
  getBannerMount: () => null,
  getRenderedThreadElements: () => [],
  getRenderedComments: () => [],
  getRenderedCommentElements: () => [],
};

const { currentPr: _currentPr, ...withoutCurrentPr } = complete;
// @ts-expect-error — sans `currentPr`, le code partagé ne saurait pas quelle PR la page montre (§2, §6.2.3).
const incomplete1: PlatformAdapter = withoutCurrentPr;

const { getBannerMount: _getBannerMount, ...withoutBannerMount } = complete;
// @ts-expect-error — sans `getBannerMount`, le bandeau n'aurait pas de place (§5.5).
const incomplete2: PlatformAdapter = withoutBannerMount;

const { getRenderedThreadElements: _getRenderedThreadElements, ...withoutThreads } = complete;
// @ts-expect-error — sans `getRenderedThreadElements`, le filtre n'aurait rien à masquer (§5.5).
const incomplete3: PlatformAdapter = withoutThreads;

const { getRenderedComments: _getRenderedComments, ...withoutComments } = complete;
// @ts-expect-error — sans `getRenderedComments`, aucun badge ne serait posé (§5.5).
const incomplete4: PlatformAdapter = withoutComments;

const { getRenderedCommentElements: _getRenderedCommentElements, ...withoutElements } = complete;
// @ts-expect-error — sans `getRenderedCommentElements`, les signatures de reprise seraient aveugles (§9.4).
const incomplete5: PlatformAdapter = withoutElements;

const { getEditorChrome: _getEditorChrome, ...withoutChrome } = complete;
// @ts-expect-error — `getEditorChrome` est obligatoire depuis la PR #65, et le reste (§9.2.3).
const incomplete6: PlatformAdapter = withoutChrome;

export const proofs = [incomplete1, incomplete2, incomplete3, incomplete4, incomplete5, incomplete6];
