// @cct/core — bibliothèque partagée par l'extension (composant A) et le compagnon serveur
// (composant B). Aucune dépendance DOM ni plateforme (§9.1) ; aucune règle de validation
// n'est dupliquée en dehors de ce paquet.

export * from './types.js';
export {
  CORE_VERSION,
  CORE_MAJOR,
  SUPPORTED_CONFIG_VERSION,
  SUPPORTED_FLOOR_VERSION,
  SUMMARY_PREFIX,
} from './version.js';

// §3.4.1 — prétraitement
export {
  splitBody,
  normalizePrefixLine,
  hasDiscussion,
  hasOwnContent,
  containsSuggestionBlock,
  type BodyLines,
} from './preprocess.js';

// §3.4.2 — regex de référence
export {
  REFERENCE_REGEX,
  REFERENCE_REGEX_SOURCE,
  REFERENCE_REGEX_FLAGS,
  EMOJI_TOKEN_SOURCE,
  matchPrefix,
  type PrefixMatch,
} from './regex.js';

// §3.2, §3.3 — labels et décorations
export {
  parseDecorations,
  resolveLabel,
  resolveDecoration,
  enabledLabels,
  closestLabel,
  levenshtein,
  IDENTIFIER_RE,
  type ParsedDecorations,
  type ResolvedLabel,
} from './parser.js';

// §3.5 — validation
export {
  validate,
  isBlocking,
  analyze,
  isCompliant,
  malformedMotif,
  DIAGNOSTIC_ORDER,
  DEFAULT_SEVERITIES,
  type CommentAnalysis,
  type MalformedMotif,
  type ResolvedDecoration,
} from './validator.js';

// §8 — configuration
export { defaultConfig, completeStoredConfig } from './config/defaults.js';
export {
  parseConfigDocument,
  filterAllowlistPatterns,
  hasNestedQuantifier,
  ALLOWLIST_MAX_PATTERNS,
  ALLOWLIST_MAX_LENGTH,
  type ParsedDocument,
} from './config/schema.js';
export { mergeLevel } from './config/merge.js';
export {
  applyFloor,
  vetFloor,
  vettedConfigUrl,
  defaultFloor,
  maxMode,
  minMode,
  maxSeverity,
  minSeverity,
  MODE_SCALE,
} from './config/floor.js';
export { mixPinnedWithLive } from './config/pinning.js';
export { resolveConfig, type ResolvedConfig } from './config/resolve.js';
export { fingerprint, fingerprintDomain } from './config/fingerprint.js';

// §6 — évaluation et ligne cc/1
export { evaluate } from './evaluate.js';
export { encodeSummary, decodeSummary } from './summary.js';

// i18n
export { t, resolveLang, availableLanguages } from './i18n/index.js';
