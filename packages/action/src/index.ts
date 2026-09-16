// @cct/action — le vérificateur (composant B) exécuté comme une GitHub Action, dans le dépôt
// qu'il protège (§6.4, §A.8). Aucun hébergement, aucun secret, aucune base : ce paquet ne
// retient rien d'une exécution à la suivante.

export type { VerifierPlatformAdapter } from './adapter.js';
export {
  GithubVerifierAdapter,
  webHostFromApiBase,
  prNumberFromEvent,
  workflowRunPullRequests,
  type GithubVerifierOptions,
} from './github.js';
export { renderHumanOutput } from './render.js';
export { runOnce, type RunOptions, type RunOutcome } from './run.js';
