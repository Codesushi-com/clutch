// Worker types for the work loop orchestrator

export interface WorkLoopConfig {
  projectId: string
  projectSlug: string
  githubRepo: string
  localPath: string
  staleTaskMinutes: number
  staleReviewMinutes: number
  worktreesPath: string
}

export interface ChildProcessInfo {
  pid: number
  lastOutputAt: number
  taskId: string
  sessionKey?: string
}

export interface ChildManager {
  spawn(taskId: string, command: string, args: string[]): { pid: number } | null
  hasChild(taskId: string): boolean
  getChild(taskId: string): ChildProcessInfo | undefined
  killChild(taskId: string): boolean
  getAllChildren(): Map<string, ChildProcessInfo>
  updateLastOutput(taskId: string): void
}

export interface SessionInfo {
  sessionKey: string
  taskId: string
  updatedAt: number
  status: "active" | "idle" | "completed"
}

export interface LogRunParams {
  projectId: string
  cycle: number
  phase: "cleanup" | "review" | "work"
  action: string
  taskId?: string
  details?: Record<string, unknown>
  error?: string
}

export interface PhaseContext {
  convex: import("convex/browser").ConvexHttpClient
  children: ChildManager
  config: WorkLoopConfig
  cycle: number
  log: (params: LogRunParams) => Promise<void>
}
