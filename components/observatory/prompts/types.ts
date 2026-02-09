/**
 * Types for prompt metrics
 * Migrated from app/prompts/metrics/types.ts
 */

export interface AnalysisRecord {
  id: string
  task_id: string
  role: string
  model: string
  prompt_version_id: string
  outcome: string
  token_count: number | null
  duration_ms: number | null
  failure_modes: string[]
  confidence: number
  analyzed_at: number
}

export interface PromptVersionSummary {
  id: string
  role: string
  model: string
  version: number
  active: boolean
  created_at: number
  change_summary: string | null
}

export interface FilterOptions {
  roles: string[]
  models: string[]
}

export interface MetricsData {
  analyses: AnalysisRecord[]
  promptVersions: PromptVersionSummary[]
  filterOptions: FilterOptions
}
