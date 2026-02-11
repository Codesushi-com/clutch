import { query } from './_generated/server'
import { v } from 'convex/values'
import type { StatusChangedData } from './task_events'
import type { Doc } from './_generated/dataModel'

// ============================================
// Types
// ============================================

type TimeRange = '24h' | '7d' | '30d' | 'all'
type TaskRole = 'pm' | 'dev' | 'research' | 'reviewer'

export interface CostSummary {
  totalCost: number
  averageCostPerTask: number
  totalTasks: number
  byRole: Record<TaskRole, { count: number; cost: number }>
  byProject: Record<string, { name: string; count: number; cost: number }>
}

export interface CycleTimeStats {
  average: number
  median: number
  p90: number
}

export interface PhaseCycleTimes {
  ready: CycleTimeStats
  in_progress: CycleTimeStats
  in_review: CycleTimeStats
}

export interface CycleTimesResult {
  total: CycleTimeStats
  phases: PhaseCycleTimes
}

export interface SuccessRateResult {
  total: number
  success: { count: number; percentage: number }
  struggled: { count: number; percentage: number }
  failed: { count: number; percentage: number }
}

export interface ThroughputDataPoint {
  date: string // ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:00:00)
  count: number
  cost: number
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert time range to timestamp cutoff (milliseconds since epoch)
 */
function timeRangeFilter(timeRange: TimeRange): number | null {
  if (timeRange === 'all') {
    return null
  }

  const now = Date.now()
  const ranges: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }

  return now - ranges[timeRange]
}

/**
 * Calculate percentiles from an array of numbers
 */
function calculatePercentiles(values: number[]): { average: number; median: number; p90: number } {
  if (values.length === 0) {
    return { average: 0, median: 0, p90: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const average = sum / sorted.length

  const medianIndex = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
    : sorted[medianIndex]

  const p90Index = Math.floor(sorted.length * 0.9)
  const p90 = sorted[Math.min(p90Index, sorted.length - 1)]

  return { average, median, p90 }
}

// ============================================
// Queries
// ============================================

/**
 * Get cost summary analytics
 * Returns total cost, average cost per task, and breakdowns by role and project
 * Aggregates cost from sessions linked to tasks (sessions.task_id)
 */
export const costSummary = query({
  args: {
    projectId: v.optional(v.string()),
    timeRange: v.optional(v.union(
      v.literal('24h'),
      v.literal('7d'),
      v.literal('30d'),
      v.literal('all')
    )),
  },
  handler: async (ctx, args): Promise<CostSummary> => {
    const cutoff = timeRangeFilter(args.timeRange ?? 'all')
    const tasks = []

    // Fetch tasks based on project filter and time range
    if (args.projectId) {
      const projectTasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('project_id', args.projectId!))
        .collect()
      tasks.push(...projectTasks)
    } else {
      // Get all tasks - this is a full table scan but necessary for cross-project analytics
      // In production with large datasets, consider pagination or materialized views
      const allTasks = await ctx.db.query('tasks').collect()
      tasks.push(...allTasks)
    }

    // Filter by time range on created_at
    const filteredTasks = cutoff
      ? tasks.filter((t) => t.created_at >= cutoff)
      : tasks

    // Calculate totals - aggregate cost from sessions linked to tasks
    let totalCost = 0
    const taskCosts = new Map<string, number>() // task_id -> cost
    const byRole: Record<string, { count: number; cost: number }> = {
      pm: { count: 0, cost: 0 },
      dev: { count: 0, cost: 0 },
      research: { count: 0, cost: 0 },
      reviewer: { count: 0, cost: 0 },
    }
    const byProject: Record<string, { name: string; count: number; cost: number }> = {}

    // Load project names if showing all projects
    const projectNames: Record<string, string> = {}
    if (!args.projectId) {
      const projects = await ctx.db.query('projects').collect()
      for (const p of projects) {
        projectNames[p.id] = p.name
      }
    }

    // Aggregate cost from sessions for each task
    for (const task of filteredTasks) {
      // Get all sessions linked to this task
      const sessions = await ctx.db
        .query('sessions')
        .withIndex('by_task', (q) => q.eq('task_id', task.id))
        .collect()

      // Sum up cost from all sessions for this task
      let taskCost = 0
      for (const session of sessions) {
        taskCost += session.cost_total ?? 0
      }

      // Also check if task has session_id and get that session's cost
      if (task.session_id) {
        const sessionByKey = await ctx.db
          .query('sessions')
          .withIndex('by_session_key', (q) => q.eq('session_key', task.session_id!))
          .unique()
        if (sessionByKey && sessionByKey.cost_total) {
          // Avoid double counting if already counted via task_id
          const alreadyCounted = sessions.some(s => s._id === sessionByKey._id)
          if (!alreadyCounted) {
            taskCost += sessionByKey.cost_total
          }
        }
      }

      // Only include tasks that have some cost data
      if (taskCost > 0) {
        taskCosts.set(task.id, taskCost)
        totalCost += taskCost

        // By role
        const role = task.role as TaskRole | undefined
        if (role && byRole[role]) {
          byRole[role].count++
          byRole[role].cost += taskCost
        }

        // By project
        if (!byProject[task.project_id]) {
          byProject[task.project_id] = {
            name: projectNames[task.project_id] ?? task.project_id,
            count: 0,
            cost: 0,
          }
        }
        byProject[task.project_id].count++
        byProject[task.project_id].cost += taskCost
      }
    }

    const totalTasks = taskCosts.size
    const averageCostPerTask = totalTasks > 0 ? totalCost / totalTasks : 0

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      averageCostPerTask: Math.round(averageCostPerTask * 100) / 100,
      totalTasks,
      byRole: byRole as Record<TaskRole, { count: number; cost: number }>,
      byProject,
    }
  },
})

/**
 * Get cycle time analytics
 * Returns total cycle time (created_at → completed_at) and phase-level times
 */
export const cycleTimes = query({
  args: {
    projectId: v.optional(v.string()),
    timeRange: v.optional(v.union(
      v.literal('24h'),
      v.literal('7d'),
      v.literal('30d'),
      v.literal('all')
    )),
  },
  handler: async (ctx, args): Promise<CycleTimesResult> => {
    const cutoff = timeRangeFilter(args.timeRange ?? 'all')

    // Get done tasks with optional project filter
    let tasks
    if (args.projectId) {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) =>
          q.eq('project_id', args.projectId!).eq('status', 'done')
        )
        .collect()
    } else {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_status', (q) => q.eq('status', 'done'))
        .collect()
    }

    // Filter by time range on completed_at
    const doneTasks = cutoff
      ? tasks.filter((t) => t.completed_at && t.completed_at >= cutoff)
      : tasks.filter((t) => t.completed_at !== undefined)

    // Calculate total cycle times
    const totalCycles: number[] = []
    for (const task of doneTasks) {
      if (task.completed_at && task.created_at) {
        totalCycles.push(task.completed_at - task.created_at)
      }
    }

    // Calculate phase times from task_events
    const phaseTimes: Record<string, number[]> = {
      ready: [],
      in_progress: [],
      in_review: [],
    }

    for (const task of doneTasks) {
      // Get status change events for this task
      const events = await ctx.db
        .query('task_events')
        .withIndex('by_task_timestamp', (q) => q.eq('task_id', task.id))
        .collect()

      // Filter to status_changed events
      const statusEvents = events
        .filter((e) => e.event_type === 'status_changed')
        .sort((a, b) => a.timestamp - b.timestamp)

      // Track phase durations
      let lastStatus: string | null = null
      let lastTimestamp: number | null = null

      for (const event of statusEvents) {
        const data = event.data ? JSON.parse(event.data) as StatusChangedData : null
        if (!data) continue

        const toStatus = data.to_status

        // If we have a previous status, calculate time spent in that status
        if (lastStatus && lastTimestamp) {
          const duration = event.timestamp - lastTimestamp
          if (phaseTimes[lastStatus]) {
            phaseTimes[lastStatus].push(duration)
          }
        }

        lastStatus = toStatus
        lastTimestamp = event.timestamp
      }

      // Handle time from last status change to completion
      if (lastStatus && lastTimestamp && task.completed_at) {
        const duration = task.completed_at - lastTimestamp
        if (phaseTimes[lastStatus]) {
          phaseTimes[lastStatus].push(duration)
        }
      }
    }

    const totalStats = calculatePercentiles(totalCycles)

    return {
      total: totalStats,
      phases: {
        ready: calculatePercentiles(phaseTimes.ready),
        in_progress: calculatePercentiles(phaseTimes.in_progress),
        in_review: calculatePercentiles(phaseTimes.in_review),
      },
    }
  },
})

/**
 * Get success rate analytics
 * Tasks completed without blocking: success
 * Tasks that hit blocked at least once: struggled
 * Tasks killed via triage: failed
 */
export const successRate = query({
  args: {
    projectId: v.optional(v.string()),
    timeRange: v.optional(v.union(
      v.literal('24h'),
      v.literal('7d'),
      v.literal('30d'),
      v.literal('all')
    )),
  },
  handler: async (ctx, args): Promise<SuccessRateResult> => {
    const cutoff = timeRangeFilter(args.timeRange ?? 'all')

    // Get tasks with optional project filter
    let tasks
    if (args.projectId) {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('project_id', args.projectId!))
        .collect()
    } else {
      tasks = await ctx.db.query('tasks').collect()
    }

    // Filter by time range on created_at
    const filteredTasks = cutoff
      ? tasks.filter((t) => t.created_at >= cutoff)
      : tasks

    let successCount = 0
    let struggledCount = 0
    let failedCount = 0

    for (const task of filteredTasks) {
      // Get status change events for this task
      const events = await ctx.db
        .query('task_events')
        .withIndex('by_task_timestamp', (q) => q.eq('task_id', task.id))
        .collect()

      const statusEvents = events.filter((e) => e.event_type === 'status_changed')

      // Check if task ever hit blocked status
      const hitBlocked = statusEvents.some((e) => {
        const data = e.data ? JSON.parse(e.data) as StatusChangedData : null
        return data?.to_status === 'blocked'
      })

      // Check if task was killed via triage (has triage_sent_at and ended up in backlog)
      const wasKilled = task.triage_sent_at !== undefined && task.status === 'backlog'

      if (wasKilled) {
        failedCount++
      } else if (hitBlocked) {
        struggledCount++
      } else if (task.status === 'done') {
        successCount++
      }
    }

    const total = successCount + struggledCount + failedCount

    return {
      total,
      success: {
        count: successCount,
        percentage: total > 0 ? Math.round((successCount / total) * 1000) / 10 : 0,
      },
      struggled: {
        count: struggledCount,
        percentage: total > 0 ? Math.round((struggledCount / total) * 1000) / 10 : 0,
      },
      failed: {
        count: failedCount,
        percentage: total > 0 ? Math.round((failedCount / total) * 1000) / 10 : 0,
      },
    }
  },
})

/**
 * Get throughput analytics
 * Returns tasks completed per day/week with cost data for charting
 * Aggregates cost from sessions linked to tasks
 */
export const throughput = query({
  args: {
    projectId: v.optional(v.string()),
    timeRange: v.optional(v.union(
      v.literal('24h'),
      v.literal('7d'),
      v.literal('30d'),
      v.literal('all')
    )),
  },
  handler: async (ctx, args): Promise<ThroughputDataPoint[]> => {
    const timeRange = args.timeRange ?? 'all'
    const cutoff = timeRangeFilter(timeRange)

    // Get done tasks with optional project filter
    let tasks
    if (args.projectId) {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) =>
          q.eq('project_id', args.projectId!).eq('status', 'done')
        )
        .collect()
    } else {
      tasks = await ctx.db
        .query('tasks')
        .withIndex('by_status', (q) => q.eq('status', 'done'))
        .collect()
    }

    // Filter by time range on completed_at
    const doneTasks = cutoff
      ? tasks.filter((t) => t.completed_at && t.completed_at >= cutoff)
      : tasks.filter((t) => t.completed_at !== undefined)

    // Group by date bucket
    const isHourly = timeRange === '24h'
    const buckets: Record<string, { count: number; cost: number }> = {}

    for (const task of doneTasks) {
      if (!task.completed_at) continue

      // Create bucket key based on granularity
      const date = new Date(task.completed_at)
      let bucketKey: string

      if (isHourly) {
        // Hourly buckets for 24h view: YYYY-MM-DDTHH:00:00
        bucketKey = date.toISOString().slice(0, 13) + ':00:00'
      } else {
        // Daily buckets for 7d/30d/all: YYYY-MM-DD
        bucketKey = date.toISOString().slice(0, 10)
      }

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { count: 0, cost: 0 }
      }

      buckets[bucketKey].count++

      // Aggregate cost from sessions linked to this task
      let taskCost = 0

      // Get all sessions linked to this task via task_id
      const sessions = await ctx.db
        .query('sessions')
        .withIndex('by_task', (q) => q.eq('task_id', task.id))
        .collect()

      for (const session of sessions) {
        taskCost += session.cost_total ?? 0
      }

      // Also check if task has session_id and get that session's cost
      if (task.session_id) {
        const sessionByKey = await ctx.db
          .query('sessions')
          .withIndex('by_session_key', (q) => q.eq('session_key', task.session_id!))
          .unique()
        if (sessionByKey && sessionByKey.cost_total) {
          // Avoid double counting if already counted via task_id
          const alreadyCounted = sessions.some(s => s._id === sessionByKey._id)
          if (!alreadyCounted) {
            taskCost += sessionByKey.cost_total
          }
        }
      }

      if (taskCost > 0) {
        buckets[bucketKey].cost += taskCost
      }
    }

    // Convert to array and sort by date
    const result: ThroughputDataPoint[] = Object.entries(buckets)
      .map(([date, data]) => ({
        date,
        count: data.count,
        cost: Math.round(data.cost * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return result
  },
})

/**
 * Get session usage analytics for dashboard
 * Returns token counts and cost for the specified time range with hourly breakdown
 */
export const sessionUsage = query({
  args: {
    projectId: v.optional(v.string()),
    timeRange: v.optional(v.union(
      v.literal('24h'),
      v.literal('7d'),
      v.literal('30d'),
      v.literal('all')
    )),
  },
  handler: async (ctx, args): Promise<{
    totalCost: number
    previousCost: number
    totalTokens: number
    tokensInput: number
    tokensOutput: number
    hourlyData: Array<{ hour: string; cost: number; tokens: number }>
  }> => {
    const timeRange = args.timeRange ?? '24h'
    const cutoff = timeRangeFilter(timeRange)
    const now = Date.now()

    // Calculate previous period for trend comparison
    const periodMs = timeRange === '24h' ? 24 * 60 * 60 * 1000 :
                     timeRange === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                     timeRange === '30d' ? 30 * 24 * 60 * 60 * 1000 : null
    const previousCutoff = periodMs && cutoff ? cutoff - periodMs : null

    // Get sessions with optional project filter
    let sessions: Doc<'sessions'>[]
    if (args.projectId) {
      // Need to get project slug for filtering
      const project = await ctx.db
        .query('projects')
        .withIndex('by_uuid', (q) => q.eq('id', args.projectId!))
        .unique()
      const projectSlug = project?.slug

      if (projectSlug) {
        sessions = await ctx.db
          .query('sessions')
          .withIndex('by_project', (q) => q.eq('project_slug', projectSlug))
          .collect()
      } else {
        sessions = []
      }
    } else {
      sessions = await ctx.db.query('sessions').collect()
    }

    // Filter sessions by time range on updated_at (when cost was last updated)
    const currentPeriodSessions = cutoff
      ? sessions.filter((s) => s.updated_at >= cutoff)
      : sessions

    const previousPeriodSessions = previousCutoff && cutoff
      ? sessions.filter((s) => s.updated_at >= previousCutoff && s.updated_at < cutoff)
      : []

    // Calculate totals for current period
    let totalCost = 0
    let totalTokens = 0
    let tokensInput = 0
    let tokensOutput = 0

    // Hourly buckets for sparkline (only for 24h view)
    const hourlyBuckets: Record<string, { cost: number; tokens: number }> = {}

    for (const session of currentPeriodSessions) {
      const cost = session.cost_total ?? 0
      const tokens = session.tokens_total ?? 0
      const inTokens = session.tokens_input ?? 0
      const outTokens = session.tokens_output ?? 0

      totalCost += cost
      totalTokens += tokens
      tokensInput += inTokens
      tokensOutput += outTokens

      // Add to hourly bucket for sparkline
      if (timeRange === '24h' && session.updated_at) {
        const hour = new Date(session.updated_at).toISOString().slice(0, 13) + ':00:00'
        if (!hourlyBuckets[hour]) {
          hourlyBuckets[hour] = { cost: 0, tokens: 0 }
        }
        hourlyBuckets[hour].cost += cost
        hourlyBuckets[hour].tokens += tokens
      }
    }

    // Calculate previous period cost for trend
    let previousCost = 0
    for (const session of previousPeriodSessions) {
      previousCost += session.cost_total ?? 0
    }

    // Convert hourly buckets to sorted array
    const hourlyData = Object.entries(hourlyBuckets)
      .map(([hour, data]) => ({
        hour,
        cost: Math.round(data.cost * 100) / 100,
        tokens: data.tokens,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour))

    // Fill in missing hours with zeros for complete 24h view
    if (timeRange === '24h') {
      const filledData: typeof hourlyData = []
      for (let i = 0; i < 24; i++) {
        const hourDate = new Date(now - (23 - i) * 60 * 60 * 1000)
        const hourKey = hourDate.toISOString().slice(0, 13) + ':00:00'
        const existing = hourlyData.find(d => d.hour === hourKey)
        filledData.push(existing || { hour: hourKey, cost: 0, tokens: 0 })
      }
      return {
        totalCost: Math.round(totalCost * 100) / 100,
        previousCost: Math.round(previousCost * 100) / 100,
        totalTokens,
        tokensInput,
        tokensOutput,
        hourlyData: filledData,
      }
    }

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      previousCost: Math.round(previousCost * 100) / 100,
      totalTokens,
      tokensInput,
      tokensOutput,
      hourlyData,
    }
  },
})

/**
 * Helper query to get the time range filter timestamp
 * Useful for debugging and client-side filtering
 */
export const getTimeRangeCutoff = query({
  args: {
    timeRange: v.union(
      v.literal('24h'),
      v.literal('7d'),
      v.literal('30d'),
      v.literal('all')
    ),
  },
  handler: async (_ctx, args): Promise<{ cutoff: number | null; iso: string | null }> => {
    const cutoff = timeRangeFilter(args.timeRange)
    return {
      cutoff,
      iso: cutoff ? new Date(cutoff).toISOString() : null,
    }
  },
})
