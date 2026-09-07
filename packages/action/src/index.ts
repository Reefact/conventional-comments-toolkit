// @cct/action — composant B, profil A du §6.4.1 : le vérificateur exécuté par une GitHub
// Action. Il ne partage avec le service hébergé que `@cct/core`, c'est-à-dire le jugement
// (§9.1) ; l'orchestration et la persistance lui viennent de la plateforme.

export { GithubClient, ReadFailedError, webHostFromApiBase, CHECK_NAME, type GithubClientOptions, type PublishedCheckRun } from './client.js';
export {
  encodeState,
  decodeState,
  digestResult,
  toFirstVerdicts,
  fromFirstVerdicts,
  STATE_BUDGET,
  STATE_MARKER,
  STATE_VERSION,
  type CarriedState,
} from './state.js';
export { evaluatePullRequest, type RunOptions, type RunOutcome, type SkipReason } from './run.js';
export {
  run,
  resolveInputs,
  runMarkerFrom,
  pullRequestNumberFromEvent,
  InputError,
  type Resolved,
} from './main.js';
