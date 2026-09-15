// Contrat du vérificateur (§9.2.4) — un adaptateur traduit et transporte ; il ne juge jamais.
//
// Ce contrat n'a ni webhook, ni signature, ni séquence : le vérificateur est réveillé par
// l'intégration continue, pas par un message. Il n'a pas non plus de stockage, donc aucune
// méthode ne relit ce qu'une exécution précédente aurait écrit.

import type {
  CommentInfo,
  ComplianceResult,
  ConfigRead,
  PlatformProfile,
  PrRef,
  ThreadInfo,
  UserInfo,
  Zone,
} from '@cct/core';

export interface VerifierPlatformAdapter {
  platformProfile(): PlatformProfile;

  /** L'**unique** PR que cette évaluation évalue : celle que désigne l'événement, ou celle
   * que la répartition lui a injectée. Une évaluation porte sur une PR et une seule, parce
   * qu'elle publie dans le groupe de concurrence de cette PR : en évaluer une autre depuis
   * ce groupe rouvrirait la course que le groupe ferme (§6.4, §A.8). */
  currentPr(): Promise<PrRef>;

  /** Les PR qu'un déclencheur couvre quand il en couvre plusieurs : toutes les PR ouvertes
   * sur une exécution planifiée, celles de l'exécution d'origine pour le workflow compagnon.
   * Le job qui l'appelle ne publie AUCUN statut — il répartit, une évaluation par PR. Un
   * déclencheur qui désigne une PR ne l'appelle pas (§6.4, §A.8). */
  pullRequestsToDispatch(): Promise<PrRef[]>;

  fetchThreads(pr: PrRef): Promise<ThreadInfo[]>;

  /** §4.1 — zones `conversation` et `review-body` : soumises au critère 1, hors de tout fil. */
  fetchStandaloneComments(pr: PrRef): Promise<{ comment: CommentInfo; zone: Zone }[]>;

  /** §8.1.2 niveau 1 — branche par défaut. Aucune de ces deux lectures n'est mise en cache,
   * et aucune ne prend donc de `bypassCache` : une exécution ne survit pas à la suivante, ce
   * qu'elle lit est neuf par construction (§8.1.2, §8.1.3 règle 4). */
  fetchConfigFile(pr: PrRef): Promise<ConfigRead>;
  fetchOrgConfig(url: string | null): Promise<ConfigRead>;

  /** §6.3.2 — `by` et `at` sont absents là où la plateforme n'expose pas la provenance. */
  fetchLabels(pr: PrRef): Promise<{ name: string; by?: UserInfo; at?: string }[]>;

  /** §6.4 — relu juste avant publication. */
  fetchHeadSha(pr: PrRef): Promise<string>;

  /** §6.2.4 */
  isDraft(pr: PrRef): Promise<boolean>;

  /** §6.3.1 — format. Appelée seulement quand le mode autorise une publication : c'est le
   * vérificateur qui en décide (§6.2.2), jamais l'adaptateur. */
  publishStatus(pr: PrRef, result: ComplianceResult): Promise<void>;

  /** §6.3.2 — remise à zéro de l'exemption. La SEULE écriture du contrat en dehors du statut,
   * et elle est idempotente : retirer une étiquette absente est sans effet, jamais une erreur.
   * Il n'y a pas d'`addLabel()` — poser l'étiquette pour le compte de quelqu'un n'existait que
   * sur le chemin de repli du §6.3.2, qui demandait une mémoire. */
  removeLabel(pr: PrRef, name: string): Promise<void>;

  /** `resolverOverrideGroup` (§6.1.1). Ce que « groupe » désigne est propre à la plateforme :
   * sur GitHub c'est une liste de comptes, tranchée sans appel d'API (§A.7, §A.8). */
  isInGroup(user: UserInfo, group: string): Promise<boolean>;
}
