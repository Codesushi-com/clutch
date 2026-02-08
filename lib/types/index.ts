// Database entity types

// Re-export agent types
export type {
  AgentStatus,
  Agent,
  AgentDetail,
  AgentListResponse,
  AgentListParams,
} from './agent'

// Re-export session types
export type {
  SessionStatus,
  SessionType,
  Session,
  SessionListResponse,
  SessionListParams,
  RPCRequest,
  RPCResponse,
  RPCError,
  SessionMessage,
  SessionPreview,
} from './session'

// Re-export work loop types
export type {
  WorkLoopPhase,
  WorkLoopStatus,
  WorkLoopState,
  WorkLoopRun,
  WorkLoopStats,
  ActiveAgent,
} from './work-loop'

export interface Project {
  id: string
  slug: string
  name: string
  description: string | null
  color: string
  repo_url: string | null
  context_path: string | null
  local_path: string | null
  github_repo: string | null
  chat_layout: 'slack' | 'imessage'
  work_loop_enabled: number  // SQLite boolean (0/1)
  work_loop_max_agents: number | null
  created_at: number
  updated_at: number
}

export type TaskStatus = "backlog" | "ready" | "in_progress" | "in_review" | "blocked" | "done"
export type TaskPriority = "low" | "medium" | "high" | "urgent"
export type TaskRole = "pm" | "dev" | "research" | "reviewer"
export type DispatchStatus = "pending" | "spawning" | "active" | "completed" | "failed"

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  role: TaskRole | null
  assignee: string | null
  requires_human_review: number // SQLite boolean (0/1)
  tags: string | null // JSON array stored as text
  session_id: string | null
  prompt_version_id: string | null // ref to promptVersions
  dispatch_status: DispatchStatus | null
  dispatch_requested_at: number | null
  dispatch_requested_by: string | null
  agent_session_key: string | null
  agent_model: string | null
  agent_started_at: number | null
  agent_last_active_at: number | null
  agent_tokens_in: number | null
  agent_tokens_out: number | null
  agent_output_preview: string | null
  agent_retry_count: number | null
  triage_sent_at: number | null
  auto_triage_count: number | null
  escalated: number | null
  escalated_at: number | null
  branch: string | null
  pr_number: number | null
  review_comments: string | null
  review_count: number | null
  position: number
  created_at: number
  updated_at: number
  completed_at: number | null
}

export type AuthorType = "coordinator" | "agent" | "human"
export type CommentType = "message" | "status_change" | "request_input" | "completion"

export interface Comment {
  id: string
  task_id: string
  author: string
  author_type: AuthorType
  content: string
  type: CommentType
  responded_at: number | null
  created_at: number
}

export interface Chat {
  id: string
  project_id: string
  title: string
  participants: string | null // JSON array stored as text
  session_key: string | null
  created_at: number
  updated_at: number
}

export interface ChatMessage {
  id: string
  chat_id: string
  author: string
  content: string
  run_id?: string | null
  session_key?: string | null
  is_automated?: number | null  // SQLite boolean (0/1) - true for cron/sub-agent messages
  created_at: number
}

export type NotificationType = "escalation" | "request_input" | "completion" | "system"
export type NotificationSeverity = "info" | "warning" | "critical"

export interface Notification {
  id: string
  task_id: string | null
  project_id: string | null
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  agent: string | null
  read: number // SQLite boolean
  created_at: number
}

export type EventType = 
  | "task_created"
  | "task_moved"
  | "task_assigned"
  | "task_completed"
  | "comment_added"
  | "agent_started"
  | "agent_completed"
  | "chat_created"
  | "message_sent"

export interface Event {
  id: string
  project_id: string | null
  task_id: string | null
  type: EventType
  actor: string
  data: string | null // JSON stored as text
  created_at: number
}

export type SignalKind = "question" | "blocker" | "alert" | "fyi"
export type SignalSeverity = "normal" | "high" | "critical"
export type SignalNotificationStatus = "pending" | "sent" | "failed"

export interface Signal {
  id: string
  task_id: string
  session_key: string
  agent_id: string
  kind: SignalKind
  severity: SignalSeverity
  message: string
  blocking: number // SQLite boolean (1/0)
  responded_at: number | null
  response: string | null
  delivered_at: number | null // When notification was sent to user
  notification_status: SignalNotificationStatus | null
  notification_error: string | null
  created_at: number
}

// Insert types (without id, with optional timestamps)
export type ProjectInsert = Omit<Project, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: number
  updated_at?: number
}

export type TaskInsert = Omit<Task, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: number
  updated_at?: number
}

export type CommentInsert = Omit<Comment, "id" | "created_at"> & {
  id?: string
  created_at?: number
}

export type ChatInsert = Omit<Chat, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: number
  updated_at?: number
}

export type ChatMessageInsert = Omit<ChatMessage, "id" | "created_at"> & {
  id?: string
  created_at?: number
}

export type EventInsert = Omit<Event, "id" | "created_at"> & {
  id?: string
  created_at?: number
}

export type SignalInsert = Omit<Signal, "id" | "created_at"> & {
  id?: string
  created_at?: number
}

export interface TaskDependency {
  id: string
  task_id: string
  depends_on_id: string
  created_at: number
}

export type TaskDependencyInsert = Omit<TaskDependency, "id" | "created_at"> & {
  id?: string
  created_at?: number
}

// Task with minimal fields for dependency listings
export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
}

// Task summary with dependency relationship ID for managing dependencies
export interface TaskDependencySummary extends TaskSummary {
  dependency_id: string
}

// Task Event Types
type TaskEventType =
  | "status_changed"
  | "agent_assigned"
  | "agent_completed"
  | "agent_reaped"
  | "pr_opened"
  | "pr_merged"
  | "comment_added"

export interface TaskEvent {
  id: string
  task_id: string
  project_id: string
  event_type: TaskEventType
  timestamp: number
  actor: string | null
  data: string | null // JSON string with event-specific fields
}
