// Contrat serveur (§9.2.4) — un adaptateur traduit et transporte ; il ne juge jamais.

import type {
  CommentInfo,
  ComplianceResult,
  ConfigRead,
  PlatformProfile,
  PrRef,
  ReviewEvent,
  ThreadInfo,
  UserInfo,
  Zone,
} from '@cct/core';

export interface ServerPlatformAdapter {
  platformProfile(): PlatformProfile;
  listOpenPrs(repo: { host: string; scope: string[] }): Promise<PrRef[]>;
  matchesWebhook(payload: unknown): boolean;
  verifySignature(payload: unknown, headers: Record<string, string>): boolean;
  parseEvent(payload: unknown): Omit<ReviewEvent, 'sequence'>;
  fetchThreads(pr: PrRef): Promise<ThreadInfo[]>;
  fetchStandaloneComments(pr: PrRef): Promise<{ comment: CommentInfo; zone: Zone }[]>;
  fetchConfigFile(pr: PrRef, opts?: { bypassCache: boolean }): Promise<ConfigRead>;
  fetchOrgConfig(url: string | null, opts?: { bypassCache: boolean }): Promise<ConfigRead>;
  fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]>;
  fetchHeadSha(pr: PrRef): Promise<string>;
  isDraft(pr: PrRef): Promise<boolean>;
  publishStatus(pr: PrRef, result: ComplianceResult): Promise<void>;
  addLabel(pr: PrRef, name: string): Promise<void>;
  removeLabel(pr: PrRef, name: string): Promise<void>;
  isInGroup(user: UserInfo, group: string): Promise<boolean>;
}

/** Réglages d'exploitation par plateforme, HORS du contrat normatif du §9.2.4 —
 * ils portent les faits que le spike P1' doit établir (annexe B). */
export interface PlatformOperationalFacts {
  /** §B.7 — vrai si un changement de statut de fil émet bien un `Pull request updated`.
   * Tant que ce n'est pas établi, `enforce` avec reconcileIntervalSeconds > 60 est signalé. */
  threadStatusEmitsPrUpdated: boolean;
  /** §6.3.2 — vrai si la plateforme expose la provenance des étiquettes (`fetchLabels`
   * rend `by`/`at`). Décide du chemin d'exemption : étiquette ou point d'entrée. */
  labelProvenanceExposed: boolean;
  /** §6.3.1, §8.2 — vrai si la plateforme ne rend pas de corps de statut : la
   * `targetUrl` y est obligatoire, et son absence est signalée (`config-warning`). */
  requiresStatusTargetUrl: boolean;
}
