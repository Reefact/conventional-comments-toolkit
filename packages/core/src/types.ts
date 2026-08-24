// Types partagés (§9.2.1) — aucune dépendance DOM ni plateforme.

export type ResolutionState = 'unresolved' | 'resolved' | 'unknown';

export interface PrRef {
  platform: string; // identifiant d'adaptateur — jamais une union fermée (§9.2.1)
  createdAt: string; // ISO 8601 — décide seule du périmètre (§6.2.3)
  host: string;
  scope: string[];
  number: number | string;
}

export interface UserInfo {
  id: string; // identifiant stable de plateforme, jamais le nom affiché
  login: string;
  displayName?: string;
  isServiceAccount: boolean; // §12 uniquement — n'entre dans aucune règle de validation
}

export interface CommentInfo {
  id: string;
  author: UserInfo;
  body: string; // corps stocké brut — normalisation faite par core/ (§3.4.1)
  createdAt: string;
  updatedAt?: string;
  lastEditedBy?: UserInfo; // §6.1 — absent si la plateforme ne l'expose pas
  permalink: string; // requis par la sortie du check (§6.3.1)
  isSystemGenerated: boolean; // §4.2 — posé par l'adaptateur
  canCarryBlockingState: boolean; // §4.1 — pilote W-NOT-BLOCKABLE
}

export interface ThreadInfo {
  id: string;
  pr: PrRef;
  root: CommentInfo;
  replies: CommentInfo[]; // parcourues pour y trouver une `decision` (§6.1.1)
  resolution: ResolutionState; // normalisé ici ; mapping des états bruts dans l'adaptateur
  resolvedBy?: UserInfo; // absent si la plateforme ne l'expose pas (§6.1)
  resolvedAt?: string;
  canCarryBlockingState: boolean; // hérité de root (§4.1)
}

export interface Diagnostic {
  code: string; // §3.5.2
  severity: 'warn' | 'error'; // après application de `severities` ; `off` n'apparaît jamais
  message: string;
  comment?: CommentInfo; // absent lors d'une validation de saisie
  fix?: { replacement: string }; // §5.3 — la ligne de préfixe entièrement réécrite
}

export type NoticeKind =
  | 'weakening-edit'
  | 'root-deleted'
  | 'resolution-refused'
  | 'resolution-unattributed'
  | 'floor-override'
  | 'invalid-config'
  | 'config-warning'
  | 'config-vanished'
  | 'exemption-reset'
  | 'exemption-refused'
  | 'exemption-label-restored'
  | 'grace-expired'
  | 'unsupported-version';

export interface Notice {
  kind: NoticeKind;
  message: string;
  actor?: UserInfo;
  at?: string;
  ref?: string; // lien permanent, clé de configuration, ou numéro de ligne selon kind
}

export interface ComplianceResult {
  pr: PrRef;
  headSha?: string; // renseigné par le composant B après l'évaluation (§6.4)
  mode: 'off' | 'assist' | 'warn' | 'enforce';
  state: 'success' | 'failure' | 'neutral'; // calculé par core/
  isDraft: boolean;
  activatedAt: string | null;
  headline: string; // résumé humain (§6.3.1), distinct de la ligne cc/1
  configFingerprint: string;
  coreVersion: string;
  formatDiagnostics: (Diagnostic & { comment: CommentInfo })[]; // critère 1, toutes sévérités
  unresolvedBlockingThreads: ThreadInfo[]; // critère 2
  notices: Notice[];
  docUrl: string;
  targetUrl?: string;
  counts: {
    unresolvedThreads: number;
    nonCompliantComments: number;
    warnings: number;
  };
  actions: { removeLabel?: string; addLabel?: string }; // jamais les deux (§6.3.2)
  blockingThreadIds: string[]; // fils bloquants observés à ce tour, résolus compris (§6.1)
  correctedThreadIds: string[]; // exception de correction — à retirer de l'ensemble persisté
  newFirstVerdicts: Record<string, { blocking: boolean; hadConflict: boolean }>;
  exemption?: { by: UserInfo; at: string };
}

export interface PublishedSummary {
  state: 'success' | 'failure' | 'neutral';
  isDraft: boolean;
  exempted: boolean;
  mode: 'off' | 'assist' | 'warn' | 'enforce';
  coreVersion: string;
  configFingerprint: string;
  activatedAt: string | null;
  unresolvedBlockingCount: number; // des fils
  nonCompliantCommentCount: number; // des commentaires
  warningCount: number; // des diagnostics
}

export interface ReviewEvent {
  kind:
    | 'comment.created'
    | 'comment.edited'
    | 'comment.deleted'
    | 'thread.resolved'
    | 'thread.unresolved'
    | 'pr.updated'
    | 'label.added'
    | 'label.removed'
    | 'pr.readyForReview';
  pr: PrRef;
  actor: UserInfo;
  occurredAt: string;
  sequence: number; // attribué par le composant B, jamais par la plateforme (§6.4)
}

export interface Disposable {
  dispose(): void;
}

// ————— §9.2.2 — contrat de core/ —————

export type ConfigRead =
  | { status: 'found'; text: string }
  | { status: 'absent' }
  | { status: 'unreachable'; reason: string };

// `Zone` dit où vit le commentaire (§4.1, §9.2.3).
export type Zone = 'thread-root' | 'reply' | 'review-body' | 'conversation';

export interface PlatformProfile {
  id: string; // jamais une union fermée
  suggestionInfoString: string | null; // §3.5.1 étage 0 ; null = pas d'étage 0
  slashCommands: boolean; // §4.2 — reconnaissance générique de `/[A-Za-z][A-Za-z0-9_-]*`
  commandPrefixes: string[]; // §4.2 — handles de robot (`@codex`), liste fermée, portée par l'adaptateur
}

export interface ValidationInput {
  body: string; // corps brut, avant le prétraitement du §3.4.1
  platform: PlatformProfile;
  isSystemGenerated: boolean;
  zone: Zone;
  canCarryBlockingState: boolean;
  author?: UserInfo;
  comment?: CommentInfo;
}

export interface EvaluationContext {
  activatedAt: string | null; // date effective, résolue par l'orchestrateur
  isDraft: boolean;
  exemption?: { by: UserInfo; at: string; labelPresent: boolean };
  isOverrideMember: (u: UserInfo) => boolean; // résolue en amont via isInGroup()
  knownBlockingThreadIds: string[]; // §6.1 — monotonie
  firstVerdicts: Record<string, { blocking: boolean; hadConflict: boolean }>;
}

export interface EvaluationInput {
  pr: PrRef;
  platform: PlatformProfile;
  threads: ThreadInfo[];
  loose: { comment: CommentInfo; zone: Zone }[];
  config: EffectiveConfig;
  configNotices: Notice[];
  forceState?: { state: 'neutral' | 'failure'; because: NoticeKind };
  ctx: EvaluationContext;
}

// ————— Configuration (§8.2), résolue et bornée —————

export type Mode = 'off' | 'assist' | 'warn' | 'enforce';
export type Severity = 'off' | 'warn' | 'error';

export interface LabelConfig {
  id: string;
  enabled: boolean;
  blockingByDefault: boolean;
  alwaysNonBlocking: boolean;
  icon?: string;
  color?: string;
  aliases: string[];
}

export interface DecorationConfig {
  id: string;
  forces: 'blocking' | 'non-blocking' | null;
}

export interface EffectiveConfig {
  version: number;
  mode: Mode;
  labels: LabelConfig[];
  decorations: { allowFree: boolean; known: DecorationConfig[] };
  severities: Record<string, Severity>;
  scope: { validateReplies: boolean; validateReviewSummary: boolean };
  rules: {
    minSubjectLength: number;
    maxSubjectLength: number;
    minDecisionSubjectLength: number;
  };
  formatSeverity: 'warn' | 'error';
  exemptUsers: string[];
  allowlistPatterns: string[];
  resolverOverrideGroup: string[];
  overrideLabel: string;
  activation: { activatedAt: string | null };
  configUrl: string | null;
  coreMinVersion: string;
  configCacheTtlSeconds: number;
  badgeStyle: string;
  shortcuts: { abbreviations: Record<string, string> };
  docUrl: string;
  server: {
    coalesceWindowSeconds: number;
    gracePeriodSeconds: number;
    reconcileIntervalSeconds: number;
    statusTargetUrl: string | null;
  };
  exemptionLog: { endpoint: string | null };
  language: string | null;
  telemetry: { enabled: boolean; endpoint: string | null };
}

// Document de plancher (§8.1.1).
export interface Floor {
  floorVersion?: number;
  configUrl?: string | null;
  minimumMode?: Mode;
  formatSeverity?: 'warn' | 'error';
  severities?: Record<string, Severity>;
  labels?: { minimum: string[] };
  rules?: { minDecisionSubjectLength?: number };
  activation?: { activatedAt?: string };
  exemptUsers?: { minimum: string[]; closed?: boolean };
  allowlistPatterns?: { minimum: string[]; closed?: boolean };
  resolverOverrideGroup?: string[];
  configCacheTtlSeconds?: number;
}
