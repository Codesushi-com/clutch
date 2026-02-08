// Feature Builder exports - includes both modal and interactive question UI

// Modal-based Feature Builder (from main)
export { FeatureBuilderModal } from "./feature-builder-modal"
export { FeatureBuilderButton } from "./feature-builder-button"
export type {
  FeatureBuilderStep,
  FeatureBuilderData,
  StepConfig,
  Requirement,
  RequirementCategory,
  RequirementsExport,
} from "./feature-builder-types"
export {
  STEPS,
  TOTAL_STEPS,
  CATEGORY_CONFIG,
  REQUIREMENT_TEMPLATES,
  generateReqId,
  hasV1Requirements,
  exportRequirements,
  parseRequirementsFromText,
} from "./feature-builder-types"
export { RequirementsTable } from "./requirements-table"

// Interactive Question UI - Implements GSD's selection-based conversation pattern
export { FeatureBuilder } from "./feature-builder"
export { QuestionCard } from "./question-card"
export { OptionCard } from "./option-card"
export { CustomInput } from "./custom-input"
export { ProgressIndicator } from "./progress-indicator"
export { ConversationHistory } from "./conversation-history"

export type {
  Question,
  QuestionOption,
  Answer,
  ConversationMessage,
  FeatureBuilderState,
} from "./types"

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
