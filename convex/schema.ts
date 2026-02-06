import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // Projects
  projects: defineTable({
    id: v.string(), // UUID primary key
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    repo_url: v.optional(v.string()),
    context_path: v.optional(v.string()),
    local_path: v.optional(v.string()),
    github_repo: v.optional(v.string()),
    chat_layout: v.union(v.literal("slack"), v.literal("imessage")),
    work_loop_enabled: v.boolean(),
    work_loop_schedule: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_slug", ["slug"])
    .index("by_name", ["name"]),

  // Tasks
  tasks: defineTable({
    id: v.string(), // UUID primary key
    project_id: v.string(), // UUID ref to projects
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("backlog"),
      v.literal("ready"),
      v.literal("in_progress"),
      v.literal("in_review"),
      v.literal("done")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent")
    ),
    role: v.optional(v.union(
      v.literal("any"),
      v.literal("pm"),
      v.literal("dev"),
      v.literal("qa"),
      v.literal("research"),
      v.literal("security")
    )),
    assignee: v.optional(v.string()),
    requires_human_review: v.boolean(),
    tags: v.optional(v.string()), // JSON string from SQLite
    session_id: v.optional(v.string()),
    dispatch_status: v.optional(v.union(
      v.literal("pending"),
      v.literal("spawning"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed")
    )),
    dispatch_requested_at: v.optional(v.number()),
    dispatch_requested_by: v.optional(v.string()),
    position: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
    completed_at: v.optional(v.number()),
  })
    .index("by_uuid", ["id"])
    .index("by_project", ["project_id"])
    .index("by_status", ["status"])
    .index("by_project_status", ["project_id", "status"])
    .index("by_assignee", ["assignee"])
    .index("by_project_position", ["project_id", "status", "position"])
    .index("by_session_id", ["session_id"]),

  // Comments
  comments: defineTable({
    id: v.string(), // UUID primary key
    task_id: v.string(), // UUID ref to tasks
    author: v.string(),
    author_type: v.union(
      v.literal("coordinator"),
      v.literal("agent"),
      v.literal("human")
    ),
    content: v.string(),
    type: v.union(
      v.literal("message"),
      v.literal("status_change"),
      v.literal("request_input"),
      v.literal("completion")
    ),
    responded_at: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_task", ["task_id"])
    .index("by_type", ["type"]),

  // Chats
  chats: defineTable({
    id: v.string(), // UUID primary key
    project_id: v.string(), // UUID ref to projects
    title: v.string(),
    participants: v.optional(v.string()), // JSON string from SQLite
    session_key: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_project", ["project_id"])
    .index("by_session_key", ["session_key"]),

  // Chat Messages
  chatMessages: defineTable({
    id: v.string(), // UUID primary key
    chat_id: v.string(), // UUID ref to chats
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.boolean()),
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_chat", ["chat_id"]),

  // Notifications
  notifications: defineTable({
    id: v.string(), // UUID primary key
    task_id: v.optional(v.string()), // UUID ref to tasks
    project_id: v.optional(v.string()), // UUID ref to projects
    type: v.union(
      v.literal("escalation"),
      v.literal("request_input"),
      v.literal("completion"),
      v.literal("system")
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical")
    ),
    title: v.string(),
    message: v.string(),
    agent: v.optional(v.string()),
    read: v.boolean(),
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_read", ["read"])
    .index("by_severity", ["severity"])
    .index("by_created", ["created_at"]),

  // Events (audit trail)
  events: defineTable({
    id: v.string(), // UUID primary key
    project_id: v.optional(v.string()), // UUID ref to projects
    task_id: v.optional(v.string()), // UUID ref to tasks
    type: v.union(
      v.literal("task_created"),
      v.literal("task_moved"),
      v.literal("task_assigned"),
      v.literal("task_completed"),
      v.literal("comment_added"),
      v.literal("agent_started"),
      v.literal("agent_completed"),
      v.literal("chat_created"),
      v.literal("message_sent")
    ),
    actor: v.string(),
    data: v.optional(v.string()), // JSON stored as string
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_project", ["project_id"])
    .index("by_task", ["task_id"])
    .index("by_type", ["type"])
    .index("by_created", ["created_at"]),

  // Signals (unified agent communication)
  signals: defineTable({
    id: v.string(), // UUID primary key
    task_id: v.string(), // UUID ref to tasks
    session_key: v.string(),
    agent_id: v.string(),
    kind: v.union(
      v.literal("question"),
      v.literal("blocker"),
      v.literal("alert"),
      v.literal("fyi")
    ),
    severity: v.union(
      v.literal("normal"),
      v.literal("high"),
      v.literal("critical")
    ),
    message: v.string(),
    blocking: v.boolean(),
    responded_at: v.optional(v.number()),
    response: v.optional(v.string()),
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_task", ["task_id"])
    .index("by_kind", ["kind"])
    .index("by_blocking", ["blocking"])
    .index("by_responded", ["responded_at"])
    .index("by_created", ["created_at"]),

  // Task Dependencies
  taskDependencies: defineTable({
    id: v.string(), // UUID primary key
    task_id: v.string(), // UUID ref to tasks
    depends_on_id: v.string(), // UUID ref to tasks
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_task", ["task_id"])
    .index("by_depends_on", ["depends_on_id"])
    .index("by_task_depends_on", ["task_id", "depends_on_id"]),
})
