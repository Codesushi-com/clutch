import { query, mutation, action } from './_generated/server'
import { v } from 'convex/values'
import type { FunctionReference } from 'convex/server'
import type { TaskAnalysis } from './taskAnalyses'

// ============================================
// Types
// ============================================

export type PromptMetric = {
  id: string
  role: string
  model: string
  prompt_version_id: string
  period: 'day' | 'week' | 'all_time'
  period_start: number
  total_tasks: number
  success_count: number
  failure_count: number
  partial_count: number
  abandoned_count: number
  avg_tokens: number
  avg_duration_ms: number
  bounce_count: number
  failure_modes: Record<string, number> | null
  computed_at: number
}

export type MetricsSummary = {
  role: string
  model: string
  prompt_version_id: string
  version_number?: number
  periods: {
    day?: PromptMetric
    week?: PromptMetric
    all_time?: PromptMetric
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get metrics for a specific role+model combination
 */
export const getByRoleModel = query({
  args: {
    role: v.string(),
    model: v.string(),
    period: v.optional(v.union(v.literal('day'), v.literal('week'), v.literal('all_time'))),
  },
  handler: async (ctx, args): Promise<PromptMetric[]> => {
    const metrics = await ctx.db
      .query('promptMetrics')
      .withIndex('by_role_model', (q) => q.eq('role', args.role).eq('model', args.model))
      .collect()

    let filtered = metrics
    if (args.period) {
      filtered = metrics.filter((m) => m.period === args.period)
    }

    return filtered
      .sort((a, b) => b.computed_at - a.computed_at)
      .map((m) => toPromptMetric(m))
  },
})

/**
 * Get metrics for a specific prompt version
 */
export const getByPromptVersion = query({
  args: {
    prompt_version_id: v.string(),
    period: v.optional(v.union(v.literal('day'), v.literal('week'), v.literal('all_time'))),
  },
  handler: async (ctx, args): Promise<PromptMetric[]> => {
    const metrics = await ctx.db
      .query('promptMetrics')
      .withIndex('by_prompt_version', (q) => q.eq('prompt_version_id', args.prompt_version_id))
      .collect()

    let filtered = metrics
    if (args.period) {
      filtered = metrics.filter((m) => m.period === args.period)
    }

    return filtered
      .sort((a, b) => b.computed_at - a.computed_at)
      .map((m) => toPromptMetric(m))
  },
})

/**
 * Get latest metrics for all role+model combinations
 */
export const listLatest = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PromptMetric[]> => {
    const allMetrics = await ctx.db.query('promptMetrics').collect()

    // Group by role+model+version and keep only the most recent for each period type
    const latestByKey = new Map<string, typeof allMetrics[0]>()

    for (const metric of allMetrics) {
      const key = `${metric.role}:${metric.model}:${metric.prompt_version_id}:${metric.period}`
      const existing = latestByKey.get(key)
      if (!existing || metric.computed_at > existing.computed_at) {
        latestByKey.set(key, metric)
      }
    }

    const latest = Array.from(latestByKey.values())
      .sort((a, b) => b.computed_at - a.computed_at)

    const limited = args.limit ? latest.slice(0, args.limit) : latest

    return limited.map((m) => toPromptMetric(m))
  },
})

/**
 * Compare two prompt versions
 */
export const compareVersions = query({
  args: {
    version_a: v.string(),
    version_b: v.string(),
    period: v.optional(v.union(v.literal('day'), v.literal('week'), v.literal('all_time'))),
  },
  handler: async (ctx, args): Promise<{ version_a: PromptMetric[]; version_b: PromptMetric[] }> => {
    const period = args.period || 'all_time'

    const metricsA = await ctx.db
      .query('promptMetrics')
      .withIndex('by_prompt_version', (q) => q.eq('prompt_version_id', args.version_a))
      .filter((q) => q.eq(q.field('period'), period))
      .collect()

    const metricsB = await ctx.db
      .query('promptMetrics')
      .withIndex('by_prompt_version', (q) => q.eq('prompt_version_id', args.version_b))
      .filter((q) => q.eq(q.field('period'), period))
      .collect()

    return {
      version_a: metricsA.map((m) => toPromptMetric(m)),
      version_b: metricsB.map((m) => toPromptMetric(m)),
    }
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Upsert a metric record (internal use)
 */
export const upsert = mutation({
  args: {
    role: v.string(),
    model: v.string(),
    prompt_version_id: v.string(),
    period: v.union(v.literal('day'), v.literal('week'), v.literal('all_time')),
    period_start: v.number(),
    total_tasks: v.number(),
    success_count: v.number(),
    failure_count: v.number(),
    partial_count: v.number(),
    abandoned_count: v.number(),
    avg_tokens: v.number(),
    avg_duration_ms: v.number(),
    bounce_count: v.number(),
    failure_modes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PromptMetric> => {
    // Generate composite ID
    const id = `${args.role}:${args.model}:${args.prompt_version_id}:${args.period}:${args.period_start}`

    const now = Date.now()

    // Check if exists
    const existing = await ctx.db
      .query('promptMetrics')
      .withIndex('by_uuid', (q) => q.eq('id', id))
      .unique()

    if (existing) {
      // Update
      await ctx.db.patch(existing._id, {
        total_tasks: args.total_tasks,
        success_count: args.success_count,
        failure_count: args.failure_count,
        partial_count: args.partial_count,
        abandoned_count: args.abandoned_count,
        avg_tokens: args.avg_tokens,
        avg_duration_ms: args.avg_duration_ms,
        bounce_count: args.bounce_count,
        failure_modes: args.failure_modes,
        computed_at: now,
      })
    } else {
      // Insert
      await ctx.db.insert('promptMetrics', {
        id,
        role: args.role,
        model: args.model,
        prompt_version_id: args.prompt_version_id,
        period: args.period,
        period_start: args.period_start,
        total_tasks: args.total_tasks,
        success_count: args.success_count,
        failure_count: args.failure_count,
        partial_count: args.partial_count,
        abandoned_count: args.abandoned_count,
        avg_tokens: args.avg_tokens,
        avg_duration_ms: args.avg_duration_ms,
        bounce_count: args.bounce_count,
        failure_modes: args.failure_modes,
        computed_at: now,
      })
    }

    const result = await ctx.db
      .query('promptMetrics')
      .withIndex('by_uuid', (q) => q.eq('id', id))
      .unique()

    if (!result) {
      throw new Error('Failed to upsert prompt metric')
    }

    return toPromptMetric(result)
  },
})

// ============================================
// Actions
// ============================================

/**
 * Compute metrics from taskAnalyses data
 * Aggregates by role+model+prompt_version for day, week, and all_time periods
 */
export const compute = action({
  args: {
    since: v.optional(v.number()), // timestamp to compute from (defaults to last 30 days)
  },
  handler: async (ctx, args): Promise<{ computed: number; errors: string[] }> => {
    const errors: string[] = []
    const now = Date.now()
    const since = args.since || now - 30 * 24 * 60 * 60 * 1000 // 30 days ago

    try {
      // Fetch all task analyses in the time range
      const allAnalyses = await ctx.runQuery(api.taskAnalyses.listInRange, { since, until: now })

      // Group by role+model+prompt_version
      const grouped = new Map<string, TaskAnalysis[]>()

      for (const analysis of allAnalyses) {
        const key = `${analysis.role}:${analysis.model}:${analysis.prompt_version_id}`
        if (!grouped.has(key)) {
          grouped.set(key, [])
        }
        grouped.get(key)!.push(analysis)
      }

      let computed = 0

      // Compute metrics for each group
      for (const [key, analyses] of grouped) {
        try {
          const [role, model, promptVersionId] = key.split(':')

          if (!role || !model || !promptVersionId) {
            errors.push(`Invalid key format: ${key}`)
            continue
          }

          // Compute all-time metrics
          await computeAndStoreMetrics(ctx, role, model, promptVersionId, 'all_time', 0, analyses, now)
          computed++

          // Compute daily metrics (last 30 days)
          const dailyGroups = groupByDay(analyses)
          for (const [dayStart, dayAnalyses] of dailyGroups) {
            await computeAndStoreMetrics(ctx, role, model, promptVersionId, 'day', dayStart, dayAnalyses, now)
            computed++
          }

          // Compute weekly metrics (last 12 weeks)
          const weeklyGroups = groupByWeek(analyses)
          for (const [weekStart, weekAnalyses] of weeklyGroups) {
            await computeAndStoreMetrics(ctx, role, model, promptVersionId, 'week', weekStart, weekAnalyses, now)
            computed++
          }
        } catch (error) {
          errors.push(`Error computing metrics for ${key}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      return { computed, errors }
    } catch (error) {
      return {
        computed: 0,
        errors: [`Failed to compute metrics: ${error instanceof Error ? error.message : String(error)}`],
      }
    }
  },
})

// ============================================
// Helper Functions
// ============================================

/**
 * Compute and store metrics for a specific period
 */
async function computeAndStoreMetrics(
  ctx: { runMutation: (ref: FunctionReference<'mutation', 'public'>, args: Record<string, unknown>) => Promise<unknown> },
  role: string,
  model: string,
  promptVersionId: string,
  period: 'day' | 'week' | 'all_time',
  periodStart: number,
  analyses: TaskAnalysis[],
  _computedAt: number
): Promise<void> {
  if (analyses.length === 0) {
    return
  }

  // Count outcomes
  const successCount = analyses.filter((a) => a.outcome === 'success').length
  const failureCount = analyses.filter((a) => a.outcome === 'failure').length
  const partialCount = analyses.filter((a) => a.outcome === 'partial').length
  const abandonedCount = analyses.filter((a) => a.outcome === 'abandoned').length

  // Calculate averages (handle sparse data gracefully)
  const analysesWithTokens = analyses.filter((a) => a.token_count !== null && a.token_count !== undefined)
  const avgTokens =
    analysesWithTokens.length > 0
      ? analysesWithTokens.reduce((sum, a) => sum + (a.token_count || 0), 0) / analysesWithTokens.length
      : 0

  const analysesWithDuration = analyses.filter((a) => a.duration_ms !== null && a.duration_ms !== undefined)
  const avgDurationMs =
    analysesWithDuration.length > 0
      ? analysesWithDuration.reduce((sum, a) => sum + (a.duration_ms || 0), 0) / analysesWithDuration.length
      : 0

  // Aggregate failure modes
  const failureModeCounts: Record<string, number> = {}
  for (const analysis of analyses) {
    if (analysis.failure_modes) {
      for (const mode of analysis.failure_modes) {
        failureModeCounts[mode] = (failureModeCounts[mode] || 0) + 1
      }
    }
  }

  // Note: bounce_count would need task history data; for now we estimate from abandoned
  // In a more complete implementation, we'd query task status transitions
  const bounceCount = abandonedCount

  await ctx.runMutation(api.promptMetrics.upsert, {
    role,
    model,
    prompt_version_id: promptVersionId,
    period,
    period_start: periodStart,
    total_tasks: analyses.length,
    success_count: successCount,
    failure_count: failureCount,
    partial_count: partialCount,
    abandoned_count: abandonedCount,
    avg_tokens: Math.round(avgTokens),
    avg_duration_ms: Math.round(avgDurationMs),
    bounce_count: bounceCount,
    failure_modes: Object.keys(failureModeCounts).length > 0 ? JSON.stringify(failureModeCounts) : undefined,
  })
}

/**
 * Group analyses by day (timestamp of start of day)
 */
function groupByDay(analyses: TaskAnalysis[]): Map<number, TaskAnalysis[]> {
  const groups = new Map<number, TaskAnalysis[]>()

  for (const analysis of analyses) {
    const date = new Date(analysis.analyzed_at)
    date.setUTCHours(0, 0, 0, 0)
    const dayStart = date.getTime()

    if (!groups.has(dayStart)) {
      groups.set(dayStart, [])
    }
    groups.get(dayStart)!.push(analysis)
  }

  return groups
}

/**
 * Group analyses by week (timestamp of start of week, Sunday)
 */
function groupByWeek(analyses: TaskAnalysis[]): Map<number, TaskAnalysis[]> {
  const groups = new Map<number, TaskAnalysis[]>()

  for (const analysis of analyses) {
    const date = new Date(analysis.analyzed_at)
    const dayOfWeek = date.getUTCDay()
    date.setUTCDate(date.getUTCDate() - dayOfWeek)
    date.setUTCHours(0, 0, 0, 0)
    const weekStart = date.getTime()

    if (!groups.has(weekStart)) {
      groups.set(weekStart, [])
    }
    groups.get(weekStart)!.push(analysis)
  }

  return groups
}

/**
 * Convert Convex document to PromptMetric type
 */
function toPromptMetric(doc: {
  id: string
  role: string
  model: string
  prompt_version_id: string
  period: 'day' | 'week' | 'all_time'
  period_start: number
  total_tasks: number
  success_count: number
  failure_count: number
  partial_count: number
  abandoned_count: number
  avg_tokens: number
  avg_duration_ms: number
  bounce_count: number
  failure_modes?: string
  computed_at: number
}): PromptMetric {
  return {
    id: doc.id,
    role: doc.role,
    model: doc.model,
    prompt_version_id: doc.prompt_version_id,
    period: doc.period,
    period_start: doc.period_start,
    total_tasks: doc.total_tasks,
    success_count: doc.success_count,
    failure_count: doc.failure_count,
    partial_count: doc.partial_count,
    abandoned_count: doc.abandoned_count,
    avg_tokens: doc.avg_tokens,
    avg_duration_ms: doc.avg_duration_ms,
    bounce_count: doc.bounce_count,
    failure_modes: doc.failure_modes ? JSON.parse(doc.failure_modes) : null,
    computed_at: doc.computed_at,
  }
}

// Import api for action usage
import { api } from './_generated/api'
