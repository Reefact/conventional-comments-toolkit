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
  // `updatedAt` et `lastEditedBy` ont été retirés d'ici : ils n'existaient que pour signaler
  // une édition affaiblissante « avec son auteur » (§6.1), règle qui demandait de se souvenir
  // du corps précédent. Une racine éditée se lit désormais telle qu'elle est.
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
  | 'resolution-refused'
  | 'resolution-unattributed'
  | 'floor-override'
  | 'invalid-config'
  | 'config-warning'
  // §8.1.5 — aucun niveau ne résout `activation.activatedAt`. Un fait de l'état courant,
  // là où `config-vanished` affirmait une DISPARITION, c'est-à-dire une transition entre
  // deux états, que seul un vérificateur doté de mémoire pourrait constater.
  | 'activation-undated'
  | 'exemption-reset'
  | 'exemption-refused'
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
  // §6.3.2 — ce que le vérificateur doit FAIRE en plus de publier. Il n'y a pas d'`addLabel` :
  // poser l'étiquette pour le compte de quelqu'un n'existait que sur le chemin de repli qui
  // demandait une mémoire (§9.2.4).
  actions: { removeLabel?: string };
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
  exemption?: { by: UserInfo; at: string }; // §6.3.2 — lue de l'étiquette et de sa provenance
  isOverrideMember: (u: UserInfo) => boolean; // résolue en amont via isInGroup() (§9.2.4)
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

/** Type d'un label (§3.2, `labels[].kind`) : `remark` OUVRE un point, `reply` n'en ouvre
 * aucun — il répond à un point ou referme l'échange. Ne change aucun verdict : il range le
 * bouton dans sa zone de la barre (§5.1) et sépare les indicateurs (§12). */
export type LabelKind = 'remark' | 'reply';

export interface LabelConfig {
  id: string;
  enabled: boolean;
  blockingByDefault: boolean;
  alwaysNonBlocking: boolean;
  kind: LabelKind;
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
  toolCommands: string[]; // §4.2, §8.2 — `/*` (slash générique) ou `@handle` (mention exacte)
  resolverOverrideGroup: string[];
  overrideLabel: string;
  activation: { activatedAt: string | null };
  configUrl: string | null;
  coreMinVersion: string;
  configCacheTtlSeconds: number;
  badgeStyle: string;
  shortcuts: { abbreviations: Record<string, string> };
  docUrl: string;
  // Ni bloc `server`, ni `exemptionLog` : la fenêtre de coalescence, le délai de grâce,
  // l'intervalle de réconciliation, la `targetUrl` configurable et le journal d'exemption
  // décrivaient tous un service qui survit à son exécution. Le §8.2 ne les liste plus.
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
  toolCommands?: { minimum: string[]; closed?: boolean };
  resolverOverrideGroup?: string[];
  configCacheTtlSeconds?: number;
}
