import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import type { Task, Comment, TaskSummary, TaskDependencySummary } from '../lib/db/types'
import type { Id } from './_generated/server'

// ============================================
// Type Helpers
// ============================================

type TaskStatus = "backlog" | "ready" | "in_progress" | "review" | "done"
type TaskPriority = "low" | "medium" | "high" | "urgent"
type TaskRole = "any" | "pm" | "dev" | "qa" | "research" | "security"
type DispatchStatus = "pending" | "spawning" | "active" | "completed" | "failed"

// Convert Convex document to Task type
function toTask(doc: {
  _id: string
  _creationTime: number
  project_id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  role?: TaskRole
  assignee?: string
  requires_human_review: boolean
  tags?: string[]
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
    id: doc._id,
    project_id: doc.project_id,
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    role: doc.role ?? null,
    assignee: doc.assignee ?? null,
    requires_human_review: doc.requires_human_review ? 1 : 0,
    tags: doc.tags ? JSON.stringify(doc.tags) : null,
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
  _id: string
  _creationTime: number
  task_id: string
  author: string
  author_type: "coordinator" | "agent" | "human"
  content: string
  type: "message" | "status_change" | "request_input" | "completion"
  responded_at?: number
  created_at: number
}): Comment {
  return {
    id: doc._id,
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
  _id: string
  title: string
  status: TaskStatus
}): TaskSummary {
  return {
    id: doc._id,
    title: doc.title,
    status: doc.status,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get tasks by project with optional status filter
 */
export const getByProject = query({
  args: {
    projectId: v.id('projects'),
    status: v.optional(v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('review'),
      v.literal('done')
    )),
  },
  handler: async (ctx, args): Promise<Task[]> => {
    let tasks

    if (args.status) {
      // Use compound index for project + status
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) => {
          const qq = (q as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('project_id', args.projectId)
          return (qq as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('status', args.status)
        })
        .collect()
    } else {
      // Use project index only
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
        .collect()
    }

    // Sort by position for non-done tasks, by completed_at for done tasks
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
 * Get a single task by ID with its comments
 */
export const getById = query({
  args: { id: v.id('tasks') },
  handler: async (ctx, args): Promise<{ task: Task; comments: Comment[] } | null> => {
    const task = await ctx.db.get(args.id)

    if (!task) {
      return null
    }

    // Fetch comments for this task
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

    // Sort: incomplete first (by status order), then by position
    const statusOrder: Record<TaskStatus, number> = {
      in_progress: 0,
      review: 1,
      ready: 2,
      backlog: 3,
      done: 4,
    }

    return tasks
      .sort((a, b) => {
        const aStatus = (a as { status: TaskStatus }).status
        const bStatus = (b as { status: TaskStatus }).status
        const statusDiff = statusOrder[aStatus] - statusOrder[bStatus]
        if (statusDiff !== 0) return statusDiff
        return (a as { position: number }).position - (b as { position: number }).position
      })
      .map((t) => toTask(t as Parameters<typeof toTask>[0]))
  },
})

/**
 * Get task with its dependency information
 */
export const getWithDependencies = query({
  args: { id: v.id('tasks') },
  handler: async (ctx, args): Promise<{
    task: Task
    dependencies: TaskDependencySummary[]
    blockedBy: TaskSummary[]
  } | null> => {
    const task = await ctx.db.get(args.id)

    if (!task) {
      return null
    }

    // Get tasks this task depends on (dependencies)
    const dependencyLinks = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()

    const dependencies: TaskDependencySummary[] = []
    for (const link of dependencyLinks) {
      const depTask = await ctx.db.get((link as { depends_on_id: string }).depends_on_id as unknown as Id<'tasks'>)
      if (depTask) {
        dependencies.push({
          ...toTaskSummary(depTask as Parameters<typeof toTaskSummary>[0]),
          dependency_id: (link as { _id: string })._id,
        })
      }
    }

    // Get tasks that depend on this task (blocked by this task)
    const blockedLinks = await ctx.db
      .query('taskDependencies')
      .withIndex('by_depends_on', (q) => q.eq('depends_on_id', args.id))
      .collect()

    const blockedBy: TaskSummary[] = []
    for (const link of blockedLinks) {
      const blockedTask = await ctx.db.get((link as { task_id: string }).task_id as unknown as Id<'tasks'>)
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
    project_id: v.id('projects'),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('review'),
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
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Task> => {
    // Validate required fields
    if (!args.title || args.title.trim().length === 0) {
      throw new Error('Task title is required')
    }

    if (args.title.length > 200) {
      throw new Error('Task title must be 200 characters or less')
    }

    // Verify project exists
    const project = await ctx.db.get(args.project_id)
    if (!project) {
      throw new Error(`Project not found: ${args.project_id}`)
    }

    const status = args.status ?? 'backlog'
    const now = Date.now()

    // Get the highest position in this column to append new task at the end
    const existingTasks = await ctx.db
      .query('tasks')
      .withIndex('by_project_status', (q) => {
        const qq = (q as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('project_id', args.project_id)
        return (qq as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('status', status)
      })
      .collect()

    const maxPosition = existingTasks.length > 0
      ? Math.max(...existingTasks.map((t) => (t as { position: number }).position))
      : -1

    const position = maxPosition + 1

    const taskId = await ctx.db.insert('tasks', {
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

    const task = await ctx.db.get(taskId)
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
    id: v.id('tasks'),
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
    tags: v.optional(v.array(v.string())),
    session_id: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    // Validate title if provided
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

    await ctx.db.patch(args.id, updates)

    const updated = await ctx.db.get(args.id)
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
    id: v.id('tasks'),
    status: v.union(
      v.literal('backlog'),
      v.literal('ready'),
      v.literal('in_progress'),
      v.literal('review'),
      v.literal('done')
    ),
    position: v.optional(v.number()), // Optional: specific position in new column
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    const existingStatus = (existing as { status: TaskStatus }).status
    const existingProjectId = (existing as { project_id: string }).project_id
    const existingCompletedAt = (existing as { completed_at?: number }).completed_at

    // If status isn't changing, this is just a reorder
    if (existingStatus === args.status) {
      // Delegate to reorder logic
      return reorderTask(
        ctx as unknown as Parameters<typeof reorderTask>[0], 
        args.id, 
        args.status, 
        args.position
      )
    }

    // Check for incomplete dependencies when moving forward from backlog
    // Tasks with incomplete dependencies can only be in "backlog" status
    if (args.status !== 'backlog' && existingStatus === 'backlog') {
      const incompleteDeps = await getIncompleteDependencies(
        ctx as unknown as Parameters<typeof getIncompleteDependencies>[0], 
        args.id
      )
      if (incompleteDeps.length > 0) {
        throw new Error(
          `Cannot change status: ${incompleteDeps.length} incomplete dependencies. ` +
          `Complete dependencies before moving from backlog.`
        )
      }
    }

    const now = Date.now()

    // Determine position in new column
    let newPosition: number
    if (args.position !== undefined) {
      newPosition = args.position
    } else {
      // Get the highest position in the target column
      const targetTasks = await ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) => {
          const qq = (q as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('project_id', existingProjectId)
          return (qq as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('status', args.status)
        })
        .collect()
      
      const maxPosition = targetTasks.length > 0
        ? Math.max(...targetTasks.map((t) => (t as { position: number }).position))
        : -1
      newPosition = maxPosition + 1
    }

    // If position was specified, we need to shift existing tasks
    if (args.position !== undefined) {
      await shiftTasksInColumn(
        ctx as unknown as Parameters<typeof shiftTasksInColumn>[0],
        existingProjectId,
        args.status,
        args.position,
        1
      )
    }

    const wasCompleted = existingStatus !== 'done' && args.status === 'done'

    await ctx.db.patch(args.id, {
      status: args.status,
      position: newPosition,
      updated_at: now,
      completed_at: wasCompleted ? now : existingCompletedAt,
    })

    const updated = await ctx.db.get(args.id)
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
    id: v.id('tasks'),
    newPosition: v.number(),
  },
  handler: async (ctx, args): Promise<Task> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    const existingStatus = (existing as { status: TaskStatus }).status

    return reorderTask(
      ctx as unknown as Parameters<typeof reorderTask>[0], 
      args.id, 
      existingStatus, 
      args.newPosition
    )
  },
})

/**
 * Delete a task and clean up its dependencies
 */
export const deleteTask = mutation({
  args: {
    id: v.id('tasks'),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Task not found: ${args.id}`)
    }

    // Delete all dependency relationships where this task is involved
    const dependencies = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()
    
    for (const dep of dependencies) {
      await ctx.db.delete((dep as { _id: string })._id as unknown as Id<'tasks'>)
    }

    const blockedBy = await ctx.db
      .query('taskDependencies')
      .withIndex('by_depends_on', (q) => q.eq('depends_on_id', args.id))
      .collect()
    
    for (const dep of blockedBy) {
      await ctx.db.delete((dep as { _id: string })._id as unknown as Id<'tasks'>)
    }

    // Delete all comments for this task
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('task_id', args.id))
      .collect()
    
    for (const comment of comments) {
      await ctx.db.delete((comment as { _id: string })._id as unknown as Id<'tasks'>)
    }

    // Delete the task
    await ctx.db.delete(args.id)

    return { success: true }
  },
})

// ============================================
// Helper Functions
// ============================================

/**
 * Get incomplete dependencies for a task
 */
async function getIncompleteDependencies(
  ctx: { db: { query: (table: string) => { withIndex: (index: string, fn: (q: { eq: (field: string, value: string) => unknown }) => unknown) => { collect: () => Promise<unknown[]> } }; get: (id: string) => Promise<unknown> } },
  taskId: string
): Promise<TaskSummary[]> {
  const dependencyLinks = await ctx.db
    .query('taskDependencies')
    .withIndex('by_task', (q) => q.eq('task_id', taskId))
    .collect()

  const incomplete: TaskSummary[] = []

  for (const link of dependencyLinks) {
    const linkDoc = link as { depends_on_id: string }
    const depTask = await ctx.db.get(linkDoc.depends_on_id)
    const depTaskDoc = depTask as { status: TaskStatus; _id: string; title: string } | null
    if (depTaskDoc && depTaskDoc.status !== 'done') {
      incomplete.push(toTaskSummary(depTaskDoc))
    }
  }

  return incomplete
}

/**
 * Reorder a task within a column
 */
async function reorderTask(
  ctx: { db: { query: (table: string) => { withIndex: (index: string, fn: (q: { eq: (field: string, value: string) => unknown }) => unknown) => { collect: () => Promise<unknown[]> } }; get: (id: string) => Promise<unknown>; patch: (id: string, updates: Record<string, unknown>) => Promise<void> } },
  taskId: string,
  status: TaskStatus,
  newPosition?: number
): Promise<Task> {
  const task = await ctx.db.get(taskId) as { _id: string; project_id: string; status: TaskStatus; position: number } | null
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  // Get all tasks in this column ordered by position
  const tasksInColumn = await ctx.db
    .query('tasks')
    .withIndex('by_project_status', (q) => {
      const qq = (q as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('project_id', task.project_id)
      return (qq as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('status', status)
    })
    .collect()

  const sortedTasks = tasksInColumn
    .map((t) => t as { _id: string; position: number })
    .sort((a, b) => a.position - b.position)
  
  const taskIndex = sortedTasks.findIndex((t) => t._id === taskId)

  if (taskIndex === -1) {
    throw new Error('Task not found in column')
  }

  // Determine target position
  const targetPosition = newPosition !== undefined ? newPosition : sortedTasks.length - 1

  // If position hasn't changed, return early
  if (taskIndex === targetPosition) {
    const fullTask = await ctx.db.get(taskId)
    return toTask(fullTask as Parameters<typeof toTask>[0])
  }

  // Remove task from current position
  const [movedTask] = sortedTasks.splice(taskIndex, 1)
  
  // Insert at new position
  sortedTasks.splice(targetPosition, 0, movedTask)

  // Update positions for all tasks in the column
  const now = Date.now()
  for (let i = 0; i < sortedTasks.length; i++) {
    await ctx.db.patch(sortedTasks[i]._id as unknown as Id<'tasks'>, {
      position: i,
      updated_at: now,
    })
  }

  const updated = await ctx.db.get(taskId)
  if (!updated) {
    throw new Error('Failed to reorder task')
  }

  return toTask(updated as Parameters<typeof toTask>[0])
}

/**
 * Shift tasks in a column to make room for insertion
 */
async function shiftTasksInColumn(
  ctx: { db: { query: (table: string) => { withIndex: (index: string, fn: (q: { eq: (field: string, value: string) => unknown }) => unknown) => { collect: () => Promise<unknown[]> } }; patch: (id: string, updates: Record<string, unknown>) => Promise<void> } },
  projectId: string,
  status: TaskStatus,
  fromPosition: number,
  shiftAmount: number
): Promise<void> {
  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_project_status', (q) => {
      const qq = (q as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('project_id', projectId)
      return (qq as unknown as { eq: (field: string, value: unknown) => typeof q }).eq('status', status)
    })
    .collect()

  const now = Date.now()

  for (const task of tasks) {
    const taskDoc = task as { _id: string; position: number }
    if (taskDoc.position >= fromPosition) {
      await ctx.db.patch(taskDoc._id as unknown as Id<'tasks'>, {
        position: taskDoc.position + shiftAmount,
        updated_at: now,
      })
    }
  }
}
