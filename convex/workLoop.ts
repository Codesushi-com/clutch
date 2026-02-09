import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

// ============================================
// Types
// ============================================

type WorkLoopPhase = "cleanup" | "triage" | "review" | "work" | "idle" | "error"
type WorkLoopStatus = "running" | "paused" | "stopped" | "error"

// Convex document types
interface WorkLoopRunDoc {
  id: string
  project_id: string
  cycle: number
  phase: WorkLoopPhase
  action: string
  task_id?: string
  session_key?: string
  details?: string
  duration_ms?: number
  created_at: number
}

interface WorkLoopStateDoc {
  id: string
  project_id: string
  status: WorkLoopStatus
  current_phase?: string
  current_cycle: number
  active_agents: number
  max_agents: number
  last_cycle_at?: number
  error_message?: string
  updated_at: number
}

// Return types for API
export interface WorkLoopRun {
  id: string
  project_id: string
  cycle: number
  phase: WorkLoopPhase
  action: string
  task_id: string | null
  session_key: string | null
  details: string | null
  duration_ms: number | null
  created_at: number
}

export interface WorkLoopState {
  id: string
  project_id: string
  status: WorkLoopStatus
  current_phase: string | null
  current_cycle: number
  active_agents: number
  max_agents: number
  last_cycle_at: number | null
  error_message: string | null
  updated_at: number
}

export interface WorkLoopStats {
  actions_today: number
  errors_today: number
  avg_cycle_time_ms: number | null
}

// ============================================
// Type Helpers
// ============================================

function toWorkLoopRun(doc: WorkLoopRunDoc): WorkLoopRun {
  return {
    id: doc.id,
    project_id: doc.project_id,
    cycle: doc.cycle,
    phase: doc.phase,
    action: doc.action,
    task_id: doc.task_id ?? null,
    session_key: doc.session_key ?? null,
    details: doc.details ?? null,
    duration_ms: doc.duration_ms ?? null,
    created_at: doc.created_at,
  }
}

function toWorkLoopState(doc: WorkLoopStateDoc): WorkLoopState {
  return {
    id: doc.id,
    project_id: doc.project_id,
    status: doc.status,
    current_phase: doc.current_phase ?? null,
    current_cycle: doc.current_cycle,
    active_agents: doc.active_agents,
    max_agents: doc.max_agents,
    last_cycle_at: doc.last_cycle_at ?? null,
    error_message: doc.error_message ?? null,
    updated_at: doc.updated_at,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get loop state for a project
 */
export const getState = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<WorkLoopState | null> => {
    const state = await ctx.db
      .query('workLoopState')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .unique()

    if (!state) {
      return null
    }

    return toWorkLoopState(state as WorkLoopStateDoc)
  },
})

/**
 * Paginated list of runs for a project (default last 50)
 */
export const listRuns = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()), // created_at timestamp for pagination
  },
  handler: async (ctx, args): Promise<WorkLoopRun[]> => {
    const limit = args.limit ?? 50

    let runs
    if (args.before) {
      runs = await ctx.db
        .query('workLoopRuns')
        .withIndex('by_project_created', (q) =>
          q.eq('project_id', args.projectId).lt('created_at', args.before!)
        )
        .order("desc")
        .take(limit)
    } else {
      runs = await ctx.db
        .query('workLoopRuns')
        .withIndex('by_project_created', (q) =>
          q.eq('project_id', args.projectId)
        )
        .order("desc")
        .take(limit)
    }

    return runs.map((r) => toWorkLoopRun(r as WorkLoopRunDoc))
  },
})

/**
 * Aggregate stats for a project (actions today, errors today, avg cycle time)
 */
export const getStats = query({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<WorkLoopStats> => {
    const now = Date.now()
    const d = new Date(now)
    const startOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

    // Get today's runs for this project
    const runs = await ctx.db
      .query('workLoopRuns')
      .withIndex('by_project_created', (q) =>
        q.eq('project_id', args.projectId).gte('created_at', startOfDay)
      )
      .collect()

    const actionsToday = runs.length
    const errorsToday = runs.filter((r) => r.phase === 'error').length

    // Calculate average cycle time for runs with duration
    const runsWithDuration = runs.filter((r) => r.duration_ms !== undefined && r.duration_ms > 0)
    const avgCycleTimeMs = runsWithDuration.length > 0
      ? runsWithDuration.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0) / runsWithDuration.length
      : null

    return {
      actions_today: actionsToday,
      errors_today: errorsToday,
      avg_cycle_time_ms: avgCycleTimeMs,
    }
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create or update loop state for a project
 */
export const upsertState = mutation({
  args: {
    project_id: v.string(),
    status: v.union(
      v.literal('running'),
      v.literal('paused'),
      v.literal('stopped'),
      v.literal('error')
    ),
    current_phase: v.optional(v.string()),
    current_cycle: v.number(),
    active_agents: v.number(),
    max_agents: v.number(),
    last_cycle_at: v.optional(v.number()),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<WorkLoopState> => {
    const now = Date.now()

    // Check if state already exists for this project
    const existing = await ctx.db
      .query('workLoopState')
      .withIndex('by_project', (q) => q.eq('project_id', args.project_id))
      .unique()

    if (existing) {
      // Update existing state
      await ctx.db.patch(existing._id, {
        status: args.status,
        current_phase: args.current_phase,
        current_cycle: args.current_cycle,
        active_agents: args.active_agents,
        max_agents: args.max_agents,
        last_cycle_at: args.last_cycle_at,
        error_message: args.error_message,
        updated_at: now,
      })

      const updated = await ctx.db.get(existing._id)
      if (!updated) {
        throw new Error('Failed to update work loop state')
      }

      return toWorkLoopState(updated as WorkLoopStateDoc)
    } else {
      // Create new state
      const id = generateId()
      const internalId = await ctx.db.insert('workLoopState', {
        id,
        project_id: args.project_id,
        status: args.status,
        current_phase: args.current_phase,
        current_cycle: args.current_cycle,
        active_agents: args.active_agents,
        max_agents: args.max_agents,
        last_cycle_at: args.last_cycle_at,
        error_message: args.error_message,
        updated_at: now,
      })

      const created = await ctx.db.get(internalId)
      if (!created) {
        throw new Error('Failed to create work loop state')
      }

      return toWorkLoopState(created as WorkLoopStateDoc)
    }
  },
})

/**
 * Insert a new run entry
 */
export const logRun = mutation({
  args: {
    project_id: v.string(),
    cycle: v.number(),
    phase: v.union(
      v.literal('cleanup'),
      v.literal('triage'),
      v.literal('review'),
      v.literal('work'),
      v.literal('idle'),
      v.literal('error')
    ),
    action: v.string(),
    task_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    details: v.optional(v.string()),
    duration_ms: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<WorkLoopRun> => {
    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('workLoopRuns', {
      id,
      project_id: args.project_id,
      cycle: args.cycle,
      phase: args.phase,
      action: args.action,
      task_id: args.task_id,
      session_key: args.session_key,
      details: args.details,
      duration_ms: args.duration_ms,
      created_at: now,
    })

    const created = await ctx.db.get(internalId)
    if (!created) {
      throw new Error('Failed to log work loop run')
    }

    return toWorkLoopRun(created as WorkLoopRunDoc)
  },
})

/**
 * Delete old runs (older than N days)
 */
export const clearRuns = mutation({
  args: {
    project_id: v.string(),
    older_than_days: v.number(),
  },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    const now = Date.now()
    const cutoff = now - (args.older_than_days * 24 * 60 * 60 * 1000)

    const runs = await ctx.db
      .query('workLoopRuns')
      .withIndex('by_project_created', (q) =>
        q.eq('project_id', args.project_id).lt('created_at', cutoff)
      )
      .collect()

    let deleted = 0
    for (const run of runs) {
      await ctx.db.delete(run._id)
      deleted++
    }

    return { deleted }
  },
})
