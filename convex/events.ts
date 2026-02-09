import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Event, EventType } from '../lib/types'

// ============================================
// Type Helpers
// ============================================

// Convert Convex document to Event type
function toEvent(doc: {
  id: string
  project_id?: string
  task_id?: string
  type: EventType
  actor: string
  data?: string
  created_at: number
}): Event {
  return {
    id: doc.id,
    project_id: doc.project_id ?? null,
    task_id: doc.task_id ?? null,
    type: doc.type,
    actor: doc.actor,
    data: doc.data ?? null,
    created_at: doc.created_at,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get events for a project
 */
export const getByProject = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Event[]> => {
    let events = await ctx.db
      .query('events')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .collect()

    // Sort by created_at descending (newest first)
    events = events.sort((a, b) => b.created_at - a.created_at)

    if (args.limit) {
      events = events.slice(0, args.limit)
    }

    return events.map((e) => toEvent(e as Parameters<typeof toEvent>[0]))
  },
})

/**
 * Get events for a task
 */
export const getByTask = query({
  args: {
    taskId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Event[]> => {
    let events = await ctx.db
      .query('events')
      .withIndex('by_task', (q) => q.eq('task_id', args.taskId))
      .collect()

    // Sort by created_at descending (newest first)
    events = events.sort((a, b) => b.created_at - a.created_at)

    if (args.limit) {
      events = events.slice(0, args.limit)
    }

    return events.map((e) => toEvent(e as Parameters<typeof toEvent>[0]))
  },
})

/**
 * Get a single event by UUID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<Event | null> => {
    const event = await ctx.db
      .query('events')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!event) {
      return null
    }

    return toEvent(event as Parameters<typeof toEvent>[0])
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new event (audit trail entry)
 */
export const create = mutation({
  args: {
    projectId: v.optional(v.string()),
    taskId: v.optional(v.string()),
    type: v.union(
      v.literal('task_created'),
      v.literal('task_moved'),
      v.literal('task_assigned'),
      v.literal('task_completed'),
      v.literal('comment_added'),
      v.literal('agent_started'),
      v.literal('agent_completed'),
      v.literal('chat_created'),
      v.literal('message_sent')
    ),
    actor: v.string(),
    data: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Event> => {
    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('events', {
      id,
      project_id: args.projectId,
      task_id: args.taskId,
      type: args.type,
      actor: args.actor,
      data: args.data,
      created_at: now,
    })

    const event = await ctx.db.get(internalId)
    if (!event) {
      throw new Error('Failed to create event')
    }

    return toEvent(event as Parameters<typeof toEvent>[0])
  },
})
