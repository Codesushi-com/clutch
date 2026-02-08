import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import { logTaskEvent } from './task_events'
import type { Task, TaskRole, TaskPriority, Comment } from '../lib/types'

// ============================================
// Types
// ============================================

type TaskStatus = "backlog" | "ready" | "in_progress" | "in_review" | "blocked" | "done"

export interface TriageTask extends Task {
  blockerComment: Comment | null
  timeBlockedMs: number
  projectName: string
  projectColor: string
}

export interface TriageQueueResult {
  escalated: TriageTask[]
  normal: TriageTask[]
}

// Triage event data types
export interface TriageResolvedData {
  action: 'unblock' | 'reassign' | 'split' | 'kill'
  actor: string
  newRole?: string
  newModel?: string
  subtaskIds?: string[]
  reason?: string
}

export interface TriageEscalatedData {
  actor: string
  reason?: string
}

export interface SubtaskSpec {
  title: string
  description?: string
  role?: TaskRole
  priority?: TaskPriority
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert Convex document to Task type
 */
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
  dispatch_status?: string
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
  triage_acked_at?: number
  cost_total?: number
  auto_triage_count?: number
  escalated?: boolean
  escalated_at?: number
  branch?: string
  pr_number?: number
  review_comments?: string
  review_count?: number
  resolution?: 'completed' | 'discarded' | 'merged'
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
    dispatch_status: doc.dispatch_status as Task['dispatch_status'] ?? null,
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
    triage_sent_at: doc.triage_sent_at ?? null,
    triage_acked_at: (doc as { triage_acked_at?: number }).triage_acked_at ?? null,
    cost_total: (doc as { cost_total?: number }).cost_total ?? null,
    auto_triage_count: doc.auto_triage_count ?? null,
    escalated: doc.escalated ? 1 : 0,
    escalated_at: (doc as { escalated_at?: number }).escalated_at ?? null,
    branch: doc.branch ?? null,
    pr_number: doc.pr_number ?? null,
    review_comments: doc.review_comments ?? null,
    review_count: doc.review_count ?? null,
    resolution: doc.resolution ?? null,
    position: doc.position,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    completed_at: doc.completed_at ?? null,
  }
}

/**
 * Convert Convex document to Comment type
 */
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

// ============================================
// Queries
// ============================================

/**
 * Get all blocked tasks for triage queue
 * Returns tasks ordered by updated_at ASC (oldest first), with escalated tasks separated
 */
export const triageQueue = query({
  args: {
    projectId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TriageQueueResult> => {
    // Fetch all blocked tasks
    let tasks = await ctx.db
      .query('tasks')
      .withIndex('by_status', (q) => q.eq('status', 'blocked'))
      .collect()

    // Filter by project if provided
    if (args.projectId) {
      tasks = tasks.filter((t) => t.project_id === args.projectId)
    }

    // Sort by updated_at ascending (oldest first)
    tasks = tasks.sort((a, b) => a.updated_at - b.updated_at)

    const now = Date.now()
    const escalated: TriageTask[] = []
    const normal: TriageTask[] = []

    for (const taskDoc of tasks) {
      const task = toTask(taskDoc as Parameters<typeof toTask>[0])

      // Get the latest blocker comment for this task
      const comments = await ctx.db
        .query('comments')
        .withIndex('by_task', (q) => q.eq('task_id', task.id))
        .collect()

      // Find latest blocker comment (type === 'blocker' - stored as 'message' with blocker content)
      // Since comments don't have a 'blocker' type, we look for comments with blocker-related content
      // or fallback to the most recent comment
      const blockerComment = comments
        .filter((c) => c.type === 'message')
        .sort((a, b) => b.created_at - a.created_at)[0] ?? null

      const blockerCommentData = blockerComment
        ? toComment(blockerComment as Parameters<typeof toComment>[0])
        : null

      // Get project info
      const project = await ctx.db
        .query('projects')
        .withIndex('by_uuid', (q) => q.eq('id', task.project_id))
        .unique()

      const triageTask: TriageTask = {
        ...task,
        blockerComment: blockerCommentData,
        timeBlockedMs: now - task.updated_at,
        projectName: project?.name ?? 'Unknown Project',
        projectColor: project?.color ?? '#666666',
      }

      // Separate escalated tasks
      if (taskDoc.escalated) {
        escalated.push(triageTask)
      } else {
        normal.push(triageTask)
      }
    }

    return { escalated, normal }
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Unblock a task: set status to ready, reset retry count, clear escalated flag
 */
export const triageUnblock = mutation({
  args: {
    taskId: v.string(),
    actor: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; task: Task | null }> => {
    const taskDoc = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!taskDoc) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()

    // Update task
    await ctx.db.patch(taskDoc._id, {
      status: 'ready',
      agent_retry_count: 0,
      escalated: false,
      updated_at: now,
    })

    // Log task event
    const data: TriageResolvedData = {
      action: 'unblock',
      actor: args.actor,
    }
    await logTaskEvent(ctx, args.taskId, 'status_changed', args.actor, data)

    // Get updated task
    const updated = await ctx.db.get(taskDoc._id)
    if (!updated) {
      return { success: false, task: null }
    }

    return {
      success: true,
      task: toTask(updated as Parameters<typeof toTask>[0]),
    }
  },
})

/**
 * Reassign a task: update role and/or model, set status to ready, reset retry count
 */
export const triageReassign = mutation({
  args: {
    taskId: v.string(),
    actor: v.string(),
    role: v.optional(v.union(
      v.literal('pm'),
      v.literal('dev'),
      v.literal('research'),
      v.literal('reviewer')
    )),
    agentModel: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; task: Task | null }> => {
    const taskDoc = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!taskDoc) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()
    const updates: Record<string, unknown> = {
      status: 'ready',
      agent_retry_count: 0,
      updated_at: now,
    }

    if (args.role) {
      updates.role = args.role
    }
    if (args.agentModel) {
      updates.agent_model = args.agentModel
    }

    await ctx.db.patch(taskDoc._id, updates)

    // Log task event
    const data: TriageResolvedData = {
      action: 'reassign',
      actor: args.actor,
      ...(args.role && { newRole: args.role }),
      ...(args.agentModel && { newModel: args.agentModel }),
    }
    await logTaskEvent(ctx, args.taskId, 'status_changed', args.actor, data)

    const updated = await ctx.db.get(taskDoc._id)
    if (!updated) {
      return { success: false, task: null }
    }

    return {
      success: true,
      task: toTask(updated as Parameters<typeof toTask>[0]),
    }
  },
})

/**
 * Split a blocked task into subtasks
 * Creates subtasks, marks original as done, logs event
 */
export const triageSplit = mutation({
  args: {
    taskId: v.string(),
    actor: v.string(),
    subtasks: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      role: v.optional(v.union(
        v.literal('pm'),
        v.literal('dev'),
        v.literal('research'),
        v.literal('reviewer')
      )),
      priority: v.optional(v.union(
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
        v.literal('urgent')
      )),
    })),
  },
  handler: async (ctx, args): Promise<{ success: boolean; subtaskIds: string[]; task: Task | null }> => {
    const taskDoc = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!taskDoc) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()
    const subtaskIds: string[] = []

    // Create subtasks
    for (const spec of args.subtasks) {
      const id = generateId()
      subtaskIds.push(id)

      await ctx.db.insert('tasks', {
        id,
        project_id: taskDoc.project_id,
        title: spec.title,
        description: spec.description,
        status: 'backlog',
        priority: spec.priority ?? 'medium',
        role: spec.role,
        requires_human_review: false,
        position: Date.now() + Math.random(), // Unique position
        created_at: now,
        updated_at: now,
      })
    }

    // Mark original task as done with a comment
    await ctx.db.patch(taskDoc._id, {
      status: 'done',
      completed_at: now,
      updated_at: now,
    })

    // Add comment explaining the split
    await ctx.db.insert('comments', {
      id: generateId(),
      task_id: args.taskId,
      author: args.actor,
      author_type: 'human',
      content: `Task split into ${subtaskIds.length} subtask(s): ${subtaskIds.join(', ')}`,
      type: 'status_change',
      created_at: now,
    })

    // Log task event
    const data: TriageResolvedData = {
      action: 'split',
      actor: args.actor,
      subtaskIds,
    }
    await logTaskEvent(ctx, args.taskId, 'status_changed', args.actor, data)

    const updated = await ctx.db.get(taskDoc._id)

    return {
      success: true,
      subtaskIds,
      task: updated ? toTask(updated as Parameters<typeof toTask>[0]) : null,
    }
  },
})

/**
 * Kill a blocked task: move to backlog with reason
 */
export const triageKill = mutation({
  args: {
    taskId: v.string(),
    actor: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; task: Task | null }> => {
    const taskDoc = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!taskDoc) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()

    // Move to backlog (not done - task wasn't completed)
    await ctx.db.patch(taskDoc._id, {
      status: 'backlog',
      escalated: false,
      updated_at: now,
    })

    // Add comment with reason
    await ctx.db.insert('comments', {
      id: generateId(),
      task_id: args.taskId,
      author: args.actor,
      author_type: 'human',
      content: `Task killed: ${args.reason}`,
      type: 'status_change',
      created_at: now,
    })

    // Log task event
    const data: TriageResolvedData = {
      action: 'kill',
      actor: args.actor,
      reason: args.reason,
    }
    await logTaskEvent(ctx, args.taskId, 'status_changed', args.actor, data)

    const updated = await ctx.db.get(taskDoc._id)

    return {
      success: true,
      task: updated ? toTask(updated as Parameters<typeof toTask>[0]) : null,
    }
  },
})

/**
 * Escalate a blocked task for human attention
 * Sets escalated flag and creates notification
 */
export const triageEscalate = mutation({
  args: {
    taskId: v.string(),
    actor: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; task: Task | null }> => {
    const taskDoc = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()

    if (!taskDoc) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()

    // Set escalated flag
    await ctx.db.patch(taskDoc._id, {
      escalated: true,
      escalated_at: now,
      updated_at: now,
    })

    // Create notification for Dan
    await ctx.db.insert('notifications', {
      id: generateId(),
      task_id: args.taskId,
      project_id: taskDoc.project_id,
      type: 'escalation',
      severity: 'critical',
      title: `🚨 Escalated: ${taskDoc.title}`,
      message: args.reason
        ? `Task escalated by ${args.actor}: ${args.reason}`
        : `Task escalated by ${args.actor} for human review`,
      read: false,
      created_at: now,
    })

    // Log task event
    const data: TriageEscalatedData = {
      actor: args.actor,
      ...(args.reason && { reason: args.reason }),
    }
    await logTaskEvent(ctx, args.taskId, 'status_changed', args.actor, {
      ...data,
      event_subtype: 'triage_escalated',
    })

    const updated = await ctx.db.get(taskDoc._id)

    return {
      success: true,
      task: updated ? toTask(updated as Parameters<typeof toTask>[0]) : null,
    }
  },
})
