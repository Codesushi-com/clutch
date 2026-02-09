import { query } from './_generated/server'
import { v } from 'convex/values'
import type { StatusChangedData } from './task_events'

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

/**
 * Calculate cost from tokens (approximate)
 * Using rough pricing: $0.03 per 1K tokens (blended rate)
 */
function calculateCost(tokensIn: number, tokensOut: number): number {
  const INPUT_RATE = 0.00001  // $0.01 per 1K input tokens
  const OUTPUT_RATE = 0.00003 // $0.03 per 1K output tokens
  return (tokensIn * INPUT_RATE) + (tokensOut * OUTPUT_RATE)
}

// ============================================
// Queries
// ============================================

/**
 * Get cost summary analytics
 * Returns total cost, average cost per task, and breakdowns by role and project
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

    // Filter to tasks that have cost data (completed tasks with accumulated cost)
    const tasksWithCost = filteredTasks.filter(
      (t) => (t as { cost_total?: number }).cost_total !== undefined && (t as { cost_total?: number }).cost_total! > 0
    )

    // Calculate totals
    let totalCost = 0
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

    for (const task of tasksWithCost) {
      const cost = (task as { cost_total?: number }).cost_total ?? 0

      totalCost += cost

      // By role
      const role = task.role as TaskRole | undefined
      if (role && byRole[role]) {
        byRole[role].count++
        byRole[role].cost += cost
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
      byProject[task.project_id].cost += cost
    }

    const totalTasks = tasksWithCost.length
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

      // Add cost if available
      const taskCost = (task as { cost_total?: number }).cost_total
      if (taskCost !== undefined && taskCost > 0) {
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
