// @cct/extension — composant A. Les modules exportés ici sont la surface testable ;
// content.ts et background.ts sont les points d'entrée MV3.

export { ClientConfigResolver, resolveUiLanguage, type ResolvedClientConfig } from './config-resolver.js';
export {
  decideGuard,
  resolveInScope,
  feedbackState,
  type GuardDecision,
  type GuardInput,
  type FeedbackState,
} from './guard.js';
export { EditorController, VALIDATION_DEBOUNCE_MS, type ControllerDeps } from './editor-controller.js';
export { buildToolbar } from './ui/toolbar.js';
export { attachQuickInput } from './ui/quickinput.js';
export { FeedbackView } from './ui/feedback.js';
export {
  buildBannerModel,
  renderBanner,
  bannerHasContent,
  localBlockingUnresolved,
  type BannerAnchor,
  type BannerModel,
} from './ui/banner.js';
export { renderThreadFilter, applyLabelFilter, clearLabelFilter } from './ui/thread-filter.js';
export { clearCommentDecorations, decorateComment } from './ui/badges.js';
export { bootstrap, applyCompletionState, writeDegradedState, mergeDirectShortcuts } from './content-internal.js';
export { ui } from './ui/strings.js';
