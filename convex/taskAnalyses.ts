import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

// ============================================
// Types
// ============================================

export type TaskAnalysis = {
  id: string
  task_id: string
  session_key: string | null
  role: string
  model: string
  prompt_version_id: string
  outcome: 'success' | 'failure' | 'partial' | 'abandoned'
  token_count: number | null
  duration_ms: number | null
  failure_modes: string[] | null
  amendments: string[] | null
  analysis_summary: string
  confidence: number
  analyzed_at: number
}

// ============================================
// Queries
// ============================================

/**
 * Get an analysis by its UUID
 */
export const getById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args): Promise<TaskAnalysis | null> => {
    const analysis = await ctx.db
      .query('taskAnalyses')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!analysis) {
      return null
    }

    return toTaskAnalysis(analysis)
  },
})

/**
 * Get analysis for a specific task
 */
export const getByTask = query({
  args: {
    task_id: v.string(),
  },
  handler: async (ctx, args): Promise<TaskAnalysis | null> => {
    const analysis = await ctx.db
      .query('taskAnalyses')
      .withIndex('by_task', (q) => q.eq('task_id', args.task_id))
      .unique()

    if (!analysis) {
      return null
    }

    return toTaskAnalysis(analysis)
  },
})

/**
 * List analyses filtered by role, with optional pagination
 */
export const listByRole = query({
  args: {
    role: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskAnalysis[]> => {
    let query = ctx.db
      .query('taskAnalyses')
      .withIndex('by_role', (q) => q.eq('role', args.role))

    if (args.limit) {
      query = query.take(args.limit) as unknown as typeof query
    }

    const analyses = await query.collect()

    return analyses
      .sort((a, b) => b.analyzed_at - a.analyzed_at)
      .map((a) => toTaskAnalysis(a))
  },
})

/**
 * List analyses with pending amendments (non-null amendments)
 */
export const listPendingAmendments = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskAnalysis[]> => {
    const allAnalyses = await ctx.db.query('taskAnalyses').collect()

    const withAmendments = allAnalyses.filter((a) => a.amendments !== null && a.amendments !== undefined)

    const sorted = withAmendments.sort((a, b) => b.analyzed_at - a.analyzed_at)

    const limited = args.limit ? sorted.slice(0, args.limit) : sorted

    return limited.map((a) => toTaskAnalysis(a))
  },
})

/**
 * List all analyses that used a given prompt version
 */
export const listByPromptVersion = query({
  args: {
    prompt_version_id: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskAnalysis[]> => {
    let query = ctx.db
      .query('taskAnalyses')
      .withIndex('by_prompt_version', (q) => q.eq('prompt_version_id', args.prompt_version_id))

    if (args.limit) {
      query = query.take(args.limit) as unknown as typeof query
    }

    const analyses = await query.collect()

    return analyses
      .sort((a, b) => b.analyzed_at - a.analyzed_at)
      .map((a) => toTaskAnalysis(a))
  },
})

/**
 * List analyses by outcome
 */
export const listByOutcome = query({
  args: {
    outcome: v.union(
      v.literal('success'),
      v.literal('failure'),
      v.literal('partial'),
      v.literal('abandoned')
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TaskAnalysis[]> => {
    let query = ctx.db
      .query('taskAnalyses')
      .withIndex('by_outcome', (q) => q.eq('outcome', args.outcome))

    if (args.limit) {
      query = query.take(args.limit) as unknown as typeof query
    }

    const analyses = await query.collect()

    return analyses
      .sort((a, b) => b.analyzed_at - a.analyzed_at)
      .map((a) => toTaskAnalysis(a))
  },
})

/**
 * List analyses within a time range (for metrics computation)
 */
export const listInRange = query({
  args: {
    since: v.number(),
    until: v.number(),
  },
  handler: async (ctx, args): Promise<TaskAnalysis[]> => {
    const analyses = await ctx.db
      .query('taskAnalyses')
      .withIndex('by_analyzed', (q) => q.gte('analyzed_at', args.since).lte('analyzed_at', args.until))
      .collect()

    return analyses.map((a) => toTaskAnalysis(a))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new task analysis
 */
export const create = mutation({
  args: {
    task_id: v.string(),
    session_key: v.optional(v.string()),
    role: v.string(),
    model: v.string(),
    prompt_version_id: v.string(),
    outcome: v.union(
      v.literal('success'),
      v.literal('failure'),
      v.literal('partial'),
      v.literal('abandoned')
    ),
    token_count: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    failure_modes: v.optional(v.string()), // JSON array string
    amendments: v.optional(v.string()), // JSON array string
    analysis_summary: v.string(),
    confidence: v.number(),
  },
  handler: async (ctx, args): Promise<TaskAnalysis> => {
    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('taskAnalyses', {
      id,
      task_id: args.task_id,
      session_key: args.session_key,
      role: args.role,
      model: args.model,
      prompt_version_id: args.prompt_version_id,
      outcome: args.outcome,
      token_count: args.token_count,
      duration_ms: args.duration_ms,
      failure_modes: args.failure_modes,
      amendments: args.amendments,
      analysis_summary: args.analysis_summary,
      confidence: args.confidence,
      analyzed_at: now,
    })

    const created = await ctx.db.get(internalId)
    if (!created) {
      throw new Error('Failed to create task analysis')
    }

    return toTaskAnalysis(created)
  },
})

// ============================================
// Helper Functions
// ============================================

/**
 * Convert Convex document to TaskAnalysis type
 */
function toTaskAnalysis(doc: {
  id: string
  task_id: string
  session_key?: string
  role: string
  model: string
  prompt_version_id: string
  outcome: 'success' | 'failure' | 'partial' | 'abandoned'
  token_count?: number
  duration_ms?: number
  failure_modes?: string
  amendments?: string
  analysis_summary: string
  confidence: number
  analyzed_at: number
}): TaskAnalysis {
  return {
    id: doc.id,
    task_id: doc.task_id,
    session_key: doc.session_key ?? null,
    role: doc.role,
    model: doc.model,
    prompt_version_id: doc.prompt_version_id,
    outcome: doc.outcome,
    token_count: doc.token_count ?? null,
    duration_ms: doc.duration_ms ?? null,
    failure_modes: doc.failure_modes ? JSON.parse(doc.failure_modes) : null,
    amendments: doc.amendments ? JSON.parse(doc.amendments) : null,
    analysis_summary: doc.analysis_summary,
    confidence: doc.confidence,
    analyzed_at: doc.analyzed_at,
  }
}
