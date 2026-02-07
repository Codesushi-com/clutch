// Work Loop types for Convex integration

export type WorkLoopPhase = "cleanup" | "notify" | "review" | "work" | "analyze" | "idle" | "error"
export type WorkLoopStatus = "running" | "paused" | "stopped" | "error"

export interface WorkLoopState {
  id: string
  project_id: string
  status: WorkLoopStatus
  current_phase: string | null
  current_cycle: number
  active_agents: number
  max_agents: number
  last_cycle_at: number | null
  error_message: string | null
  updated_at: number
}

export interface WorkLoopRun {
  id: string
  project_id: string
  cycle: number
  phase: WorkLoopPhase
  action: string
  task_id: string | null
  session_key: string | null
  details: string | null
  duration_ms: number | null
  created_at: number
}

export interface WorkLoopStats {
  actions_today: number
  errors_today: number
  avg_cycle_time_ms: number | null
}

// Active agent from the work loop orchestrator
export interface ActiveAgent {
  pid: number
  taskId: string
  taskTitle: string
  role: string
  model: string
  spawnedAt: number
  lastOutputAt: number
  sessionKey?: string
}
