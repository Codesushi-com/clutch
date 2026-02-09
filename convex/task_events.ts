import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

// ============================================
// Types
// ============================================

export type TaskEventType =
  | "status_changed"
  | "agent_assigned"
  | "agent_completed"
  | "agent_reaped"
  | "pr_opened"
  | "pr_merged"
  | "comment_added"
  | "discarded"

export interface TaskEvent {
  id: string
  task_id: string
  project_id: string
  event_type: TaskEventType
  timestamp: number
  actor: string | null
  data: string | null // JSON string with event-specific fields
}

// Event-specific data types
export interface StatusChangedData {
  from: string
  to: string
  reason?: string
}

export interface AgentAssignedData {
  session_key: string
  model?: string
  role?: string
}

export interface AgentCompletedData {
  session_key: string
  tokens_in?: number
  tokens_out?: number
  output_preview?: string
  duration_ms?: number
}

export interface AgentReapedData {
  session_key: string
  reason: "stale" | "no_reply" | "error" | "timeout" | "finished"
}

export interface PROpenedData {
  pr_number: number
  branch: string
}

export interface PRMergedData {
  pr_number: number
  merged_by?: string
}

export interface CommentAddedData {
  author: string
  preview: string
}

export interface DiscardedData {
  reason: string
  agent_session_key?: string
  worktree_removed: boolean
  branch_deleted: boolean
  pr_closed?: number
}

// ============================================
// Helper Functions
// ============================================

/**
 * Log a task event. This is a convenience function for DRY event logging.
 * Returns the created event ID or null if the task doesn't exist.
 */
export async function logTaskEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  taskId: string,
  eventType: TaskEventType,
  actor: string | null,
  data: unknown
): Promise<string | null> {
  const db = ctx.db

  // Get the task to verify it exists and get project_id
  const task = await db
    .query('tasks')
    .withIndex('by_uuid', (q: { eq: (f: string, v: string) => unknown }) => q.eq('id', taskId))
    .unique()

  if (!task) {
    console.warn(`[TaskEvents] Cannot log event for non-existent task: ${taskId}`)
    return null
  }

  const id = generateId()
  const timestamp = Date.now()

  await db.insert('task_events', {
    id,
    task_id: taskId,
    project_id: task.project_id,
    event_type: eventType,
    timestamp,
    actor: actor ?? undefined,
    data: data ? JSON.stringify(data) : undefined,
  })

  return id
}

// ============================================
// Queries
// ============================================

/**
 * Get all events for a task, ordered by timestamp ascending (oldest first)
 */
export const getByTaskId = query({
  args: {
    taskId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskEvent[]> => {
    let events = await ctx.db
      .query('task_events')
      .withIndex('by_task_timestamp', (q) => q.eq('task_id', args.taskId))
      .collect()

    // Sort by timestamp descending (newest first for timeline view)
    events = events.sort((a, b) => b.timestamp - a.timestamp)

    if (args.limit) {
      events = events.slice(0, args.limit)
    }

    return events.map((e) => ({
      id: e.id,
      task_id: e.task_id,
      project_id: e.project_id,
      event_type: e.event_type as TaskEventType,
      timestamp: e.timestamp,
      actor: e.actor ?? null,
      data: e.data ?? null,
    }))
  },
})

/**
 * Get all events for a project
 */
export const getByProjectId = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskEvent[]> => {
    let events = await ctx.db
      .query('task_events')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .collect()

    // Sort by timestamp descending (newest first)
    events = events.sort((a, b) => b.timestamp - a.timestamp)

    if (args.limit) {
      events = events.slice(0, args.limit)
    }

    return events.map((e) => ({
      id: e.id,
      task_id: e.task_id,
      project_id: e.project_id,
      event_type: e.event_type as TaskEventType,
      timestamp: e.timestamp,
      actor: e.actor ?? null,
      data: e.data ?? null,
    }))
  },
})

/**
 * Get a single event by ID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const event = await ctx.db
      .query('task_events')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!event) {
      return null
    }

    return {
      id: event.id,
      task_id: event.task_id,
      project_id: event.project_id,
      event_type: event.event_type as TaskEventType,
      timestamp: event.timestamp,
      actor: event.actor ?? null,
      data: event.data ?? null,
    }
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new task event.
 * Prefer using logTaskEvent() helper for automatic project_id lookup.
 */
export const create = mutation({
  args: {
    taskId: v.string(),
    eventType: v.union(
      v.literal('status_changed'),
      v.literal('agent_assigned'),
      v.literal('agent_completed'),
      v.literal('agent_reaped'),
      v.literal('pr_opened'),
      v.literal('pr_merged'),
      v.literal('comment_added'),
      v.literal('triage_sent'),
      v.literal('triage_escalated'),
      v.literal('discarded')
    ),
    actor: v.optional(v.string()),
    data: v.optional(v.string()), // JSON string
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    // Get the task to verify it exists and get project_id
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!task) {
      console.warn(`[TaskEvents] Cannot create event for non-existent task: ${args.taskId}`)
      return null
    }

    const id = generateId()
    const timestamp = Date.now()

    await ctx.db.insert('task_events', {
      id,
      task_id: args.taskId,
      project_id: task.project_id,
      event_type: args.eventType,
      timestamp,
      actor: args.actor,
      data: args.data,
    })

    return {
      id,
      task_id: args.taskId,
      project_id: task.project_id,
      event_type: args.eventType as TaskEventType,
      timestamp,
      actor: args.actor ?? null,
      data: args.data ?? null,
    }
  },
})

/**
 * Log a status change event
 */
export const logStatusChange = mutation({
  args: {
    taskId: v.string(),
    from: v.string(),
    to: v.string(),
    actor: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: StatusChangedData = {
      from: args.from,
      to: args.to,
      ...(args.reason && { reason: args.reason }),
    }

    const id = await logTaskEvent(ctx, args.taskId, 'status_changed', args.actor ?? null, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '', // Will be filled by caller if needed
      event_type: 'status_changed',
      timestamp: Date.now(),
      actor: args.actor ?? null,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log an agent assignment event
 */
export const logAgentAssigned = mutation({
  args: {
    taskId: v.string(),
    sessionKey: v.string(),
    model: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: AgentAssignedData = {
      session_key: args.sessionKey,
      ...(args.model && { model: args.model }),
      ...(args.role && { role: args.role }),
    }

    const id = await logTaskEvent(ctx, args.taskId, 'agent_assigned', args.sessionKey, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '',
      event_type: 'agent_assigned',
      timestamp: Date.now(),
      actor: args.sessionKey,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log an agent completion event
 */
export const logAgentCompleted = mutation({
  args: {
    taskId: v.string(),
    sessionKey: v.string(),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    outputPreview: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    costInput: v.optional(v.float64()),
    costOutput: v.optional(v.float64()),
    costTotal: v.optional(v.float64()),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: AgentCompletedData = {
      session_key: args.sessionKey,
      ...(args.tokensIn !== undefined && { tokens_in: args.tokensIn }),
      ...(args.tokensOut !== undefined && { tokens_out: args.tokensOut }),
      ...(args.outputPreview && { output_preview: args.outputPreview }),
      ...(args.durationMs !== undefined && { duration_ms: args.durationMs }),
    }

    // Get the task to verify it exists and get project_id
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!task) {
      console.warn(`[TaskEvents] Cannot log event for non-existent task: ${args.taskId}`)
      return null
    }

    const id = generateId()
    const timestamp = Date.now()

    await ctx.db.insert('task_events', {
      id,
      task_id: args.taskId,
      project_id: task.project_id,
      event_type: 'agent_completed',
      timestamp,
      actor: args.sessionKey,
      data: data ? JSON.stringify(data) : undefined,
      cost_input: args.costInput,
      cost_output: args.costOutput,
      cost_total: args.costTotal,
    })

    return {
      id,
      task_id: args.taskId,
      project_id: task.project_id,
      event_type: 'agent_completed',
      timestamp,
      actor: args.sessionKey,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log an agent reap event
 */
export const logAgentReaped = mutation({
  args: {
    taskId: v.string(),
    sessionKey: v.string(),
    reason: v.union(
      v.literal('stale'),
      v.literal('no_reply'),
      v.literal('error'),
      v.literal('timeout'),
      v.literal('finished')
    ),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: AgentReapedData = {
      session_key: args.sessionKey,
      reason: args.reason,
    }

    const id = await logTaskEvent(ctx, args.taskId, 'agent_reaped', args.sessionKey, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '',
      event_type: 'agent_reaped',
      timestamp: Date.now(),
      actor: args.sessionKey,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log a PR opened event
 */
export const logPROpened = mutation({
  args: {
    taskId: v.string(),
    prNumber: v.number(),
    branch: v.string(),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: PROpenedData = {
      pr_number: args.prNumber,
      branch: args.branch,
    }

    const id = await logTaskEvent(ctx, args.taskId, 'pr_opened', args.actor ?? null, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '',
      event_type: 'pr_opened',
      timestamp: Date.now(),
      actor: args.actor ?? null,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log a PR merged event
 */
export const logPRMerged = mutation({
  args: {
    taskId: v.string(),
    prNumber: v.number(),
    mergedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: PRMergedData = {
      pr_number: args.prNumber,
      ...(args.mergedBy && { merged_by: args.mergedBy }),
    }

    const id = await logTaskEvent(ctx, args.taskId, 'pr_merged', args.mergedBy ?? null, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '',
      event_type: 'pr_merged',
      timestamp: Date.now(),
      actor: args.mergedBy ?? null,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log a comment added event
 */
export const logCommentAdded = mutation({
  args: {
    taskId: v.string(),
    author: v.string(),
    preview: v.string(),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: CommentAddedData = {
      author: args.author,
      preview: args.preview,
    }

    const id = await logTaskEvent(ctx, args.taskId, 'comment_added', args.author, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '',
      event_type: 'comment_added',
      timestamp: Date.now(),
      actor: args.author,
      data: JSON.stringify(data),
    }
  },
})

/**
 * Log a discarded event (task force-stopped and work discarded)
 */
export const logDiscarded = mutation({
  args: {
    taskId: v.string(),
    reason: v.string(),
    actor: v.string(),
    agentSessionKey: v.optional(v.string()),
    worktreeRemoved: v.boolean(),
    branchDeleted: v.boolean(),
    prClosed: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskEvent | null> => {
    const data: DiscardedData = {
      reason: args.reason,
      agent_session_key: args.agentSessionKey,
      worktree_removed: args.worktreeRemoved,
      branch_deleted: args.branchDeleted,
      pr_closed: args.prClosed,
    }

    const id = await logTaskEvent(ctx, args.taskId, 'discarded', args.actor, data)
    if (!id) return null

    return {
      id,
      task_id: args.taskId,
      project_id: '',
      event_type: 'discarded',
      timestamp: Date.now(),
      actor: args.actor,
      data: JSON.stringify(data),
    }
  },
})
