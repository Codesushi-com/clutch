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
    work_loop_max_agents: v.optional(v.number()),
    work_loop_schedule: v.optional(v.string()),
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
    prompt_version_id: v.optional(v.string()), // ref to promptVersions
    dispatch_status: v.optional(v.union(
      v.literal("pending"),
      v.literal("spawning"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed")
    )),
    dispatch_requested_at: v.optional(v.number()),
    dispatch_requested_by: v.optional(v.string()),
    // Agent tracking (written by work loop each cycle)
    agent_session_key: v.optional(v.string()),
    agent_model: v.optional(v.string()),
    agent_started_at: v.optional(v.number()),
    agent_last_active_at: v.optional(v.number()),
    agent_tokens_in: v.optional(v.number()),
    agent_tokens_out: v.optional(v.number()),
    agent_output_preview: v.optional(v.string()), // ~500 chars max
    // Git/PR tracking (written by dev agents)
    branch: v.optional(v.string()),
    pr_number: v.optional(v.number()),
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
    .index("by_session_id", ["session_id"])
    .index("by_dispatch_status", ["dispatch_status"]),

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
    delivered_at: v.optional(v.number()), // When notification was sent to user
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_task", ["task_id"])
    .index("by_kind", ["kind"])
    .index("by_blocking", ["blocking"])
    .index("by_responded", ["responded_at"])
    .index("by_delivered", ["delivered_at"])
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

  // Work Loop Runs - audit log of every action the loop takes
  workLoopRuns: defineTable({
    id: v.string(), // UUID primary key
    project_id: v.string(), // UUID ref to projects
    cycle: v.number(),
    phase: v.union(
      v.literal("cleanup"),
      v.literal("notify"),
      v.literal("review"),
      v.literal("work"),
      v.literal("analyze"),
      v.literal("idle"),
      v.literal("error")
    ),
    action: v.string(),
    task_id: v.optional(v.string()), // UUID ref to tasks
    session_key: v.optional(v.string()),
    details: v.optional(v.string()),
    duration_ms: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_project", ["project_id"])
    .index("by_cycle", ["cycle"])
    .index("by_phase", ["phase"])
    .index("by_created", ["created_at"])
    .index("by_project_created", ["project_id", "created_at"]),

  // Work Loop State - current state of each project loop
  workLoopState: defineTable({
    id: v.string(), // UUID primary key
    project_id: v.string(), // UUID ref to projects
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("error")
    ),
    current_phase: v.optional(v.string()),
    current_cycle: v.number(),
    active_agents: v.number(),
    max_agents: v.number(),
    last_cycle_at: v.optional(v.number()),
    error_message: v.optional(v.string()),
    updated_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_project", ["project_id"])
    .index("by_status", ["status"]),

  // Typing State (per chat, reactive via Convex)
  typingState: defineTable({
    chat_id: v.string(), // UUID ref to chats
    author: v.string(), // who is typing (e.g., "ada")
    state: v.union(v.literal("thinking"), v.literal("typing")), // typing state
    updated_at: v.number(), // last update timestamp
  })
    .index("by_chat", ["chat_id"])
    .index("by_chat_author", ["chat_id", "author"]),

  // Prompt Versions - versioned role prompt templates
  promptVersions: defineTable({
    id: v.string(), // UUID primary key
    role: v.string(), // dev, pm, qa, researcher, reviewer, pe, analyzer
    model: v.optional(v.string()), // null = default for role, or specific model
    version: v.number(), // incrementing integer per role+model combo
    content: v.string(), // full template markdown
    change_summary: v.optional(v.string()),
    parent_version_id: v.optional(v.string()), // UUID ref to previous version
    created_by: v.string(), // "seed", "human", "analyzer"
    active: v.boolean(), // is this the current active version?
    created_at: v.number(),
    // A/B testing fields
    ab_status: v.optional(v.union(
      v.literal("control"),
      v.literal("challenger"),
      v.literal("none")
    )),
    ab_split_percent: v.optional(v.number()), // 0-100, % of tasks that get challenger
    ab_started_at: v.optional(v.number()),
    ab_min_tasks: v.optional(v.number()), // minimum tasks before evaluation
  })
    .index("by_uuid", ["id"])
    .index("by_role", ["role"])
    .index("by_role_model", ["role", "model"])
    .index("by_role_active", ["role", "active"]),

  // Task Analyses - post-mortem analysis of completed/failed tasks
  taskAnalyses: defineTable({
    id: v.string(), // UUID primary key
    task_id: v.string(), // UUID ref to tasks
    session_key: v.optional(v.string()),
    role: v.string(),
    model: v.string(),
    prompt_version_id: v.string(), // ref to promptVersions
    outcome: v.union(
      v.literal("success"),
      v.literal("failure"),
      v.literal("partial"),
      v.literal("abandoned")
    ),
    token_count: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    failure_modes: v.optional(v.string()), // JSON array of categorized failures
    amendments: v.optional(v.string()), // JSON array of suggested prompt changes
    amendment_status: v.optional(v.union(
      v.literal("pending"),
      v.literal("applied"),
      v.literal("rejected"),
      v.literal("deferred")
    )),
    amendment_resolved_at: v.optional(v.number()),
    amendment_reject_reason: v.optional(v.string()),
    analysis_summary: v.string(), // human-readable summary
    confidence: v.number(), // 0-1, how confident the analyzer is
    analyzed_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_task", ["task_id"])
    .index("by_role", ["role"])
    .index("by_prompt_version", ["prompt_version_id"])
    .index("by_outcome", ["outcome"])
    .index("by_analyzed", ["analyzed_at"])
    .index("by_amendment_status", ["amendment_status"]),

  // Prompt Metrics - aggregated performance data per role+model+version
  promptMetrics: defineTable({
    id: v.string(), // UUID primary key (composite: role:model:version:period:start)
    role: v.string(),
    model: v.string(),
    prompt_version_id: v.string(),
    period: v.union(v.literal("day"), v.literal("week"), v.literal("all_time")),
    period_start: v.number(), // start of the day/week, or 0 for all_time
    total_tasks: v.number(),
    success_count: v.number(),
    failure_count: v.number(),
    partial_count: v.number(),
    abandoned_count: v.number(),
    avg_tokens: v.number(),
    avg_duration_ms: v.number(),
    bounce_count: v.number(), // tasks that went in_progress → ready
    failure_modes: v.optional(v.string()), // JSON: frequency map of failure categories
    computed_at: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_role_model", ["role", "model"])
    .index("by_prompt_version", ["prompt_version_id"])
    .index("by_period", ["period", "period_start"]),
})
