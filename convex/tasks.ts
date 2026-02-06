import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Task, Comment, TaskSummary, TaskDependencySummary } from '../lib/types'

// ============================================
// Type Helpers
// ============================================

type TaskStatus = "backlog" | "ready" | "in_progress" | "in_review" | "done"
type TaskPriority = "low" | "medium" | "high" | "urgent"
type TaskRole = "any" | "pm" | "dev" | "qa" | "research" | "security"
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
  dispatch_status?: DispatchStatus
  dispatch_requested_at?: number
  dispatch_requested_by?: string
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
    dispatch_status: doc.dispatch_status ?? null,
    dispatch_requested_at: doc.dispatch_requested_at ?? null,
    dispatch_requested_by: doc.dispatch_requested_by ?? null,
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
      ready: 2,
      backlog: 3,
      done: 4,
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
      v.literal('done')
    )),
    priority: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'),
      v.literal('high'),
      v.literal('urgent')
    )),
    role: v.optional(v.union(
      v.literal('any'),
      v.literal('pm'),
      v.literal('dev'),
      v.literal('qa'),
      v.literal('research'),
      v.literal('security')
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
      v.literal('any'),
      v.literal('pm'),
      v.literal('dev'),
      v.literal('qa'),
      v.literal('research'),
      v.literal('security')
    )),
    assignee: v.optional(v.string()),
    requires_human_review: v.optional(v.boolean()),
    tags: v.optional(v.string()),
    session_id: v.optional(v.string()),
    prompt_version_id: v.optional(v.string()),
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
    })

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to move task')
    }

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
