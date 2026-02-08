export type FeatureBuilderStep =
  | 'overview'
  | 'research'
  | 'requirements'
  | 'design'
  | 'implementation'
  | 'breakdown'
  | 'qa'
  | 'testing'
  | 'review'
  | 'launch'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskRole = 'pm' | 'dev' | 'research' | 'reviewer'

export interface GeneratedTask {
  id: string // Temporary ID for editing
  title: string
  description: string
  priority: TaskPriority
  role: TaskRole
  phaseIndex: number // Which phase this task belongs to
  dependsOn: string[] // IDs of tasks this depends on
}

export interface TaskPhase {
  index: number
  name: string
  description: string
  tasks: GeneratedTask[]
}

export interface TaskBreakdown {
  phases: TaskPhase[]
  isGenerating: boolean
  createdTaskIds?: string[] // IDs of tasks after creation
  error?: string
}

export interface QAValidation {
  checklist: {
    completeness: boolean
    clarity: boolean
    requirementsCoverage: boolean
    dependencies: boolean
    missingPieces: boolean
  }
  notes: string
}

export interface FeatureBuilderData {
  // Overview step
  name: string
  description: string
  projectId: string

  // Research step
  research: ResearchProgress | null

  // Requirements step
  requirements: string[]
  acceptanceCriteria: string[]

  // Design step
  designNotes: string
  technicalApproach: string

  // Implementation step
  implementationPlan: string
  estimatedHours: number

  // Breakdown step
  taskBreakdown: TaskBreakdown | null

  // QA validation step
  qaValidation: QAValidation

  // Testing step
  testStrategy: string
  testCases: string[]

  // Review step
  reviewNotes: string

  // Launch step
  launchChecklist: string[]
}

export interface StepConfig {
  id: FeatureBuilderStep
  label: string
  description: string
  index: number
}

export type ResearchThreadStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ResearchThread {
  id: string
  name: string
  description: string
  status: ResearchThreadStatus
  progress: number // 0-100
  result: string | null
  error: string | null
  startedAt: number | null
  completedAt: number | null
}

export interface ResearchProgress {
  threads: ResearchThread[]
  overallProgress: number // 0-100
  isComplete: boolean
  hasErrors: boolean
}

export const STEPS: StepConfig[] = [
  { id: 'overview', label: 'Overview', description: 'Feature name and basic info', index: 0 },
  { id: 'research', label: 'Research', description: 'Parallel research across domains', index: 1 },
  { id: 'requirements', label: 'Requirements', description: 'Define what needs to be built', index: 2 },
  { id: 'design', label: 'Design', description: 'Technical design and approach', index: 3 },
  { id: 'implementation', label: 'Implementation', description: 'Plan the development work', index: 4 },
  { id: 'breakdown', label: 'Breakdown', description: 'Convert plan to tasks', index: 5 },
  { id: 'qa', label: 'QA', description: 'Validate generated task plan', index: 6 },
  { id: 'testing', label: 'Testing', description: 'Define test strategy', index: 7 },
  { id: 'review', label: 'Review', description: 'Final review before creation', index: 8 },
  { id: 'launch', label: 'Launch', description: 'Create the feature ticket', index: 9 },
]

export const TOTAL_STEPS = STEPS.length

export function getStepConfig(stepId: FeatureBuilderStep): StepConfig {
  return STEPS.find(s => s.id === stepId) ?? STEPS[0]
}

export function getStepByIndex(index: number): StepConfig | undefined {
  return STEPS[index]
}

export function isFirstStep(stepId: FeatureBuilderStep): boolean {
  return stepId === 'overview'
}

export function isLastStep(stepId: FeatureBuilderStep): boolean {
  return stepId === 'launch'
}

export function getNextStep(stepId: FeatureBuilderStep): FeatureBuilderStep | null {
  const current = getStepConfig(stepId)
  const next = getStepByIndex(current.index + 1)
  return next?.id ?? null
}

export function getPreviousStep(stepId: FeatureBuilderStep): FeatureBuilderStep | null {
  const current = getStepConfig(stepId)
  const prev = getStepByIndex(current.index - 1)
  return prev?.id ?? null
}
