import { query } from './_generated/server'
import { v } from 'convex/values'

// ============================================
// Metrics Queries - Aggregated task analysis data
// ============================================

/**
 * Get all task analyses with optional filters for client-side aggregation.
 * Returns raw analyses so the UI can slice/dice as needed.
 */
export const getAnalyses = query({
  args: {
    role: v.optional(v.string()),
    model: v.optional(v.string()),
    since: v.optional(v.number()), // epoch ms
  },
  handler: async (ctx, args) => {
    let analyses

    if (args.role) {
      analyses = await ctx.db
        .query('taskAnalyses')
        .withIndex('by_role', (q) => q.eq('role', args.role!))
        .collect()
    } else {
      analyses = await ctx.db
        .query('taskAnalyses')
        .collect()
    }

    // Filter by model if specified
    if (args.model) {
      analyses = analyses.filter((a) => a.model === args.model)
    }

    // Filter by time range
    if (args.since) {
      analyses = analyses.filter((a) => a.analyzed_at >= args.since!)
    }

    return analyses.map((a) => ({
      id: a.id,
      task_id: a.task_id,
      role: a.role,
      model: a.model,
      prompt_version_id: a.prompt_version_id,
      outcome: a.outcome as string,
      token_count: a.token_count ?? null,
      duration_ms: a.duration_ms ?? null,
      failure_modes: a.failure_modes ? JSON.parse(a.failure_modes) : [],
      confidence: a.confidence,
      analyzed_at: a.analyzed_at,
    }))
  },
})

/**
 * Get all prompt versions (id, role, model, version, active, created_at)
 * for cross-referencing with analyses.
 */
export const getPromptVersionsSummary = query({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db
      .query('promptVersions')
      .collect()

    return versions.map((v) => ({
      id: v.id,
      role: v.role,
      model: v.model ?? 'default',
      version: v.version,
      active: v.active,
      created_at: v.created_at,
      change_summary: v.change_summary ?? null,
    }))
  },
})

/**
 * Get distinct roles and models from analyses for filter dropdowns.
 */
export const getFilterOptions = query({
  args: {},
  handler: async (ctx) => {
    const analyses = await ctx.db
      .query('taskAnalyses')
      .collect()

    const roles = new Set<string>()
    const models = new Set<string>()

    for (const a of analyses) {
      roles.add(a.role)
      models.add(a.model)
    }

    return {
      roles: Array.from(roles).sort(),
      models: Array.from(models).sort(),
    }
  },
})
