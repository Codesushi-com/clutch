import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

// ============================================
// Types
// ============================================

export type SessionType = 'main' | 'chat' | 'agent' | 'cron'
export type SessionStatus = 'active' | 'idle' | 'completed' | 'stale'

export interface Session {
  id: string
  session_key: string
  session_id: string
  session_type: SessionType
  model: string | null
  provider: string | null
  status: SessionStatus
  tokens_input: number | null
  tokens_output: number | null
  tokens_cache_read: number | null
  tokens_cache_write: number | null
  tokens_total: number | null
  cost_input: number | null
  cost_output: number | null
  cost_cache_read: number | null
  cost_cache_write: number | null
  cost_total: number | null
  last_active_at: number | null
  output_preview: string | null
  stop_reason: string | null
  task_id: string | null
  project_slug: string | null
  file_path: string | null
  created_at: number | null
  updated_at: number
  completed_at: number | null
}

export interface SessionInput {
  session_key: string
  session_id: string
  session_type: SessionType
  model?: string
  provider?: string
  status: SessionStatus
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
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract project_slug from session_key.
 * Pattern: agent:main:clutch:{slug}:{chatId} -> slug
 * Falls back to undefined if pattern doesn't match.
 */
function extractProjectSlug(sessionKey: string): string | undefined {
  // Pattern: agent:main:clutch:{slug}:{chatId} or similar clutch:slug patterns
  const clutchMatch = sessionKey.match(/:clutch:([^:]+)/)
  if (clutchMatch) {
    return clutchMatch[1]
  }
  return undefined
}

// ============================================
// Queries
// ============================================

/**
 * Get a single session by session_key
 */
export const get = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args): Promise<Session | null> => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.sessionKey))
      .unique()

    if (!session) {
      return null
    }

    return {
      id: session.id,
      session_key: session.session_key ?? session.id ?? "",
      session_id: session.session_id,
      session_type: session.session_type as SessionType,
      model: session.model ?? null,
      provider: session.provider ?? null,
      status: session.status as SessionStatus,
      tokens_input: session.tokens_input ?? null,
      tokens_output: session.tokens_output ?? null,
      tokens_cache_read: session.tokens_cache_read ?? null,
      tokens_cache_write: session.tokens_cache_write ?? null,
      tokens_total: session.tokens_total ?? null,
      cost_input: session.cost_input ?? null,
      cost_output: session.cost_output ?? null,
      cost_cache_read: session.cost_cache_read ?? null,
      cost_cache_write: session.cost_cache_write ?? null,
      cost_total: session.cost_total ?? null,
      last_active_at: session.last_active_at ?? null,
      output_preview: session.output_preview ?? null,
      stop_reason: session.stop_reason ?? null,
      task_id: session.task_id ?? null,
      project_slug: session.project_slug ?? null,
      file_path: session.file_path ?? null,
      created_at: session.created_at ?? null,
      updated_at: session.updated_at,
      completed_at: session.completed_at ?? null,
    }
  },
})

/**
 * Get session(s) by task_id
 */
export const getByTask = query({
  args: {
    taskId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Session[]> => {
    let sessions = await ctx.db
      .query('sessions')
      .withIndex('by_task', (q) => q.eq('task_id', args.taskId))
      .collect()

    if (args.limit) {
      sessions = sessions.slice(0, args.limit)
    }

    return sessions.map((s) => ({
      id: s.id,
      session_key: s.session_key ?? s.id ?? "",
      session_id: s.session_id,
      session_type: s.session_type as SessionType,
      model: s.model ?? null,
      provider: s.provider ?? null,
      status: s.status as SessionStatus,
      tokens_input: s.tokens_input ?? null,
      tokens_output: s.tokens_output ?? null,
      tokens_cache_read: s.tokens_cache_read ?? null,
      tokens_cache_write: s.tokens_cache_write ?? null,
      tokens_total: s.tokens_total ?? null,
      cost_input: s.cost_input ?? null,
      cost_output: s.cost_output ?? null,
      cost_cache_read: s.cost_cache_read ?? null,
      cost_cache_write: s.cost_cache_write ?? null,
      cost_total: s.cost_total ?? null,
      last_active_at: s.last_active_at ?? null,
      output_preview: s.output_preview ?? null,
      stop_reason: s.stop_reason ?? null,
      task_id: s.task_id ?? null,
      project_slug: s.project_slug ?? null,
      file_path: s.file_path ?? null,
      created_at: s.created_at ?? null,
      updated_at: s.updated_at,
      completed_at: s.completed_at ?? null,
    }))
  },
})

/**
 * Get all sessions for a project_slug
 */
export const getForProject = query({
  args: {
    projectSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Session[]> => {
    let sessions = await ctx.db
      .query('sessions')
      .withIndex('by_project', (q) => q.eq('project_slug', args.projectSlug))
      .collect()

    if (args.limit) {
      sessions = sessions.slice(0, args.limit)
    }

    return sessions.map((s) => ({
      id: s.id,
      session_key: s.session_key ?? s.id ?? "",
      session_id: s.session_id,
      session_type: s.session_type as SessionType,
      model: s.model ?? null,
      provider: s.provider ?? null,
      status: s.status as SessionStatus,
      tokens_input: s.tokens_input ?? null,
      tokens_output: s.tokens_output ?? null,
      tokens_cache_read: s.tokens_cache_read ?? null,
      tokens_cache_write: s.tokens_cache_write ?? null,
      tokens_total: s.tokens_total ?? null,
      cost_input: s.cost_input ?? null,
      cost_output: s.cost_output ?? null,
      cost_cache_read: s.cost_cache_read ?? null,
      cost_cache_write: s.cost_cache_write ?? null,
      cost_total: s.cost_total ?? null,
      last_active_at: s.last_active_at ?? null,
      output_preview: s.output_preview ?? null,
      stop_reason: s.stop_reason ?? null,
      task_id: s.task_id ?? null,
      project_slug: s.project_slug ?? null,
      file_path: s.file_path ?? null,
      created_at: s.created_at ?? null,
      updated_at: s.updated_at,
      completed_at: s.completed_at ?? null,
    }))
  },
})

/**
 * List sessions with optional filters
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal('active'),
      v.literal('idle'),
      v.literal('completed'),
      v.literal('stale')
    )),
    sessionType: v.optional(v.union(
      v.literal('main'),
      v.literal('chat'),
      v.literal('agent'),
      v.literal('cron')
    )),
    projectSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Session[]> => {
    let sessions

    // Use the most specific index available
    const projectSlug = args.projectSlug
    const status = args.status
    const sessionType = args.sessionType

    if (projectSlug) {
      sessions = await ctx.db
        .query('sessions')
        .withIndex('by_project', (q) => q.eq('project_slug', projectSlug))
        .collect()
    } else if (status) {
      sessions = await ctx.db
        .query('sessions')
        .withIndex('by_status', (q) => q.eq('status', status))
        .collect()
    } else if (sessionType) {
      sessions = await ctx.db
        .query('sessions')
        .withIndex('by_type', (q) => q.eq('session_type', sessionType))
        .collect()
    } else {
      sessions = await ctx.db.query('sessions').collect()
    }

    // Additional in-memory filtering is not needed since we filter at the index level above

    // Sort by updated_at descending (most recent first)
    sessions = sessions.sort((a, b) => b.updated_at - a.updated_at)

    if (args.limit) {
      sessions = sessions.slice(0, args.limit)
    }

    return sessions.map((s) => ({
      id: s.id,
      session_key: s.session_key ?? s.id ?? "",
      session_id: s.session_id,
      session_type: s.session_type as SessionType,
      model: s.model ?? null,
      provider: s.provider ?? null,
      status: s.status as SessionStatus,
      tokens_input: s.tokens_input ?? null,
      tokens_output: s.tokens_output ?? null,
      tokens_cache_read: s.tokens_cache_read ?? null,
      tokens_cache_write: s.tokens_cache_write ?? null,
      tokens_total: s.tokens_total ?? null,
      cost_input: s.cost_input ?? null,
      cost_output: s.cost_output ?? null,
      cost_cache_read: s.cost_cache_read ?? null,
      cost_cache_write: s.cost_cache_write ?? null,
      cost_total: s.cost_total ?? null,
      last_active_at: s.last_active_at ?? null,
      output_preview: s.output_preview ?? null,
      stop_reason: s.stop_reason ?? null,
      task_id: s.task_id ?? null,
      project_slug: s.project_slug ?? null,
      file_path: s.file_path ?? null,
      created_at: s.created_at ?? null,
      updated_at: s.updated_at,
      completed_at: s.completed_at ?? null,
    }))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Upsert a session by session_key.
 * Creates if doesn't exist, updates if it does.
 */
export const upsert = mutation({
  args: {
    sessionKey: v.string(),
    sessionId: v.string(),
    sessionType: v.union(v.literal('main'), v.literal('chat'), v.literal('agent'), v.literal('cron')),
    status: v.union(v.literal('active'), v.literal('idle'), v.literal('completed'), v.literal('stale')),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    tokensInput: v.optional(v.number()),
    tokensOutput: v.optional(v.number()),
    tokensCacheRead: v.optional(v.number()),
    tokensCacheWrite: v.optional(v.number()),
    tokensTotal: v.optional(v.number()),
    costInput: v.optional(v.float64()),
    costOutput: v.optional(v.float64()),
    costCacheRead: v.optional(v.float64()),
    costCacheWrite: v.optional(v.float64()),
    costTotal: v.optional(v.float64()),
    lastActiveAt: v.optional(v.number()),
    outputPreview: v.optional(v.string()),
    stopReason: v.optional(v.string()),
    taskId: v.optional(v.string()),
    projectSlug: v.optional(v.string()),
    filePath: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Session> => {
    const now = Date.now()

    // Try to find existing session
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.sessionKey))
      .unique()

    // Extract project_slug from session_key if not provided
    const projectSlug = args.projectSlug ?? extractProjectSlug(args.sessionKey)

    if (existing) {
      // Update existing session
      await ctx.db.patch(existing._id, {
        session_id: args.sessionId,
        session_type: args.sessionType,
        status: args.status,
        model: args.model,
        provider: args.provider,
        tokens_input: args.tokensInput,
        tokens_output: args.tokensOutput,
        tokens_cache_read: args.tokensCacheRead,
        tokens_cache_write: args.tokensCacheWrite,
        tokens_total: args.tokensTotal,
        cost_input: args.costInput,
        cost_output: args.costOutput,
        cost_cache_read: args.costCacheRead,
        cost_cache_write: args.costCacheWrite,
        cost_total: args.costTotal,
        last_active_at: args.lastActiveAt,
        output_preview: args.outputPreview,
        stop_reason: args.stopReason,
        task_id: args.taskId,
        project_slug: projectSlug,
        file_path: args.filePath,
        updated_at: now,
      })

      return {
        id: existing.id,
        session_key: args.sessionKey,
        session_id: args.sessionId,
        session_type: args.sessionType,
        model: args.model ?? null,
        provider: args.provider ?? null,
        status: args.status,
        tokens_input: args.tokensInput ?? null,
        tokens_output: args.tokensOutput ?? null,
        tokens_cache_read: args.tokensCacheRead ?? null,
        tokens_cache_write: args.tokensCacheWrite ?? null,
        tokens_total: args.tokensTotal ?? null,
        cost_input: args.costInput ?? null,
        cost_output: args.costOutput ?? null,
        cost_cache_read: args.costCacheRead ?? null,
        cost_cache_write: args.costCacheWrite ?? null,
        cost_total: args.costTotal ?? null,
        last_active_at: args.lastActiveAt ?? null,
        output_preview: args.outputPreview ?? null,
        stop_reason: args.stopReason ?? null,
        task_id: args.taskId ?? null,
        project_slug: projectSlug ?? null,
        file_path: args.filePath ?? null,
        created_at: existing.created_at ?? null,
        updated_at: now,
        completed_at: existing.completed_at ?? null,
      }
    } else {
      // Create new session
      const id = generateId()
      const createdAt = args.createdAt ?? now

      await ctx.db.insert('sessions', {
        id,
        session_key: args.sessionKey,
        session_id: args.sessionId,
        session_type: args.sessionType,
        status: args.status,
        model: args.model,
        provider: args.provider,
        tokens_input: args.tokensInput,
        tokens_output: args.tokensOutput,
        tokens_cache_read: args.tokensCacheRead,
        tokens_cache_write: args.tokensCacheWrite,
        tokens_total: args.tokensTotal,
        cost_input: args.costInput,
        cost_output: args.costOutput,
        cost_cache_read: args.costCacheRead,
        cost_cache_write: args.costCacheWrite,
        cost_total: args.costTotal,
        last_active_at: args.lastActiveAt,
        output_preview: args.outputPreview,
        stop_reason: args.stopReason,
        task_id: args.taskId,
        project_slug: projectSlug,
        file_path: args.filePath,
        created_at: createdAt,
        updated_at: now,
      })

      return {
        id,
        session_key: args.sessionKey,
        session_id: args.sessionId,
        session_type: args.sessionType,
        model: args.model ?? null,
        provider: args.provider ?? null,
        status: args.status,
        tokens_input: args.tokensInput ?? null,
        tokens_output: args.tokensOutput ?? null,
        tokens_cache_read: args.tokensCacheRead ?? null,
        tokens_cache_write: args.tokensCacheWrite ?? null,
        tokens_total: args.tokensTotal ?? null,
        cost_input: args.costInput ?? null,
        cost_output: args.costOutput ?? null,
        cost_cache_read: args.costCacheRead ?? null,
        cost_cache_write: args.costCacheWrite ?? null,
        cost_total: args.costTotal ?? null,
        last_active_at: args.lastActiveAt ?? null,
        output_preview: args.outputPreview ?? null,
        stop_reason: args.stopReason ?? null,
        task_id: args.taskId ?? null,
        project_slug: projectSlug ?? null,
        file_path: args.filePath ?? null,
        created_at: createdAt,
        updated_at: now,
        completed_at: null,
      }
    }
  },
})

/**
 * Batch upsert multiple sessions.
 * Used by the watcher for batched writes.
 */
export const batchUpsert = mutation({
  args: {
    sessions: v.array(v.object({
      sessionKey: v.string(),
      sessionId: v.string(),
      sessionType: v.union(v.literal('main'), v.literal('chat'), v.literal('agent'), v.literal('cron')),
      status: v.union(v.literal('active'), v.literal('idle'), v.literal('completed'), v.literal('stale')),
      model: v.optional(v.string()),
      provider: v.optional(v.string()),
      tokensInput: v.optional(v.number()),
      tokensOutput: v.optional(v.number()),
      tokensCacheRead: v.optional(v.number()),
      tokensCacheWrite: v.optional(v.number()),
      tokensTotal: v.optional(v.number()),
      costInput: v.optional(v.float64()),
      costOutput: v.optional(v.float64()),
      costCacheRead: v.optional(v.float64()),
      costCacheWrite: v.optional(v.float64()),
      costTotal: v.optional(v.float64()),
      lastActiveAt: v.optional(v.number()),
      outputPreview: v.optional(v.string()),
      stopReason: v.optional(v.string()),
      taskId: v.optional(v.string()),
      projectSlug: v.optional(v.string()),
      filePath: v.optional(v.string()),
      createdAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args): Promise<{ count: number; errors: string[] }> => {
    const now = Date.now()
    const errors: string[] = []
    let count = 0

    for (const session of args.sessions) {
      try {
        // Try to find existing session
        const existing = await ctx.db
          .query('sessions')
          .withIndex('by_session_key', (q) => q.eq('session_key', session.sessionKey))
          .unique()

        // Extract project_slug from session_key if not provided
        const projectSlug = session.projectSlug ?? extractProjectSlug(session.sessionKey)

        if (existing) {
          // Update existing session
          await ctx.db.patch(existing._id, {
            session_id: session.sessionId,
            session_type: session.sessionType,
            status: session.status,
            model: session.model,
            provider: session.provider,
            tokens_input: session.tokensInput,
            tokens_output: session.tokensOutput,
            tokens_cache_read: session.tokensCacheRead,
            tokens_cache_write: session.tokensCacheWrite,
            tokens_total: session.tokensTotal,
            cost_input: session.costInput,
            cost_output: session.costOutput,
            cost_cache_read: session.costCacheRead,
            cost_cache_write: session.costCacheWrite,
            cost_total: session.costTotal,
            last_active_at: session.lastActiveAt,
            output_preview: session.outputPreview,
            stop_reason: session.stopReason,
            task_id: session.taskId,
            project_slug: projectSlug,
            file_path: session.filePath,
            updated_at: now,
          })
        } else {
          // Create new session
          const id = generateId()
          const createdAt = session.createdAt ?? now

          await ctx.db.insert('sessions', {
            id,
            session_key: session.sessionKey,
            session_id: session.sessionId,
            session_type: session.sessionType,
            status: session.status,
            model: session.model,
            provider: session.provider,
            tokens_input: session.tokensInput,
            tokens_output: session.tokensOutput,
            tokens_cache_read: session.tokensCacheRead,
            tokens_cache_write: session.tokensCacheWrite,
            tokens_total: session.tokensTotal,
            cost_input: session.costInput,
            cost_output: session.costOutput,
            cost_cache_read: session.costCacheRead,
            cost_cache_write: session.costCacheWrite,
            cost_total: session.costTotal,
            last_active_at: session.lastActiveAt,
            output_preview: session.outputPreview,
            stop_reason: session.stopReason,
            task_id: session.taskId,
            project_slug: projectSlug,
            file_path: session.filePath,
            created_at: createdAt,
            updated_at: now,
          })
        }
        count++
      } catch (error) {
        errors.push(`Failed to upsert ${session.sessionKey}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return { count, errors }
  },
})

/**
 * Remove a session by session_key
 */
export const remove = mutation({
  args: { sessionKey: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.sessionKey))
      .unique()

    if (!session) {
      return false
    }

    await ctx.db.delete(session._id)
    return true
  },
})

/**
 * Remove stale sessions (not updated in N hours)
 */
export const removeStale = mutation({
  args: {
    hours: v.number(), // Remove sessions not updated in this many hours
    dryRun: v.optional(v.boolean()), // If true, return count without deleting
  },
  handler: async (ctx, args): Promise<{ deleted: number; sessionKeys: string[] }> => {
    const cutoff = Date.now() - (args.hours * 60 * 60 * 1000)

    // Get all sessions
    const allSessions = await ctx.db.query('sessions').collect()

    // Filter to stale ones
    const staleSessions = allSessions.filter((s) => s.updated_at < cutoff)

    const sessionKeys: string[] = []

    if (!args.dryRun) {
      for (const session of staleSessions) {
        await ctx.db.delete(session._id)
        sessionKeys.push(session.session_key ?? session.id ?? "")
      }
    } else {
      for (const session of staleSessions) {
        sessionKeys.push(session.session_key ?? session.id ?? "")
      }
    }

    return {
      deleted: staleSessions.length,
      sessionKeys,
    }
  },
})