import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Signal } from '../lib/types'

// ============================================
// Type Helpers
// ============================================

type SignalKind = "question" | "blocker" | "alert" | "fyi"
type SignalSeverity = "normal" | "high" | "critical"

// Convert Convex document to Signal type
function toSignal(doc: {
  id: string
  task_id: string
  session_key: string
  agent_id: string
  kind: SignalKind
  severity: SignalSeverity
  message: string
  blocking: boolean
  responded_at?: number
  response?: string
  delivered_at?: number
  created_at: number
}): Signal {
  return {
    id: doc.id,
    task_id: doc.task_id,
    session_key: doc.session_key,
    agent_id: doc.agent_id,
    kind: doc.kind,
    severity: doc.severity,
    message: doc.message,
    blocking: doc.blocking ? 1 : 0,
    responded_at: doc.responded_at ?? null,
    response: doc.response ?? null,
    delivered_at: doc.delivered_at ?? null,
    created_at: doc.created_at,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get signals with optional filters
 */
export const getAll = query({
  args: {
    taskId: v.optional(v.string()),
    kind: v.optional(v.union(
      v.literal('question'),
      v.literal('blocker'),
      v.literal('alert'),
      v.literal('fyi')
    )),
    onlyBlocking: v.optional(v.boolean()),
    onlyUnresponded: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ signals: Signal[]; pendingCount: number }> => {
    let signals = await ctx.db
      .query('signals')
      .order('desc')
      .collect()

    if (args.taskId) {
      signals = signals.filter((s) => s.task_id === args.taskId)
    }

    if (args.kind) {
      signals = signals.filter((s) => s.kind === args.kind)
    }

    if (args.onlyBlocking) {
      signals = signals.filter((s) => s.blocking)
    }

    if (args.onlyUnresponded) {
      signals = signals.filter((s) => !s.responded_at)
    }

    const sorted = signals
      .sort((a, b) => {
        const severityOrder: Record<SignalSeverity, number> = {
          critical: 0,
          high: 1,
          normal: 2,
        }
        const sevDiff = severityOrder[a.severity as SignalSeverity] - severityOrder[b.severity as SignalSeverity]
        if (sevDiff !== 0) return sevDiff
        return b.created_at - a.created_at
      })
      .slice(0, args.limit ?? 50)

    // Get pending count (blocking and unresponded)
    const allSignals = await ctx.db.query('signals').collect()
    const pendingCount = allSignals.filter((s) => s.blocking && !s.responded_at).length

    return {
      signals: sorted.map((s) => toSignal(s as Parameters<typeof toSignal>[0])),
      pendingCount,
    }
  },
})

/**
 * Get a single signal by UUID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<Signal | null> => {
    const signal = await ctx.db
      .query('signals')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!signal) {
      return null
    }

    return toSignal(signal as Parameters<typeof toSignal>[0])
  },
})

/**
 * Get pending (blocking and unresponded) signals count
 */
export const getPendingCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const signals = await ctx.db
      .query('signals')
      .withIndex('by_blocking', (q) => q.eq('blocking', true))
      .collect()

    return signals.filter((s) => !s.responded_at).length
  },
})

/**
 * Get pending signals for gate
 */
export const getPending = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Signal[]> => {
    const signals = await ctx.db
      .query('signals')
      .withIndex('by_blocking', (q) => q.eq('blocking', true))
      .collect()

    return signals
      .filter((s) => !s.responded_at)
      .sort((a, b) => {
        const severityOrder: Record<SignalSeverity, number> = {
          critical: 0,
          high: 1,
          normal: 2,
        }
        const sevDiff = severityOrder[a.severity as SignalSeverity] - severityOrder[b.severity as SignalSeverity]
        if (sevDiff !== 0) return sevDiff
        return b.created_at - a.created_at
      })
      .slice(0, args.limit ?? 10)
      .map((s) => toSignal(s as Parameters<typeof toSignal>[0]))
  },
})

/**
 * Get undelivered blocking signals (for notification routing)
 */
export const getUndeliveredBlocking = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Signal[]> => {
    const signals = await ctx.db
      .query('signals')
      .withIndex('by_blocking', (q) => q.eq('blocking', true))
      .collect()

    return signals
      .filter((s) => !s.delivered_at && !s.responded_at)
      .sort((a, b) => {
        const severityOrder: Record<SignalSeverity, number> = {
          critical: 0,
          high: 1,
          normal: 2,
        }
        const sevDiff = severityOrder[a.severity as SignalSeverity] - severityOrder[b.severity as SignalSeverity]
        if (sevDiff !== 0) return sevDiff
        return b.created_at - a.created_at
      })
      .slice(0, args.limit ?? 10)
      .map((s) => toSignal(s as Parameters<typeof toSignal>[0]))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new signal
 */
export const create = mutation({
  args: {
    taskId: v.string(),
    sessionKey: v.string(),
    agentId: v.string(),
    kind: v.union(
      v.literal('question'),
      v.literal('blocker'),
      v.literal('alert'),
      v.literal('fyi')
    ),
    severity: v.optional(v.union(
      v.literal('normal'),
      v.literal('high'),
      v.literal('critical')
    )),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<Signal> => {
    if (!args.message || args.message.trim().length === 0) {
      throw new Error('Message is required')
    }

    if (!args.sessionKey || args.sessionKey.trim().length === 0) {
      throw new Error('Session key is required')
    }

    if (!args.agentId || args.agentId.trim().length === 0) {
      throw new Error('Agent ID is required')
    }

    // Verify task exists
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()
    if (!task) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()
    const severity = args.severity ?? 'normal'
    const blocking = args.kind !== 'fyi'
    const id = generateId()

    const internalId = await ctx.db.insert('signals', {
      id,
      task_id: args.taskId,
      session_key: args.sessionKey,
      agent_id: args.agentId,
      kind: args.kind,
      severity,
      message: args.message.trim(),
      blocking,
      created_at: now,
    })

    const signal = await ctx.db.get(internalId)
    if (!signal) {
      throw new Error('Failed to create signal')
    }

    return toSignal(signal as Parameters<typeof toSignal>[0])
  },
})

/**
 * Respond to a signal
 */
export const respond = mutation({
  args: {
    id: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args): Promise<Signal> => {
    const existing = await ctx.db
      .query('signals')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Signal not found: ${args.id}`)
    }

    if (existing.responded_at) {
      throw new Error('Signal has already been responded to')
    }

    const now = Date.now()

    await ctx.db.patch(existing._id, {
      response: args.response,
      responded_at: now,
    })

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to update signal')
    }

    return toSignal(updated as Parameters<typeof toSignal>[0])
  },
})

/**
 * Mark a signal as delivered (notification sent to user)
 */
export const markDelivered = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<Signal> => {
    const existing = await ctx.db
      .query('signals')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Signal not found: ${args.id}`)
    }

    if (existing.delivered_at) {
      throw new Error('Signal has already been delivered')
    }

    const now = Date.now()

    await ctx.db.patch(existing._id, {
      delivered_at: now,
    })

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to update signal')
    }

    return toSignal(updated as Parameters<typeof toSignal>[0])
  },
})

/**
 * Delete a signal
 */
export const deleteSignal = mutation({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db
      .query('signals')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Signal not found: ${args.id}`)
    }

    await ctx.db.delete(existing._id)

    return { success: true }
  },
})
