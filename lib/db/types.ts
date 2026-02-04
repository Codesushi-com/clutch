// Database entity types

export interface Project {
  id: string
  slug: string
  name: string
  description: string | null
  color: string
  repo_url: string | null
  context_path: string | null
  created_at: number
  updated_at: number
}

export type TaskStatus = "backlog" | "ready" | "in_progress" | "review" | "done"
export type TaskPriority = "low" | "medium" | "high" | "urgent"
export type DispatchStatus = "pending" | "spawning" | "active" | "completed" | "failed"

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: string | null
  requires_human_review: number // SQLite boolean (0/1)
  tags: string | null // JSON array stored as text
  session_id: string | null
  dispatch_status: DispatchStatus | null
  dispatch_requested_at: number | null
  dispatch_requested_by: string | null
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
  created_at: number
  updated_at: number
}

export interface ChatMessage {
  id: string
  chat_id: string
  author: string
  content: string
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
