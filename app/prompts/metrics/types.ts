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

export type TimeRange = '7d' | '30d' | '90d' | 'all'

export function timeRangeToMs(range: TimeRange): number | null {
  const now = Date.now()
  switch (range) {
    case '7d': return now - 7 * 24 * 60 * 60 * 1000
    case '30d': return now - 30 * 24 * 60 * 60 * 1000
    case '90d': return now - 90 * 24 * 60 * 60 * 1000
    case 'all': return null
  }
}
