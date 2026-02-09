import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

const STUCK_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export interface StuckTicket {
  id: string
  title: string
  updated_at: number
  age_minutes: number
}

/**
 * Find tickets stuck in 'in_review' status for over 30 minutes
 */
export const findStuck = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<StuckTicket[]> => {
    const now = Date.now()
    const cutoff = now - STUCK_THRESHOLD_MS

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project_status', (q) =>
        q.eq('project_id', args.projectId).eq('status', 'in_review')
      )
      .collect()

    const stuck = tasks.filter((t) => t.updated_at < cutoff)

    return stuck.map((t) => ({
      id: t.id,
      title: t.title,
      updated_at: t.updated_at,
      age_minutes: Math.round((now - t.updated_at) / (1000 * 60)),
    }))
  },
})

/**
 * Mark a stuck ticket as done
 */
export const markDone = mutation({
  args: { ticketId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.ticketId))
      .unique()

    if (!task) throw new Error('Task not found')

    const now = Date.now()
    await ctx.db.patch(task._id, {
      status: 'done',
      updated_at: now,
      completed_at: now,
    })
  },
})

/**
 * Move a stuck ticket back to ready
 */
export const markReady = mutation({
  args: { ticketId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.ticketId))
      .unique()

    if (!task) throw new Error('Task not found')

    const now = Date.now()
    await ctx.db.patch(task._id, {
      status: 'ready',
      updated_at: now,
      completed_at: undefined,
    })
  },
})
