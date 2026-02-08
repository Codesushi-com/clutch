import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import type { ConvexSession } from '../lib/types'

// ============================================
// Type Helpers
// ============================================

type SessionType = 'main' | 'chat' | 'agent' | 'cron'
type SessionStatus = 'active' | 'idle' | 'completed' | 'stale'

// Convert Convex document to Session type
function toSession(doc: {
  session_key: string
  session_id: string
  session_type: string
  model?: string
  provider?: string
  status: string
  tokens_input?: number
  tokens_output?: number
  tokens_cache_read?: number
  tokens_cache_write?: number
  tokens_total?: number
  cost_input?: number
  cost_output?: number
  cost_cache_read?: number
  cost_cache_write?: number
  cost_total?: number
  last_active_at?: number
  output_preview?: string
  stop_reason?: string
  task_id?: string
  project_slug?: string
  file_path?: string
  created_at?: number
  updated_at: number
}): ConvexSession {
  return {
    id: doc.session_key,
    session_id: doc.session_id,
    session_type: doc.session_type as SessionType,
    model: doc.model ?? null,
    provider: doc.provider ?? null,
    status: doc.status as SessionStatus,
    tokens_input: doc.tokens_input ?? null,
    tokens_output: doc.tokens_output ?? null,
    tokens_cache_read: doc.tokens_cache_read ?? null,
    tokens_cache_write: doc.tokens_cache_write ?? null,
    tokens_total: doc.tokens_total ?? null,
    cost_input: doc.cost_input ?? null,
    cost_output: doc.cost_output ?? null,
    cost_cache_read: doc.cost_cache_read ?? null,
    cost_cache_write: doc.cost_cache_write ?? null,
    cost_total: doc.cost_total ?? null,
    last_active_at: doc.last_active_at ?? null,
    output_preview: doc.output_preview ?? null,
    stop_reason: doc.stop_reason ?? null,
    task_id: doc.task_id ?? null,
    project_slug: doc.project_slug ?? null,
    file_path: doc.file_path ?? null,
    created_at: doc.created_at ?? null,
    updated_at: doc.updated_at,
  }
}

/**
 * Extract project slug from session key.
 * Pattern: agent:main:trap:{slug}:{chatId} → slug
 * Falls back to null if pattern doesn't match.
 */
function extractProjectSlug(sessionKey: string): string | null {
  // Match pattern like "agent:main:trap:the-trap:abc123" or "agent:main:trap:my-project:xyz"
  const match = sessionKey.match(/^agent:main:trap:([^:]+):/)
  if (match) {
    return match[1]
  }
  return null
}

// ============================================
// Queries
// ============================================

/**
 * List sessions with optional filters
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    session_type: v.optional(v.string()),
    project_slug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConvexSession[]> => {
    let sessions

    if (args.project_slug) {
      // Filter by project first (most specific index)
      sessions = await ctx.db
        .query('sessions')
        .withIndex('by_project', (q) => q.eq('project_slug', args.project_slug!))
        .collect()
    } else if (args.status) {
      sessions = await ctx.db
        .query('sessions')
        .withIndex('by_status', (q) => q.eq('status', args.status!))
        .collect()
    } else if (args.session_type) {
      sessions = await ctx.db
        .query('sessions')
        .withIndex('by_type', (q) => q.eq('session_type', args.session_type!))
        .collect()
    } else {
      sessions = await ctx.db
        .query('sessions')
        .collect()
    }

    // Apply additional filters if needed
    if (args.status && !args.project_slug) {
      sessions = sessions.filter((s) => s.status === args.status)
    }
    if (args.session_type && !args.project_slug) {
      sessions = sessions.filter((s) => s.session_type === args.session_type)
    }
    if (args.project_slug) {
      sessions = sessions.filter((s) => s.project_slug === args.project_slug)
    }

    // Sort by most recently updated first
    sessions.sort((a, b) => b.updated_at - a.updated_at)

    // Apply limit
    if (args.limit && args.limit > 0) {
      sessions = sessions.slice(0, args.limit)
    }

    return sessions.map((s) => toSession(s as Parameters<typeof toSession>[0]))
  },
})

/**
 * Get a single session by session_key
 */
export const get = query({
  args: {
    session_key: v.string(),
  },
  handler: async (ctx, args): Promise<ConvexSession | null> => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.session_key))
      .unique()

    if (!session) {
      return null
    }

    return toSession(session as Parameters<typeof toSession>[0])
  },
})

/**
 * Get sessions for a task
 */
export const getByTask = query({
  args: {
    task_id: v.string(),
  },
  handler: async (ctx, args): Promise<ConvexSession[]> => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_task', (q) => q.eq('task_id', args.task_id))
      .collect()

    // Sort by most recently updated first
    sessions.sort((a, b) => b.updated_at - a.updated_at)

    return sessions.map((s) => toSession(s as Parameters<typeof toSession>[0]))
  },
})

/**
 * Get all sessions for a project
 */
export const getForProject = query({
  args: {
    project_slug: v.string(),
  },
  handler: async (ctx, args): Promise<ConvexSession[]> => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_project', (q) => q.eq('project_slug', args.project_slug))
      .collect()

    // Sort by most recently updated first
    sessions.sort((a, b) => b.updated_at - a.updated_at)

    return sessions.map((s) => toSession(s as Parameters<typeof toSession>[0]))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Upsert a session by session_key
 * Creates if doesn't exist, updates if it does
 */
export const upsert = mutation({
  args: {
    session_key: v.string(),
    session_id: v.string(),
    session_type: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    status: v.string(),
    tokens_input: v.optional(v.number()),
    tokens_output: v.optional(v.number()),
    tokens_cache_read: v.optional(v.number()),
    tokens_cache_write: v.optional(v.number()),
    tokens_total: v.optional(v.number()),
    cost_input: v.optional(v.number()),
    cost_output: v.optional(v.number()),
    cost_cache_read: v.optional(v.number()),
    cost_cache_write: v.optional(v.number()),
    cost_total: v.optional(v.number()),
    last_active_at: v.optional(v.number()),
    output_preview: v.optional(v.string()),
    stop_reason: v.optional(v.string()),
    task_id: v.optional(v.string()),
    file_path: v.optional(v.string()),
    created_at: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConvexSession> => {
    const now = Date.now()

    // Extract project slug from session key
    const project_slug = extractProjectSlug(args.session_key)

    // Check if session already exists
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.session_key))
      .unique()

    if (existing) {
      // Update existing session
      const updates: Record<string, unknown> = {
        updated_at: now,
      }

      // Only update fields that are provided
      if (args.session_id !== undefined) updates.session_id = args.session_id
      if (args.session_type !== undefined) updates.session_type = args.session_type
      if (args.model !== undefined) updates.model = args.model
      if (args.provider !== undefined) updates.provider = args.provider
      if (args.status !== undefined) updates.status = args.status
      if (args.tokens_input !== undefined) updates.tokens_input = args.tokens_input
      if (args.tokens_output !== undefined) updates.tokens_output = args.tokens_output
      if (args.tokens_cache_read !== undefined) updates.tokens_cache_read = args.tokens_cache_read
      if (args.tokens_cache_write !== undefined) updates.tokens_cache_write = args.tokens_cache_write
      if (args.tokens_total !== undefined) updates.tokens_total = args.tokens_total
      if (args.cost_input !== undefined) updates.cost_input = args.cost_input
      if (args.cost_output !== undefined) updates.cost_output = args.cost_output
      if (args.cost_cache_read !== undefined) updates.cost_cache_read = args.cost_cache_read
      if (args.cost_cache_write !== undefined) updates.cost_cache_write = args.cost_cache_write
      if (args.cost_total !== undefined) updates.cost_total = args.cost_total
      if (args.last_active_at !== undefined) updates.last_active_at = args.last_active_at
      if (args.output_preview !== undefined) updates.output_preview = args.output_preview
      if (args.stop_reason !== undefined) updates.stop_reason = args.stop_reason
      if (args.task_id !== undefined) updates.task_id = args.task_id
      if (args.file_path !== undefined) updates.file_path = args.file_path
      if (project_slug !== null) updates.project_slug = project_slug

      await ctx.db.patch(existing._id, updates)

      const updated = await ctx.db.get(existing._id)
      if (!updated) {
        throw new Error('Failed to update session')
      }

      return toSession(updated as Parameters<typeof toSession>[0])
    } else {
      // Create new session - use type assertion for dynamic optional fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newSession: any = {
        session_key: args.session_key,
        session_id: args.session_id,
        session_type: args.session_type,
        status: args.status,
        updated_at: now,
        created_at: args.created_at ?? now,
      }

      // Only add optional fields if they are provided
      if (args.model !== undefined) newSession.model = args.model
      if (args.provider !== undefined) newSession.provider = args.provider
      if (args.tokens_input !== undefined) newSession.tokens_input = args.tokens_input
      if (args.tokens_output !== undefined) newSession.tokens_output = args.tokens_output
      if (args.tokens_cache_read !== undefined) newSession.tokens_cache_read = args.tokens_cache_read
      if (args.tokens_cache_write !== undefined) newSession.tokens_cache_write = args.tokens_cache_write
      if (args.tokens_total !== undefined) newSession.tokens_total = args.tokens_total
      if (args.cost_input !== undefined) newSession.cost_input = args.cost_input
      if (args.cost_output !== undefined) newSession.cost_output = args.cost_output
      if (args.cost_cache_read !== undefined) newSession.cost_cache_read = args.cost_cache_read
      if (args.cost_cache_write !== undefined) newSession.cost_cache_write = args.cost_cache_write
      if (args.cost_total !== undefined) newSession.cost_total = args.cost_total
      if (args.last_active_at !== undefined) newSession.last_active_at = args.last_active_at
      if (args.output_preview !== undefined) newSession.output_preview = args.output_preview
      if (args.stop_reason !== undefined) newSession.stop_reason = args.stop_reason
      if (args.task_id !== undefined) newSession.task_id = args.task_id
      if (project_slug !== null) newSession.project_slug = project_slug
      if (args.file_path !== undefined) newSession.file_path = args.file_path

      const internalId = await ctx.db.insert('sessions', newSession)
      const created = await ctx.db.get(internalId)

      if (!created) {
        throw new Error('Failed to create session')
      }

      return toSession(created as Parameters<typeof toSession>[0])
    }
  },
})

/**
 * Batch upsert multiple sessions
 * Used by the watcher for efficient batched writes
 */
export const batchUpsert = mutation({
  args: {
    sessions: v.array(
      v.object({
        session_key: v.string(),
        session_id: v.string(),
        session_type: v.string(),
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
        status: v.string(),
        tokens_input: v.optional(v.number()),
        tokens_output: v.optional(v.number()),
        tokens_cache_read: v.optional(v.number()),
        tokens_cache_write: v.optional(v.number()),
        tokens_total: v.optional(v.number()),
        cost_input: v.optional(v.number()),
        cost_output: v.optional(v.number()),
        cost_cache_read: v.optional(v.number()),
        cost_cache_write: v.optional(v.number()),
        cost_total: v.optional(v.number()),
        last_active_at: v.optional(v.number()),
        output_preview: v.optional(v.string()),
        stop_reason: v.optional(v.string()),
        task_id: v.optional(v.string()),
        file_path: v.optional(v.string()),
        created_at: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ created: number; updated: number }> => {
    const now = Date.now()
    let created = 0
    let updated = 0

    for (const sessionData of args.sessions) {
      // Extract project slug from session key
      const project_slug = extractProjectSlug(sessionData.session_key)

      // Check if session already exists
      const existing = await ctx.db
        .query('sessions')
        .withIndex('by_session_key', (q) => q.eq('session_key', sessionData.session_key))
        .unique()

      if (existing) {
        // Update existing session
        const updates: Record<string, unknown> = {
          updated_at: now,
        }

        if (sessionData.session_id !== undefined) updates.session_id = sessionData.session_id
        if (sessionData.session_type !== undefined) updates.session_type = sessionData.session_type
        if (sessionData.model !== undefined) updates.model = sessionData.model
        if (sessionData.provider !== undefined) updates.provider = sessionData.provider
        if (sessionData.status !== undefined) updates.status = sessionData.status
        if (sessionData.tokens_input !== undefined) updates.tokens_input = sessionData.tokens_input
        if (sessionData.tokens_output !== undefined) updates.tokens_output = sessionData.tokens_output
        if (sessionData.tokens_cache_read !== undefined) updates.tokens_cache_read = sessionData.tokens_cache_read
        if (sessionData.tokens_cache_write !== undefined) updates.tokens_cache_write = sessionData.tokens_cache_write
        if (sessionData.tokens_total !== undefined) updates.tokens_total = sessionData.tokens_total
        if (sessionData.cost_input !== undefined) updates.cost_input = sessionData.cost_input
        if (sessionData.cost_output !== undefined) updates.cost_output = sessionData.cost_output
        if (sessionData.cost_cache_read !== undefined) updates.cost_cache_read = sessionData.cost_cache_read
        if (sessionData.cost_cache_write !== undefined) updates.cost_cache_write = sessionData.cost_cache_write
        if (sessionData.cost_total !== undefined) updates.cost_total = sessionData.cost_total
        if (sessionData.last_active_at !== undefined) updates.last_active_at = sessionData.last_active_at
        if (sessionData.output_preview !== undefined) updates.output_preview = sessionData.output_preview
        if (sessionData.stop_reason !== undefined) updates.stop_reason = sessionData.stop_reason
        if (sessionData.task_id !== undefined) updates.task_id = sessionData.task_id
        if (sessionData.file_path !== undefined) updates.file_path = sessionData.file_path
        if (project_slug !== null) updates.project_slug = project_slug

        await ctx.db.patch(existing._id, updates)
        updated++
      } else {
        // Create new session - use type assertion for dynamic optional fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newSession: any = {
          session_key: sessionData.session_key,
          session_id: sessionData.session_id,
          session_type: sessionData.session_type,
          status: sessionData.status,
          updated_at: now,
          created_at: sessionData.created_at ?? now,
        }

        // Only add optional fields if they are provided
        if (sessionData.model !== undefined) newSession.model = sessionData.model
        if (sessionData.provider !== undefined) newSession.provider = sessionData.provider
        if (sessionData.tokens_input !== undefined) newSession.tokens_input = sessionData.tokens_input
        if (sessionData.tokens_output !== undefined) newSession.tokens_output = sessionData.tokens_output
        if (sessionData.tokens_cache_read !== undefined) newSession.tokens_cache_read = sessionData.tokens_cache_read
        if (sessionData.tokens_cache_write !== undefined) newSession.tokens_cache_write = sessionData.tokens_cache_write
        if (sessionData.tokens_total !== undefined) newSession.tokens_total = sessionData.tokens_total
        if (sessionData.cost_input !== undefined) newSession.cost_input = sessionData.cost_input
        if (sessionData.cost_output !== undefined) newSession.cost_output = sessionData.cost_output
        if (sessionData.cost_cache_read !== undefined) newSession.cost_cache_read = sessionData.cost_cache_read
        if (sessionData.cost_cache_write !== undefined) newSession.cost_cache_write = sessionData.cost_cache_write
        if (sessionData.cost_total !== undefined) newSession.cost_total = sessionData.cost_total
        if (sessionData.last_active_at !== undefined) newSession.last_active_at = sessionData.last_active_at
        if (sessionData.output_preview !== undefined) newSession.output_preview = sessionData.output_preview
        if (sessionData.stop_reason !== undefined) newSession.stop_reason = sessionData.stop_reason
        if (sessionData.task_id !== undefined) newSession.task_id = sessionData.task_id
        if (project_slug !== null) newSession.project_slug = project_slug
        if (sessionData.file_path !== undefined) newSession.file_path = sessionData.file_path

        await ctx.db.insert('sessions', newSession)
        created++
      }
    }

    return { created, updated }
  },
})

/**
 * Remove a session by session_key
 */
export const remove = mutation({
  args: {
    session_key: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.session_key))
      .unique()

    if (!existing) {
      return { success: false }
    }

    await ctx.db.delete(existing._id)
    return { success: true }
  },
})

/**
 * Remove stale sessions (not updated in N hours)
 */
export const removeStale = mutation({
  args: {
    hours: v.number(),
  },
  handler: async (ctx, args): Promise<{ removed: number }> => {
    const cutoffTime = Date.now() - (args.hours * 60 * 60 * 1000)

    // Get all sessions
    const sessions = await ctx.db
      .query('sessions')
      .collect()

    // Filter to stale sessions
    const staleSessions = sessions.filter((s) => s.updated_at < cutoffTime)

    // Remove them
    for (const session of staleSessions) {
      await ctx.db.delete(session._id)
    }

    return { removed: staleSessions.length }
  },
})
