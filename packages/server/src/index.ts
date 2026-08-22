// @cct/server — composant B (§6). L'orchestration et le stockage sont communs ; un
// adaptateur par plateforme (§9.1).

export { Orchestrator, type OrchestratorDeps, type EvaluationOutcome } from './compliance/orchestrator.js';
export { EvaluationScheduler, Reconciler, type TriggerSource } from './compliance/scheduler.js';
export {
  MemoryStorage,
  FileStorage,
  type Storage,
  type ActiveExemption,
  type ExemptionLogEntry,
  type FirstVerdict,
  type PublishedRecord,
  type IndicatorSample,
} from './compliance/storage.js';
export { ConfigCache } from './compliance/cache.js';
export { AdminEntryPoint, AdminError, type DryRunReportEntry } from './compliance/admin.js';
export { computeIndicators, type Indicators } from './compliance/indicators.js';
export { prKey, repoKey } from './compliance/keys.js';
export type { ServerPlatformAdapter, PlatformOperationalFacts } from './compliance/adapter.js';
export { GithubServerAdapter, githubFacts, renderHumanOutput } from './adapters/github/index.js';
export { AzdoServerAdapter, azdoFacts } from './adapters/azdo/index.js';
export { createHttpServer, type HttpDeps, type PlatformRegistration } from './http.js';
