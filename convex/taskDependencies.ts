import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { TaskDependency, TaskSummary, TaskDependencySummary } from '../lib/types'

// ============================================
// Queries
// ============================================

/**
 * Get all tasks that this task depends on
 */
export const getDependencies = query({
  args: { taskId: v.string() },
  handler: async (ctx, args): Promise<TaskDependencySummary[]> => {
    const links = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('task_id', args.taskId))
      .collect()

    const result: TaskDependencySummary[] = []
    for (const link of links) {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', link.depends_on_id))
        .unique()
      if (task) {
        result.push({
          id: task.id,
          title: task.title,
          status: task.status as TaskSummary['status'],
          dependency_id: link.id,
        })
      }
    }
    return result
  },
})

/**
 * Get all tasks that depend on this task (are blocked by it)
 */
export const getBlockedBy = query({
  args: { taskId: v.string() },
  handler: async (ctx, args): Promise<TaskSummary[]> => {
    const links = await ctx.db
      .query('taskDependencies')
      .withIndex('by_depends_on', (q) => q.eq('depends_on_id', args.taskId))
      .collect()

    const result: TaskSummary[] = []
    for (const link of links) {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', link.task_id))
        .unique()
      if (task) {
        result.push({
          id: task.id,
          title: task.title,
          status: task.status as TaskSummary['status'],
        })
      }
    }
    return result
  },
})

/**
 * Get incomplete dependencies for a task
 */
export const getIncomplete = query({
  args: { taskId: v.string() },
  handler: async (ctx, args): Promise<TaskSummary[]> => {
    const links = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task', (q) => q.eq('task_id', args.taskId))
      .collect()

    const result: TaskSummary[] = []
    for (const link of links) {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', link.depends_on_id))
        .unique()
      if (task && task.status !== 'done') {
        result.push({
          id: task.id,
          title: task.title,
          status: task.status as TaskSummary['status'],
        })
      }
    }
    return result
  },
})

/**
 * Check if a dependency exists
 */
export const exists = query({
  args: { taskId: v.string(), dependsOnId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task_depends_on', (q) =>
        q.eq('task_id', args.taskId).eq('depends_on_id', args.dependsOnId)
      )
      .unique()
    return existing !== null
  },
})

/**
 * Check if adding a dependency would create a cycle
 */
export const wouldCreateCycle = query({
  args: { taskId: v.string(), dependsOnId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    if (args.taskId === args.dependsOnId) return true

    const visited = new Set<string>()
    const queue: string[] = [args.dependsOnId]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === args.taskId) return true
      if (visited.has(current)) continue
      visited.add(current)

      const links = await ctx.db
        .query('taskDependencies')
        .withIndex('by_task', (q) => q.eq('task_id', current))
        .collect()

      for (const link of links) {
        if (!visited.has(link.depends_on_id)) {
          queue.push(link.depends_on_id)
        }
      }
    }
    return false
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Add a new dependency
 */
export const add = mutation({
  args: { taskId: v.string(), dependsOnId: v.string() },
  handler: async (ctx, args): Promise<TaskDependency> => {
    if (args.taskId === args.dependsOnId) {
      throw new Error('Cannot add self-dependency')
    }

    // Check if already exists
    const existing = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task_depends_on', (q) =>
        q.eq('task_id', args.taskId).eq('depends_on_id', args.dependsOnId)
      )
      .unique()
    if (existing) {
      throw new Error('Dependency already exists')
    }

    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('taskDependencies', {
      id,
      task_id: args.taskId,
      depends_on_id: args.dependsOnId,
      created_at: now,
    })

    const dep = await ctx.db.get(internalId)
    if (!dep) throw new Error('Failed to create dependency')

    return {
      id: dep.id,
      task_id: dep.task_id,
      depends_on_id: dep.depends_on_id,
      created_at: dep.created_at,
    }
  },
})

/**
 * Remove a dependency by ID
 */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const dep = await ctx.db
      .query('taskDependencies')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()
    if (!dep) return false

    await ctx.db.delete(dep._id)
    return true
  },
})

/**
 * Remove a dependency by relationship
 */
export const removeByRelationship = mutation({
  args: { taskId: v.string(), dependsOnId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const dep = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task_depends_on', (q) =>
        q.eq('task_id', args.taskId).eq('depends_on_id', args.dependsOnId)
      )
      .unique()
    if (!dep) return false

    await ctx.db.delete(dep._id)
    return true
  },
})
