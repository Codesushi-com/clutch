// Feature Builder exports - includes both modal and interactive question UI

// Modal-based Feature Builder (from main)
export { FeatureBuilderModal } from "./feature-builder-modal"
export { FeatureBuilderButton } from "./feature-builder-button"
export type { FeatureBuilderStep, FeatureBuilderData, StepConfig } from "./feature-builder-types"
export { STEPS, TOTAL_STEPS } from "./feature-builder-types"

// Interactive Question UI - Implements GSD's selection-based conversation pattern
export { FeatureBuilder } from './feature-builder'
export { QuestionCard } from './question-card'
export { OptionCard } from './option-card'
export { CustomInput } from './custom-input'
export { ProgressIndicator } from './progress-indicator'
export { ConversationHistory } from './conversation-history'

export type {
  Question,
  QuestionOption,
  Answer,
  ConversationMessage,
  FeatureBuilderState,
} from './types'

// Error handling and help
export {
  FeatureBuilderErrorBoundary,
  useFeatureBuilderAnalytics,
  FEATURE_BUILDER_HELP,
} from "./feature-builder-error-boundary"
export type { FeatureBuilderStepId } from "./feature-builder-error-boundary"
export {
  FeatureBuilderHelpTooltip,
  FeatureBuilderStepHeader,
} from "./feature-builder-help"
