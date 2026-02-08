import type { LucideIcon } from "lucide-react"

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

// GSD Requirement Categories
export type RequirementCategory = "v1" | "v2" | "out-of-scope"

export interface Requirement {
  id: string // REQ-001, REQ-002, etc.
  description: string
  category: RequirementCategory
  source: "research" | "conversation" | "inferred"
  notes?: string
}

export interface RequirementsExport {
  version: "1.0"
  generatedAt: number
  featureName: string
  projectId: string
  v1: Requirement[]
  v2: Requirement[]
  outOfScope: Requirement[]
  summary: {
    totalCount: number
    v1Count: number
    v2Count: number
    outOfScopeCount: number
  }
}

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

  // Requirements step - structured format
  requirements: Requirement[]
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
  icon?: LucideIcon
}

export type ResearchThreadStatus = "pending" | "running" | "completed" | "failed"

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

// GSD Requirements Templates
export const REQUIREMENT_TEMPLATES = {
  v1: [
    {
      description: "User can [action] via [method]",
      example: "User can log in via email and password",
    },
    {
      description: "System validates [input] and shows [feedback]",
      example: "System validates email format and shows inline error",
    },
    {
      description: "[Entity] persists [data] to [storage]",
      example: "User preferences persist to local database",
    },
    {
      description: "API endpoint [method] /[path] returns [response]",
      example: "API endpoint POST /api/auth/login returns JWT token",
    },
  ],
  v2: [
    {
      description: "[Feature] supports [enhancement] for [use case]",
      example: "Login supports social providers for enterprise SSO",
    },
    {
      description: "[Data] can be [action] in [format]",
      example: "Reports can be exported in CSV and PDF formats",
    },
    {
      description: "Admin can [action] via [interface]",
      example: "Admin can manage users via dashboard",
    },
  ],
  outOfScope: [
    {
      description: "[Feature] - deferred to [phase/milestone]",
      example: "Mobile app support - deferred to Phase 2",
    },
    {
      description: "[Integration] - requires [dependency]",
      example: "Salesforce integration - requires enterprise license",
    },
  ],
}

// Category labels and colors for UI
export const CATEGORY_CONFIG: Record<
  RequirementCategory,
  { label: string; color: string; description: string }
> = {
  v1: {
    label: "V1 (Must Have)",
    color: "bg-green-100 text-green-800 border-green-200",
    description: "Critical for MVP - cannot launch without",
  },
  v2: {
    label: "V2 (Should Have)",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    description: "Important but not blocking - post-MVP",
  },
  "out-of-scope": {
    label: "Out of Scope",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    description: "Intentionally excluded - documented for clarity",
  },
}

export function getStepConfig(stepId: FeatureBuilderStep): StepConfig {
  return STEPS.find((s) => s.id === stepId) ?? STEPS[0]
}

export function getStepByIndex(index: number): StepConfig | undefined {
  return STEPS[index]
}

export function isFirstStep(stepId: FeatureBuilderStep): boolean {
  return stepId === "overview"
}

export function isLastStep(stepId: FeatureBuilderStep): boolean {
  return stepId === "launch"
}

export function getNextStep(
  stepId: FeatureBuilderStep
): FeatureBuilderStep | null {
  const current = getStepConfig(stepId)
  const next = getStepByIndex(current.index + 1)
  return next?.id ?? null
}

export function getPreviousStep(
  stepId: FeatureBuilderStep
): FeatureBuilderStep | null {
  const current = getStepConfig(stepId)
  const prev = getStepByIndex(current.index - 1)
  return prev?.id ?? null
}

// Generate a new REQ-ID based on existing requirements
export function generateReqId(existingRequirements: Requirement[]): string {
  const maxNum = existingRequirements.reduce((max, req) => {
    const match = req.id.match(/REQ-(\d+)/)
    if (match) {
      return Math.max(max, Number.parseInt(match[1], 10))
    }
    return max
  }, 0)
  return `REQ-${String(maxNum + 1).padStart(3, "0")}`
}

// Validate that at least one v1 requirement exists
export function hasV1Requirements(requirements: Requirement[]): boolean {
  return requirements.some((req) => req.category === "v1")
}

// Get requirements by category
export function getRequirementsByCategory(
  requirements: Requirement[],
  category: RequirementCategory
): Requirement[] {
  return requirements.filter((req) => req.category === category)
}

// Export requirements to structured format
export function exportRequirements(
  data: Pick<FeatureBuilderData, "name" | "projectId" | "requirements">
): RequirementsExport {
  const v1 = getRequirementsByCategory(data.requirements, "v1")
  const v2 = getRequirementsByCategory(data.requirements, "v2")
  const outOfScope = getRequirementsByCategory(data.requirements, "out-of-scope")

  return {
    version: "1.0",
    generatedAt: Date.now(),
    featureName: data.name,
    projectId: data.projectId,
    v1,
    v2,
    outOfScope,
    summary: {
      totalCount: data.requirements.length,
      v1Count: v1.length,
      v2Count: v2.length,
      outOfScopeCount: outOfScope.length,
    },
  }
}

// Import requirements from text (AI generation helper)
export function parseRequirementsFromText(
  text: string,
  source: Requirement["source"] = "inferred"
): Requirement[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "")
  const requirements: Requirement[] = []

  let currentCategory: RequirementCategory = "v1"

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect category headers
    if (/^v1[:\s]|must have/i.test(trimmed)) {
      currentCategory = "v1"
      continue
    }
    if (/^v2[:\s]|should have|nice to have/i.test(trimmed)) {
      currentCategory = "v2"
      continue
    }
    if (/^out of scope|won'?t have|excluded/i.test(trimmed)) {
      currentCategory = "out-of-scope"
      continue
    }

    // Skip empty or header-only lines
    if (!trimmed || trimmed.startsWith("#")) continue

    // Extract REQ-ID if present
    let id = ""
    let description = trimmed
    const idMatch = trimmed.match(/^(REQ-\d+)[:\s]+(.+)$/i)
    if (idMatch) {
      id = idMatch[1].toUpperCase()
      description = idMatch[2]
    }

    requirements.push({
      id,
      description,
      category: currentCategory,
      source,
      notes: "",
    })
  }

  // Assign IDs to requirements that don't have them
  let nextId = 1
  for (const req of requirements) {
    if (!req.id) {
      // Find next available ID
      while (
        requirements.some((r) => r.id === `REQ-${String(nextId).padStart(3, "0")}`)
      ) {
        nextId++
      }
      req.id = `REQ-${String(nextId).padStart(3, "0")}`
      nextId++
    }
  }

  return requirements
}
