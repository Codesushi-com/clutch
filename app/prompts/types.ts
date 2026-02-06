export interface PromptVersion {
  id: string
  role: string
  model?: string
  version: number
  content: string
  change_summary?: string
  parent_version_id?: string
  created_by: string
  active: boolean
  created_at: number
  ab_status?: 'control' | 'challenger' | 'none'
  ab_split_percent?: number
  ab_started_at?: number
  ab_min_tasks?: number
}

export interface ABTestMetrics {
  version_id: string
  version: number
  total_tasks: number
  successes: number
  failures: number
  partials: number
  abandoned: number
  success_rate: number
  avg_confidence: number
  avg_duration_ms: number | null
  avg_tokens: number | null
}

export interface ABTestState {
  active: boolean
  role: string
  model?: string
  control: PromptVersion | null
  challenger: PromptVersion | null
  split_percent: number
  min_tasks: number
  started_at: number | null
  control_metrics: ABTestMetrics | null
  challenger_metrics: ABTestMetrics | null
}
