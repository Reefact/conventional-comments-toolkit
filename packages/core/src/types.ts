// Types partagés (§9.2.1) — aucune dépendance DOM ni plateforme.

export type ResolutionState = 'unresolved' | 'resolved' | 'unknown';

export interface PrRef {
  platform: string; // identifiant d'adaptateur — jamais une union fermée (§9.2.1)
  /** Retiré du §9.2.1 avec le périmètre d'activation (§2) : plus rien ne le lit. Optionnel le
   * temps que les adaptateurs cessent de l'écrire ; retiré ensuite. */
  createdAt?: string;
  host: string;
  scope: string[];
  number: number | string;
}

export interface UserInfo {
  id: string; // identifiant stable de plateforme, jamais le nom affiché
  login: string;
  displayName?: string;
  /** Retiré du §9.2.1 avec l'indicateur du §12 qu'il servait (§2). Optionnel le temps que les
   * adaptateurs cessent de l'écrire ; retiré ensuite. */
  isServiceAccount?: boolean;
}

export interface CommentInfo {
  id: string;
  author: UserInfo;
  body: string; // corps stocké brut — normalisation faite par core/ (§3.4.1)
  createdAt: string;
  // `updatedAt` et `lastEditedBy` ont été retirés d'ici : ils n'existaient que pour signaler
  // une édition affaiblissante « avec son auteur » (§6.1), règle qui demandait de se souvenir
  // du corps précédent. Une racine éditée se lit désormais telle qu'elle est.
  permalink: string; // lien permanent du commentaire
  isSystemGenerated: boolean; // §4.2 — posé par l'adaptateur
  canCarryBlockingState: boolean; // §4.1 — pilote W-NOT-BLOCKABLE
}

export interface ThreadInfo {
  id: string;
  pr: PrRef;
  root: CommentInfo;
  replies: CommentInfo[]; // §4.1 — réponses du fil
  resolution: ResolutionState; // normalisé ici ; mapping des états bruts dans l'adaptateur
  /** Retirés du §9.2.1 avec la gouvernance des résolutions (§6.1) : plus rien ne les lit.
   * L'adaptateur GitLab écrit encore `resolvedBy` ; retirés quand il aura cessé. */
  resolvedBy?: UserInfo;
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

// Avis de configuration, affichés dans la pastille et la page d'options (§5.3, §9.2.1).
export type NoticeKind =
  | 'floor-override' // §8.1.2 — clé de dépôt ignorée au titre du plancher
  | 'invalid-config' // §8.1.5 — JSON invalide ou valeur hors domaine
  | 'config-warning' // §8.1.5 — clé inconnue ignorée ; §8.2 — entrée écartée ; §7 — `warn`
  | 'unsupported-version'; // §8.1.5, §8.1.3 — schéma, plancher ou core/ trop récent

export interface Notice {
  kind: NoticeKind;
  message: string;
  actor?: UserInfo;
  at?: string;
  ref?: string; // lien permanent, clé de configuration, ou numéro de ligne selon kind
}

/** Le résumé que publiait le vérificateur retiré (§2), lu par l'adaptateur GitHub jusqu'à ce
 * qu'il cesse de le faire ; retiré avec `summary.ts` ensuite. Plus rien du code partagé ne le
 * lit. */
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

// ————— Configuration (§8.2), résolue et bornée —————

// `warn` n'en fait plus partie : il est lu comme `assist`, et signalé (§7).
export type Mode = 'off' | 'assist' | 'enforce';
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
  /** Signification du label, affichée en infobulle sur le badge (§5.5, §8.2), et sur le bouton
   * à défaut de `usage`. Absente, l'interface rend celle de son catalogue, s'il en a une ; écrite,
   * elle la REMPLACE, et une chaîne vide retire l'infobulle. Ne change aucun verdict, et n'entre
   * donc pas dans l'empreinte (§9.2.2). */
  description?: string;
  /** Consigne d'emploi, affichée en infobulle sur le bouton (§5.1, §8.2). Mêmes règles que
   * `description` : écrite, elle remplace le texte du catalogue et son exemple ; vide, elle retire
   * l'infobulle ; absente, le bouton prend `description`, puis le catalogue. */
  usage?: string;
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
  exemptUsers: string[];
  allowlistPatterns: string[];
  toolCommands: string[]; // §4.2, §8.2 — `/*` (slash générique) ou `@handle` (mention exacte)
  configUrl: string | null;
  coreMinVersion: string;
  configCacheTtlSeconds: number;
  badgeStyle: string;
  /** Icône du marqueur de session affiché (§3.6, §5.5) — présentation seule, aucun verdict. */
  sessionIcon: string;
  shortcuts: { abbreviations: Record<string, string> };
  language: string | null;
  telemetry: { enabled: boolean; endpoint: string | null };
}

// Document de plancher (§8.1.1).
export interface Floor {
  floorVersion?: number;
  configUrl?: string | null;
  minimumMode?: Mode;
  severities?: Record<string, Severity>;
  labels?: { minimum: string[] };
  rules?: { minDecisionSubjectLength?: number };
  exemptUsers?: { minimum: string[]; closed?: boolean };
  allowlistPatterns?: { minimum: string[]; closed?: boolean };
  toolCommands?: { minimum: string[]; closed?: boolean };
  configCacheTtlSeconds?: number;
}
