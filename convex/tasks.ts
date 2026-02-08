import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Task, Comment, TaskSummary, TaskDependencySummary } from '../lib/types'
import { logTaskEvent } from './task_events'

// ============================================
// Type Helpers
// ============================================

type TaskStatus = "backlog" | "ready" | "in_progress" | "in_review" | "blocked" | "done"
type TaskPriority = "low" | "medium" | "high" | "urgent"
type TaskRole = "pm" | "dev" | "research" | "reviewer"
type DispatchStatus = "pending" | "spawning" | "active" | "completed" | "failed"

// Convert Convex document to Task type
function toTask(doc: {
  id: string
  project_id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  role?: TaskRole
  assignee?: string
  requires_human_review: boolean
  tags?: string
  session_id?: string
  prompt_version_id?: string
  dispatch_status?: DispatchStatus
  dispatch_requested_at?: number
  dispatch_requested_by?: string
  agent_session_key?: string
  agent_model?: string
  agent_started_at?: number
  agent_last_active_at?: number
  agent_tokens_in?: number
  agent_tokens_out?: number
  agent_output_preview?: string
  agent_retry_count?: number
  triage_sent_at?: number
  auto_triage_count?: number
  escalated?: boolean
  escalated_at?: number
  branch?: string
  pr_number?: number
  review_comments?: string
  review_count?: number
  position: number
  created_at: number
  updated_at: number
  completed_at?: number
}): Task {
  return {
    id: doc.id,
    project_id: doc.project_id,
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    role: doc.role ?? null,
    assignee: doc.assignee ?? null,
    requires_human_review: doc.requires_human_review ? 1 : 0,
    tags: doc.tags ?? null,
    session_id: doc.session_id ?? null,
    prompt_version_id: doc.prompt_version_id ?? null,
    dispatch_status: doc.dispatch_status ?? null,
    dispatch_requested_at: doc.dispatch_requested_at ?? null,
    dispatch_requested_by: doc.dispatch_requested_by ?? null,
    agent_session_key: doc.agent_session_key ?? null,
    agent_model: doc.agent_model ?? null,
    agent_started_at: doc.agent_started_at ?? null,
    agent_last_active_at: doc.agent_last_active_at ?? null,
    agent_tokens_in: doc.agent_tokens_in ?? null,
    agent_tokens_out: doc.agent_tokens_out ?? null,
    agent_output_preview: doc.agent_output_preview ?? null,
    agent_retry_count: doc.agent_retry_count ?? null,
    triage_sent_at: (doc as { triage_sent_at?: number }).triage_sent_at ?? null,
    auto_triage_count: (doc as { auto_triage_count?: number }).auto_triage_count ?? null,
    escalated: (doc as { escalated?: boolean }).escalated ? 1 : 0,
    escalated_at: (doc as { escalated_at?: number }).escalated_at ?? null,
    cost_total: (doc as { cost_total?: number }).cost_total ?? null,
    branch: doc.branch ?? null,
    pr_number: doc.pr_number ?? null,
    review_comments: doc.review_comments ?? null,
    review_count: doc.review_count ?? null,
    position: doc.position,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    completed_at: doc.completed_at ?? null,
  }
}

// Convert Convex comment document to Comment type
function toComment(doc: {
  id: string
  task_id: string
  author: string
  author_type: "coordinator" | "agent" | "human"
  content: string
  type: "message" | "status_change" | "request_input" | "completion"
  responded_at?: number
  created_at: number
}): Comment {
  return {
    id: doc.id,
    task_id: doc.task_id,
    author: doc.author,
    author_type: doc.author_type,
    content: doc.content,
    type: doc.type,
    responded_at: doc.responded_at ?? null,
    created_at: doc.created_at,
  }
}

// Convert Convex task doc to TaskSummary
function toTaskSummary(doc: {
  id: string
  title: string
  status: TaskStatus
}): TaskSummary {
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get tasks by status
 */
export const getByStatus = query({
  args: {
    status: v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('blocked'),
      v.literal('done')
    ),
  },
  handler: async (ctx, args): Promise<Task[]> => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_status', (q) => q.eq('status', args.status))
      .collect()

    return tasks
      .sort((a, b) => a.position - b.position)
      .map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

/**
 * Get tasks with pending dispatch status.
 * Optionally filter by project ID.
 */
export const getPendingDispatches = query({
  args: {
    projectId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Task[]> => {
    let tasks

    if (args.projectId) {
      // Get pending dispatches for a specific project
      // Use by_project index and filter by dispatch_status
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('project_id', args.projectId!))
        .filter((q) => q.eq('dispatch_status', 'pending'))
        .collect()
    } else {
      // Get all pending dispatches across all projects
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_dispatch_status', (q) => q.eq('dispatch_status', 'pending'))
        .collect()
    }

    // Sort by priority then dispatch time
    const priorityOrder: Record<TaskPriority, number> = { urgent: 1, high: 2, medium: 3, low: 4 }
    return tasks
      .sort((a, b) => {
        const pa = priorityOrder[a.priority as TaskPriority] || 3
        const pb = priorityOrder[b.priority as TaskPriority] || 3
        if (pa !== pb) return pa - pb
        return (a.dispatch_requested_at ?? 0) - (b.dispatch_requested_at ?? 0)
      })
      .map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

/**
 * Get tasks by project with optional status filter
 */
export const getByProject = query({
  args: {
    projectId: v.string(),
    status: v.optional(v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('blocked'),
      v.literal('done')
    )),
  },
  handler: async (ctx, args): Promise<Task[]> => {
    let tasks

    if (args.status) {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) =>
          q.eq('project_id', args.projectId).eq('status', args.status!)
        )
        .collect()
    } else {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
        .collect()
    }

    const sortedTasks = tasks.sort((a, b) => {
      if (a.status === 'done' && b.status === 'done') {
        return (b.completed_at ?? 0) - (a.completed_at ?? 0)
      }
      return a.position - b.position
    })

    return sortedTasks.map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

/**
 * Get tasks by project and status with pagination support.
 * Returns a page of tasks plus the total count for the column header.
 */
export const getByProjectAndStatusPaginated = query({
  args: {
    projectId: v.string(),
    status: v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('blocked'),
      v.literal('done')
    ),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ tasks: Task[]; totalCount: number }> => {
    const limit = args.limit ?? 25
    const offset = args.offset ?? 0

    // Get all tasks for this project and status to calculate total count
    const allTasks = await ctx.db
      .query('tasks')
      .withIndex('by_project_status', (q) =>
        q.eq('project_id', args.projectId).eq('status', args.status)
      )
      .collect()

    const totalCount = allTasks.length

    // Sort tasks: done by completed_at desc, others by position asc
    const sortedTasks = allTasks.sort((a, b) => {
      if (args.status === 'done') {
        return (b.completed_at ?? b.updated_at) - (a.completed_at ?? a.updated_at)
      }
      return a.position - b.position
    })

    // Apply pagination
    const paginatedTasks = sortedTasks.slice(offset, offset + limit)

    return {
      tasks: paginatedTasks.map((t) => toTask(t as Parameters<typeof toTask>[0])),
      totalCount,
    }
  },
})

/**
 * Get a single task by UUID with its comments
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<{ task: Task; comments: Comment[] } | null> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!task) {
      return null
    }

    const comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()

    return {
      task: toTask(task as Parameters<typeof toTask>[0]),
      comments: comments.map((c) => toComment(c as Parameters<typeof toComment>[0])),
    }
  },
})

/**
 * Get tasks assigned to a specific user
 */
export const getByAssignee = query({
  args: { assignee: v.string() },
  handler: async (ctx, args): Promise<Task[]> => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_assignee', (q) => q.eq('assignee', args.assignee))
      .collect()

    const statusOrder: Record<TaskStatus, number> = {
      in_progress: 0,
      in_review: 1,
      blocked: 2,
      ready: 3,
      backlog: 4,
      done: 5,
    }

    return tasks
      .sort((a, b) => {
        const statusDiff = statusOrder[a.status as TaskStatus] - statusOrder[b.status as TaskStatus]
        if (statusDiff !== 0) return statusDiff
        return a.position - b.position
      })
      .map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

/**
 * Get task with its dependency information
 */
export const getWithDependencies = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<{
    task: Task
    dependencies: TaskDependencySummary[]
    blockedBy: TaskSummary[]
  } | null> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!task) {
      return null
    }

    // Get tasks this task depends on
    const dependencyLinks = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()

    const dependencies: TaskDependencySummary[] = []
    for (const link of dependencyLinks) {
      const depTask = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', link.depends_on_id))
        .unique()
      if (depTask) {
        dependencies.push({
          ...toTaskSummary(depTask as Parameters<typeof toTaskSummary>[0]),
          dependency_id: link.id,
        })
      }
    }

    // Get tasks that depend on this task
    const blockedLinks = await ctx.db
      .query('taskDependencies')
      .withIndex('by_depends_on', (q) => q.eq('depends_on_id', args.id))
      .collect()

    const blockedBy: TaskSummary[] = []
    for (const link of blockedLinks) {
      const blockedTask = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', link.task_id))
        .unique()
      if (blockedTask) {
        blockedBy.push(toTaskSummary(blockedTask as Parameters<typeof toTaskSummary>[0]))
      }
    }

    return {
      task: toTask(task as Parameters<typeof toTask>[0]),
      dependencies,
      blockedBy,
    }
  },
})

/**
 * Get tasks with active agents for a project
 * Returns tasks that have an agent_session_key set and are still active.
 * An agent is considered active if:
 * - It has activity within the last 15 minutes (ACTIVE_AGENT_THRESHOLD_MS), OR
 * - The task is in 'in_progress' or 'in_review' status with a recent agent session
 */
export const getWithActiveAgents = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<Task[]> => {
    const ACTIVE_AGENT_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes
    const now = Date.now()
    const cutoffTime = now - ACTIVE_AGENT_THRESHOLD_MS

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .filter((q) => q.neq('agent_session_key', null))
      .collect()

    // Filter to only include agents that are still active
    const activeTasks = tasks.filter((task) => {
      // Must have a last activity timestamp
      const lastActive = task.agent_last_active_at
      if (!lastActive) return false

      // Only include if active within threshold
      return lastActive >= cutoffTime
    })

    // Sort by most recently active first
    return activeTasks
      .sort((a, b) => (b.agent_last_active_at ?? 0) - (a.agent_last_active_at ?? 0))
      .map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

/**
 * Get the count of active agents for a project.
 * Returns just the count (lightweight) instead of full task objects.
 * An agent is considered active if it has activity within the last 15 minutes.
 */
export const activeAgentCount = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<number> => {
    const ACTIVE_AGENT_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes
    const now = Date.now()
    const cutoffTime = now - ACTIVE_AGENT_THRESHOLD_MS

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .filter((q) => q.neq('agent_session_key', null))
      .collect()

    // Count only agents that are still active
    return tasks.filter((task) => {
      const lastActive = task.agent_last_active_at
      if (!lastActive) return false
      return lastActive >= cutoffTime
    }).length
  },
})

// Status thresholds for session derivation:
// < 5min since last activity → running (actively working)
// 5-15min → idle (paused but may resume)
// > 15min → completed (done, no longer active)
const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const COMPLETED_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

type SessionStatus = 'running' | 'idle' | 'completed'
type SessionType = 'main' | 'isolated' | 'subagent'

/**
 * Agent session information derived from task data
 * Mirrors the Session type from lib/types/session.ts but derived from Convex task data
 */
export interface AgentSession {
  id: string // agent_session_key
  name: string // derived from session key or task title
  type: SessionType
  model: string
  status: SessionStatus
  createdAt: string // agent_started_at
  updatedAt: string // agent_last_active_at
  completedAt?: string // set if status is completed
  tokens: {
    input: number
    output: number
    total: number
  }
  task: {
    id: string
    title: string
    status: TaskStatus
  }
}

function deriveSessionStatus(lastActiveAt: number | undefined): SessionStatus {
  if (!lastActiveAt) return 'completed'
  const timeSinceActivity = Date.now() - lastActiveAt
  if (timeSinceActivity < IDLE_THRESHOLD_MS) return 'running'
  if (timeSinceActivity >= COMPLETED_THRESHOLD_MS) return 'completed'
  return 'idle'
}

function mapSessionType(sessionKey: string): SessionType {
  if (!sessionKey) return 'main'
  if (sessionKey.includes(':isolated:')) return 'isolated'
  if (sessionKey.includes(':subagent:')) return 'subagent'
  return 'main'
}

function extractSessionName(sessionKey: string, taskTitle: string): string {
  // Guard against empty/falsy session keys
  if (!sessionKey) return taskTitle
  // Try to extract meaningful name from session key
  const parts = sessionKey.split(':')
  const lastPart = parts[parts.length - 1]
  // If last part looks like a task ID prefix, use task title
  if (lastPart && lastPart.length >= 8 && /^[a-f0-9]+$/.test(lastPart)) {
    return taskTitle
  }
  return lastPart || taskTitle
}

/**
 * Get agent sessions for a project
 * Returns sessions derived from tasks that have agent_session_key set
 * This replaces the openclaw sessions CLI for the Sessions tab
 */
export const getAgentSessions = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<AgentSession[]> => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .filter((q) => q.neq('agent_session_key', null))
      .collect()

    // Sort by most recently active first
    const sortedTasks = tasks.sort(
      (a, b) => (b.agent_last_active_at ?? 0) - (a.agent_last_active_at ?? 0)
    )

    // Apply limit if provided
    const limitedTasks = args.limit && args.limit > 0
      ? sortedTasks.slice(0, args.limit)
      : sortedTasks

    // Filter out tasks with empty/falsy agent_session_key
    const validTasks = limitedTasks.filter((t) => t.agent_session_key)

    // Map tasks to session-like objects
    return validTasks.map((task) => {
      const sessionKey = task.agent_session_key!
      const startedAt = task.agent_started_at ?? Date.now()
      const lastActiveAt = task.agent_last_active_at ?? startedAt
      const status = deriveSessionStatus(lastActiveAt)

      const tokensIn = task.agent_tokens_in ?? 0
      const tokensOut = task.agent_tokens_out ?? 0

      return {
        id: sessionKey,
        name: extractSessionName(sessionKey, task.title),
        type: mapSessionType(sessionKey),
        model: task.agent_model ?? 'unknown',
        status,
        createdAt: new Date(startedAt).toISOString(),
        updatedAt: new Date(lastActiveAt).toISOString(),
        completedAt: status === 'completed' ? new Date(lastActiveAt).toISOString() : undefined,
        tokens: {
          input: tokensIn,
          output: tokensOut,
          total: tokensIn + tokensOut,
        },
        task: {
          id: task.id,
          title: task.title,
          status: task.status as TaskStatus,
        },
      }
    })
  },
})

/**
 * Get agent sessions from ALL projects
 * Returns sessions derived from tasks that have agent_session_key set across all projects
 * Used for global session monitoring (e.g., Sessions page sidebar)
 */
export const getAllAgentSessions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<AgentSession[]> => {
    const tasks = await ctx.db
      .query('tasks')
      .filter((q) => q.neq('agent_session_key', null))
      .collect()

    // Sort by most recently active first
    const sortedTasks = tasks.sort(
      (a, b) => (b.agent_last_active_at ?? 0) - (a.agent_last_active_at ?? 0)
    )

    // Apply limit if provided
    const limitedTasks = args.limit && args.limit > 0
      ? sortedTasks.slice(0, args.limit)
      : sortedTasks

    // Filter out tasks with empty/falsy agent_session_key
    const validTasks = limitedTasks.filter((t) => t.agent_session_key)

    // Map tasks to session-like objects
    return validTasks.map((task) => {
      const sessionKey = task.agent_session_key!
      const startedAt = task.agent_started_at ?? Date.now()
      const lastActiveAt = task.agent_last_active_at ?? startedAt
      const status = deriveSessionStatus(lastActiveAt)

      const tokensIn = task.agent_tokens_in ?? 0
      const tokensOut = task.agent_tokens_out ?? 0

      return {
        id: sessionKey,
        name: extractSessionName(sessionKey, task.title),
        type: mapSessionType(sessionKey),
        model: task.agent_model ?? 'unknown',
        status,
        createdAt: new Date(startedAt).toISOString(),
        updatedAt: new Date(lastActiveAt).toISOString(),
        completedAt: status === 'completed' ? new Date(lastActiveAt).toISOString() : undefined,
        tokens: {
          input: tokensIn,
          output: tokensOut,
          total: tokensIn + tokensOut,
        },
        task: {
          id: task.id,
          title: task.title,
          status: task.status as TaskStatus,
        },
      }
    })
  },
})

/**
 * Get agent activity history for a project
 * Returns all tasks that have been worked on by agents (have agent_started_at)
 * Used by the Agents page to show agent analytics grouped by role
 */
export const getAgentHistory = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<Task[]> => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .filter((q) => q.neq('agent_started_at', null))
      .collect()

    // Sort by most recently started first
    return tasks
      .sort((a, b) => (b.agent_started_at ?? 0) - (a.agent_started_at ?? 0))
      .map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new task
 */
export const create = mutation({
  args: {
    project_id: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('blocked'),
      v.literal('done')
    )),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    role: v.optional(v.union(
      v.literal('pm'),
      v.literal('dev'),
      v.literal('research'),
      v.literal('reviewer')
    )),
    assignee: v.optional(v.string()),
    requires_human_review: v.optional(v.boolean()),
    tags: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Task> => {
    if (!args.title || args.title.trim().length === 0) {
      throw new Error('Task title is required')
    }

    if (args.title.length > 200) {
      throw new Error('Task title must be 200 characters or less')
    }

    // Verify project exists
    const project = await ctx.db
      .query('projects')
      .withIndex('by_uuid', (q) => q.eq('id', args.project_id))
      .unique()
    if (!project) {
      throw new Error(`Project not found: ${args.project_id}`)
    }

    const status = args.status ?? 'backlog'
    const now = Date.now()

    // Get the highest position in this column
    const existingTasks = await ctx.db
      .query('tasks')
      .withIndex('by_project_status', (q) =>
        q.eq('project_id', args.project_id).eq('status', status)
      )
      .collect()

    const maxPosition = existingTasks.length > 0
      ? Math.max(...existingTasks.map((t) => t.position))
      : -1

    const position = maxPosition + 1
    const id = generateId()

    const internalId = await ctx.db.insert('tasks', {
      id,
      project_id: args.project_id,
      title: args.title.trim(),
      description: args.description?.trim(),
      status,
      priority: args.priority ?? 'medium',
      role: args.role,
      assignee: args.assignee,
      requires_human_review: args.requires_human_review ?? false,
      tags: args.tags,
      position,
      created_at: now,
      updated_at: now,
      completed_at: status === 'done' ? now : undefined,
    })

    const task = await ctx.db.get(internalId)
    if (!task) {
      throw new Error('Failed to create task')
    }

    return toTask(task as Parameters<typeof toTask>[0])
  },
})

/**
 * Update an existing task
 */
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    role: v.optional(v.union(
      v.literal('pm'),
      v.literal('dev'),
      v.literal('research'),
      v.literal('reviewer')
    )),
    assignee: v.optional(v.string()),
    requires_human_review: v.optional(v.boolean()),
    tags: v.optional(v.string()),
    session_id: v.optional(v.string()),
    prompt_version_id: v.optional(v.string()),
    branch: v.optional(v.string()),
    pr_number: v.optional(v.number()),
    review_comments: v.optional(v.string()),
    review_count: v.optional(v.number()),
    agent_retry_count: v.optional(v.number()),
    triage_sent_at: v.optional(v.number()),
    auto_triage_count: v.optional(v.number()),
    escalated: v.optional(v.boolean()),
    escalated_at: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    if (args.title !== undefined) {
      if (args.title.trim().length === 0) {
        throw new Error('Task title cannot be empty')
      }
      if (args.title.length > 200) {
        throw new Error('Task title must be 200 characters or less')
      }
    }

    const now = Date.now()
    const updates: Record<string, unknown> = {
      updated_at: now,
    }

    if (args.title !== undefined) updates.title = args.title.trim()
    if (args.description !== undefined) updates.description = args.description?.trim()
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.role !== undefined) updates.role = args.role
    if (args.assignee !== undefined) updates.assignee = args.assignee
    if (args.requires_human_review !== undefined) updates.requires_human_review = args.requires_human_review
    if (args.tags !== undefined) updates.tags = args.tags
    if (args.session_id !== undefined) updates.session_id = args.session_id
    if (args.prompt_version_id !== undefined) updates.prompt_version_id = args.prompt_version_id
    if (args.branch !== undefined) updates.branch = args.branch
    if (args.pr_number !== undefined) updates.pr_number = args.pr_number
    if (args.review_comments !== undefined) updates.review_comments = args.review_comments
    if (args.review_count !== undefined) updates.review_count = args.review_count
    if (args.agent_retry_count !== undefined) updates.agent_retry_count = args.agent_retry_count
    if (args.triage_sent_at !== undefined) updates.triage_sent_at = args.triage_sent_at
    if (args.auto_triage_count !== undefined) updates.auto_triage_count = args.auto_triage_count
    if (args.escalated !== undefined) {
      updates.escalated = args.escalated
      if (args.escalated) {
        updates.escalated_at = now
      }
    }
    if (args.escalated_at !== undefined) updates.escalated_at = args.escalated_at

    await ctx.db.patch(existing._id, updates)

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to update task')
    }

    return toTask(updated as Parameters<typeof toTask>[0])
  },
})

/**
 * Move a task to a different status (column)
 */
export const move = mutation({
  args: {
    id: v.string(),
    status: v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('blocked'),
      v.literal('done')
    ),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    // If status isn't changing, this is just a reorder
    if (existing.status === args.status) {
      return reorderTask(ctx, existing._id, args.status, args.position)
    }

    // Log the status change event BEFORE the actual move
    const fromStatus = existing.status
    const toStatus = args.status

    // Guard: prevent moving tasks backward from 'done' to any earlier status.
    // Only humans should resurrect completed tasks (via the UI with force flag).
    // This prevents bugs where stale agent reaping accidentally un-completes tasks.
    if (existing.status === 'done' && args.status !== 'done') {
      throw new Error(
        `Cannot move task from 'done' to '${args.status}'. ` +
        `Completed tasks can only be reopened manually.`
      )
    }

    // Check for incomplete dependencies when claiming work (ready → in_progress)
    // Tasks can sit in ready with unmet deps — the gate script skips them.
    // Only block when someone actually tries to start working.
    if (args.status === 'in_progress' && existing.status !== 'in_progress') {
      const incompleteDeps = await getIncompleteDependencies(ctx, args.id)
      if (incompleteDeps.length > 0) {
        throw new Error(
          `Cannot change status: dependencies not complete. ` +
          `${incompleteDeps.length} incomplete dependencies must be done first.`
        )
      }
    }

    const now = Date.now()

    // Determine position in new column
    let newPosition: number
    if (args.position !== undefined) {
      newPosition = args.position
    } else {
      const targetTasks = await ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) =>
          q.eq('project_id', existing.project_id).eq('status', args.status)
        )
        .collect()

      const maxPosition = targetTasks.length > 0
        ? Math.max(...targetTasks.map((t) => t.position))
        : -1
      newPosition = maxPosition + 1
    }

    // If position was specified, shift existing tasks
    if (args.position !== undefined) {
      await shiftTasksInColumn(ctx, existing.project_id, args.status, args.position, 1)
    }

    const wasCompleted = existing.status !== 'done' && args.status === 'done'

    await ctx.db.patch(existing._id, {
      status: args.status,
      position: newPosition,
      updated_at: now,
      completed_at: wasCompleted ? now : existing.completed_at,
      // Clear stale agent fields when status changes —
      // new agent (if any) will write its own info after spawn
      agent_session_key: undefined,
      agent_model: undefined,
      agent_started_at: undefined,
      agent_last_active_at: undefined,
      agent_tokens_in: undefined,
      agent_tokens_out: undefined,
      agent_output_preview: undefined,
      // Reset retry count when starting fresh (in_progress), otherwise preserve it
      agent_retry_count: args.status === 'in_progress' ? 0 : existing.agent_retry_count,
    })

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to move task')
    }

    // Log the status change event after successful move
    await logTaskEvent(
      ctx,
      args.id,
      'status_changed',
      'system', // Could be enhanced to track actual actor (user session key, etc.)
      { from: fromStatus, to: toStatus }
    )

    return toTask(updated as Parameters<typeof toTask>[0])
  },
})

/**
 * Reorder a task within its current column
 */
export const reorder = mutation({
  args: {
    id: v.string(),
    newPosition: v.number(),
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    return reorderTask(ctx, existing._id, existing.status as TaskStatus, args.newPosition)
  },
})

/**
 * Delete a task and clean up its dependencies
 */
export const deleteTask = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    // Delete all dependency relationships where this task is involved
    const dependencies = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()

    for (const dep of dependencies) {
      await ctx.db.delete(dep._id)
    }

    const blockedBy = await ctx.db
      .query('taskDependencies')
      .withIndex('by_depends_on', (q) => q.eq('depends_on_id', args.id))
      .collect()

    for (const dep of blockedBy) {
      await ctx.db.delete(dep._id)
    }

    // Delete all comments for this task
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()

    for (const comment of comments) {
      await ctx.db.delete(comment._id)
    }

    // Delete the task
    await ctx.db.delete(existing._id)

    return { success: true }
  },
})

/**
 * Batch update agent activity on tasks.
 * Called by the work loop each cycle to sync live agent status into Convex.
 */
export const updateAgentActivity = mutation({
  args: {
    updates: v.array(
      v.object({
        task_id: v.string(),
        agent_session_key: v.string(),
        agent_model: v.optional(v.string()),
        agent_started_at: v.optional(v.number()),
        agent_last_active_at: v.number(),
        agent_tokens_in: v.optional(v.number()),
        agent_tokens_out: v.optional(v.number()),
        agent_output_preview: v.optional(v.string()),
        agent_retry_count: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ updated: number }> => {
    let updated = 0
    for (const update of args.updates) {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', update.task_id))
        .unique()
      if (!task) continue

      // Build patch object dynamically - only include fields that are provided
      const patch: Record<string, unknown> = {
        agent_session_key: update.agent_session_key,
        agent_last_active_at: update.agent_last_active_at,
        updated_at: Date.now(),
      }
      if (update.agent_model !== undefined) patch.agent_model = update.agent_model
      if (update.agent_started_at !== undefined) patch.agent_started_at = update.agent_started_at
      if (update.agent_tokens_in !== undefined) patch.agent_tokens_in = update.agent_tokens_in
      if (update.agent_tokens_out !== undefined) patch.agent_tokens_out = update.agent_tokens_out
      if (update.agent_output_preview !== undefined) patch.agent_output_preview = update.agent_output_preview
      if (update.agent_retry_count !== undefined) patch.agent_retry_count = update.agent_retry_count

      await ctx.db.patch(task._id, patch)
      updated++
    }
    return { updated }
  },
})

/**
 * Clear agent fields from a task (called when agent finishes).
 */
export const clearAgentActivity = mutation({
  args: { task_id: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.task_id))
      .unique()
    if (!task) return
    await ctx.db.patch(task._id, {
      agent_session_key: undefined,
      agent_model: undefined,
      agent_started_at: undefined,
      agent_last_active_at: undefined,
      agent_tokens_in: undefined,
      agent_tokens_out: undefined,
      agent_output_preview: undefined,
      agent_retry_count: undefined,
      triage_sent_at: undefined,
      updated_at: Date.now(),
    })
  },
})

/**
 * Add cost to a task's cost_total.
 * Called when an agent completes to accumulate costs across retries.
 */
export const addTaskCost = mutation({
  args: {
    task_id: v.string(),
    cost: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; new_total: number }> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.task_id))
      .unique()

    if (!task) {
      throw new Error(`Task not found: ${args.task_id}`)
    }

    const currentTotal = (task as { cost_total?: number }).cost_total ?? 0
    const newTotal = currentTotal + args.cost

    // Use type assertion to work around generated types
    const patch: Record<string, unknown> = {
      updated_at: Date.now(),
    }
    ;(patch as { cost_total?: number }).cost_total = newTotal

    await ctx.db.patch(task._id, patch)

    return { success: true, new_total: newTotal }
  },
})

/**
 * Update dispatch status for a task.
 * Called when a dispatch is requested, started, completed, or failed.
 */
export const updateDispatchStatus = mutation({
  args: {
    id: v.string(),
    dispatch_status: v.union(
      v.literal('pending'),
      v.literal('spawning'),
      v.literal('active'),
      v.literal('completed'),
      v.literal('failed')
    ),
    dispatch_requested_at: v.optional(v.number()),
    dispatch_requested_by: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    const now = Date.now()
    const updates: Record<string, unknown> = {
      dispatch_status: args.dispatch_status,
      updated_at: now,
    }

    if (args.dispatch_requested_at !== undefined) {
      updates.dispatch_requested_at = args.dispatch_requested_at
    }
    if (args.dispatch_requested_by !== undefined) {
      updates.dispatch_requested_by = args.dispatch_requested_by
    }

    await ctx.db.patch(existing._id, updates)

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to update dispatch status')
    }

    return toTask(updated as Parameters<typeof toTask>[0])
  },
})

// ============================================
// Helper Functions
// ============================================

/**
 * Get incomplete dependencies for a task (by UUID)
 */
async function getIncompleteDependencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  taskUuid: string
): Promise<TaskSummary[]> {
  const db = ctx.db
  const dependencyLinks = await db
    .query('taskDependencies')
    .withIndex('by_task', (q: { eq: (f: string, v: string) => unknown }) => q.eq('task_id', taskUuid))
    .collect()

  const incomplete: TaskSummary[] = []

  for (const link of dependencyLinks) {
    const depTask = await db
      .query('tasks')
      .withIndex('by_uuid', (q: { eq: (f: string, v: string) => unknown }) => q.eq('id', link.depends_on_id))
      .unique()
    if (depTask && depTask.status !== 'done') {
      incomplete.push(toTaskSummary(depTask))
    }
  }

  return incomplete
}

/**
 * Reorder a task within a column (uses Convex internal _id)
 */
async function reorderTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  internalId: unknown,
  status: TaskStatus,
  newPosition?: number
): Promise<Task> {
  const task = await ctx.db.get(internalId)
  if (!task) {
    throw new Error('Task not found')
  }

  // Get all tasks in this column ordered by position
  const tasksInColumn = await ctx.db
    .query('tasks')
    .withIndex('by_project_status', (q: { eq: (f: string, v: unknown) => { eq: (f: string, v: unknown) => unknown } }) =>
      q.eq('project_id', task.project_id).eq('status', status)
    )
    .collect()

  const sortedTasks = [...tasksInColumn].sort(
    (a: { position: number }, b: { position: number }) => a.position - b.position
  )

  const taskIndex = sortedTasks.findIndex((t: { _id: unknown }) => t._id === internalId)

  if (taskIndex === -1) {
    throw new Error('Task not found in column')
  }

  const targetPosition = newPosition !== undefined ? newPosition : sortedTasks.length - 1

  if (taskIndex === targetPosition) {
    return toTask(task as Parameters<typeof toTask>[0])
  }

  const [movedTask] = sortedTasks.splice(taskIndex, 1)
  sortedTasks.splice(targetPosition, 0, movedTask)

  const now = Date.now()
  for (let i = 0; i < sortedTasks.length; i++) {
    await ctx.db.patch(sortedTasks[i]._id, {
      position: i,
      updated_at: now,
    })
  }

  const updated = await ctx.db.get(internalId)
  if (!updated) {
    throw new Error('Failed to reorder task')
  }

  return toTask(updated as Parameters<typeof toTask>[0])
}

/**
 * Shift tasks in a column to make room for insertion
 */
async function shiftTasksInColumn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  projectId: string,
  status: TaskStatus,
  fromPosition: number,
  shiftAmount: number
): Promise<void> {
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_project_status', (q: { eq: (f: string, v: unknown) => { eq: (f: string, v: unknown) => unknown } }) =>
      q.eq('project_id', projectId).eq('status', status)
    )
    .collect()

  const now = Date.now()

  for (const task of tasks) {
    if (task.position >= fromPosition) {
      await ctx.db.patch(task._id, {
        position: task.position + shiftAmount,
        updated_at: now,
      })
    }
  }
}

// ============================================
// Session Association Queries
// ============================================

/**
 * Get tasks by session IDs
 * Used to associate sessions with their related tasks
 */
export const getBySessionIds = query({
  args: {
    sessionIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Array<{
    id: string;
    title: string;
    status: TaskStatus;
    project_id: string;
    session_id: string;
  }>> => {
    const tasks = []

    for (const sessionId of args.sessionIds) {
      // Use the by_session_id index for efficient lookup
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_session_id', (q) => q.eq('session_id', sessionId))
        .unique()

      if (task && task.session_id) {
        tasks.push({
          id: task.id,
          title: task.title,
          status: task.status as TaskStatus,
          project_id: task.project_id,
          session_id: task.session_id,
        })
      }
    }

    return tasks
  },
})

/**
 * Get a single task by session ID
 */
export const getBySessionId = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    id: string;
    title: string;
    status: TaskStatus;
    project_id: string;
    session_id: string;
  } | null> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_session_id', (q) => q.eq('session_id', args.sessionId))
      .unique()

    if (task && task.session_id) {
      return {
        id: task.id,
        title: task.title,
        status: task.status as TaskStatus,
        project_id: task.project_id,
        session_id: task.session_id,
      }
    }

    return null
  },
})

// ============================================
// Analysis Queries
// ============================================

/**
 * Get tasks that need post-mortem analysis
 *
 * Returns tasks that:
 * - Are in 'done' status OR were bounced (ready after in_progress) OR abandoned (backlog after in_progress)
 * - Don't have a taskAnalyses record yet
 *
 * For successful tasks (done), analyzes all tasks (not sampled) to populate metrics quickly.
 * For failed tasks (bounced/abandoned), all are returned.
 */
export const getUnanalyzed = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Task[]> => {
    // Get all completed/failed tasks for this project (not just those with prompt_version_id)
    const allTasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .collect()

    // Filter to terminal states that should be analyzed
    const terminalTasks = allTasks.filter((t) => {
      return t.status === 'done' || t.status === 'ready' || t.status === 'backlog'
    })

    const unanalyzedTasks: Task[] = []

    for (const task of terminalTasks) {
      // Check if task already has an analysis
      const existingAnalysis = await ctx.db
        .query('taskAnalyses')
        .withIndex('by_task', (q) => q.eq('task_id', task.id))
        .unique()

      if (existingAnalysis) {
        continue // Already analyzed
      }

      // Check if task qualifies for analysis
      // 1. Done tasks - sample ~20% randomly to avoid wasting tokens on successes
      if (task.status === 'done') {
        // Use task ID hash for deterministic sampling (same task always gets same decision)
        const hash = task.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        if (hash % 5 === 0) {
          unanalyzedTasks.push(toTask(task as Parameters<typeof toTask>[0]))
        }
        continue
      }

      // 2. Check for failure indicators via status_change comments
      // Task was in_progress but now in ready (bounced) or backlog (abandoned)
      if (task.status === 'ready' || task.status === 'backlog') {
        const comments = await ctx.db
          .query('comments')
          .withIndex('by_task', (q) => q.eq('task_id', task.id))
          .collect()

        const wasInProgress = comments.some((c) =>
          c.type === 'status_change' &&
          c.content.includes('in_progress')
        )

        if (wasInProgress) {
          unanalyzedTasks.push(toTask(task as Parameters<typeof toTask>[0]))
        }
      }
    }

    // Sort by completed_at (most recent first for done tasks) or updated_at
    const sorted = unanalyzedTasks.sort((a, b) => {
      if (a.completed_at && b.completed_at) {
        return b.completed_at - a.completed_at
      }
      return b.updated_at - a.updated_at
    })

    // Apply limit
    if (args.limit && args.limit > 0) {
      return sorted.slice(0, args.limit)
    }

    return sorted
  },
})
