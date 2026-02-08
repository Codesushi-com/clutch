import { query } from './_generated/server'
import { v } from 'convex/values'
import { getModelShortName } from '../lib/model-names'

// ============================================
// Types
// ============================================

export interface ModelRoleMetrics {
  count: number
  avgCost: number
  avgCycleTimeMs: number
  successRate: number
}

export interface ModelComparisonRecord {
  model: string
  modelShort: string
  tasksCompleted: number
  avgCostPerTask: number
  avgCycleTimeMs: number
  successRate: number
  avgTokensIn: number
  avgTokensOut: number
  byRole: Record<string, ModelRoleMetrics>
}

export interface ModelComparisonResult {
  models: ModelComparisonRecord[]
  totalTasks: number
  dateRange: {
    start: number
    end: number
  }
}

export interface ModelUsageStats {
  totalTasks: number
  tasksWithModel: number
  tasksWithoutModel: number
  modelDistribution: Record<string, number>
}

// ============================================
// Internal helper - shared aggregation logic
// ============================================

interface AggregationContext {
  db: {
    query: (table: 'task_events') => {
      withIndex: (
        indexName: string,
        fn: (q: { eq: (field: string, value: string) => unknown }) => unknown
      ) => {
        collect: () => Promise<TaskEventDoc[]>
      }
    }
  }
}

interface TaskEventDoc {
  event_type: string
  data?: string
  cost_total?: number
}

interface TaskDoc {
  id: string
  agent_model?: string | null
  role?: 'pm' | 'dev' | 'research' | 'reviewer' | null
  completed_at?: number | null
  agent_tokens_in?: number | null
  agent_tokens_out?: number | null
}

async function fetchTaskEvents(
  ctx: AggregationContext,
  taskIds: string[]
): Promise<Map<string, Array<{ costTotal: number; durationMs: number }>>> {
  const taskEventsMap = new Map<string, Array<{ costTotal: number; durationMs: number }>>()

  for (const taskId of taskIds) {
    const events = await ctx.db
      .query('task_events')
      .withIndex('by_task', (q) => q.eq('task_id', taskId))
      .collect()

    const agentCompletedEvents: Array<{ costTotal: number; durationMs: number }> = []
    for (const e of events) {
      if (e.event_type === 'agent_completed') {
        let durationMs = 0
        if (e.data) {
          try {
            const parsed = JSON.parse(e.data) as { duration_ms?: number }
            durationMs = parsed.duration_ms ?? 0
          } catch {
            // Ignore parse errors
          }
        }
        agentCompletedEvents.push({
          costTotal: e.cost_total ?? 0,
          durationMs,
        })
      }
    }

    if (agentCompletedEvents.length > 0) {
      taskEventsMap.set(taskId, agentCompletedEvents)
    }
  }

  return taskEventsMap
}

async function aggregateModelData(
  tasksWithModel: TaskDoc[],
  taskEventsMap: Map<string, Array<{ costTotal: number; durationMs: number }>>
): Promise<ModelComparisonRecord[]> {
  // Group tasks by model using an object instead of Map for compatibility
  const tasksByModel: Record<string, TaskDoc[]> = {}
  for (const task of tasksWithModel) {
    const model = task.agent_model!
    if (!tasksByModel[model]) {
      tasksByModel[model] = []
    }
    tasksByModel[model].push(task)
  }

  const models: ModelComparisonRecord[] = []
  const modelKeys = Object.keys(tasksByModel)

  for (const model of modelKeys) {
    const tasks = tasksByModel[model]
    if (!tasks) continue

    // Calculate task-level metrics
    let totalCost = 0
    let totalCycleTime = 0
    let totalTokensIn = 0
    let totalTokensOut = 0
    let tasksWithCost = 0
    let tasksWithCycleTime = 0
    let tasksWithTokens = 0

    // Group by role for sub-metrics using an object
    const roleMetrics: Record<string, {
      costs: number[]
      cycleTimes: number[]
      successCount: number
      totalCount: number
    }> = {}

    for (const task of tasks) {
      // Get cost from task events
      const events = taskEventsMap.get(task.id)
      if (events && events.length > 0) {
        let taskCost = 0
        let taskDuration = 0
        for (const e of events) {
          taskCost += e.costTotal
          taskDuration += e.durationMs
        }
        totalCost += taskCost
        tasksWithCost++

        if (taskDuration > 0) {
          totalCycleTime += taskDuration
          tasksWithCycleTime++
        }
      }

      // Get tokens from task record
      if (task.agent_tokens_in) {
        totalTokensIn += task.agent_tokens_in
        tasksWithTokens++
      }
      if (task.agent_tokens_out) {
        totalTokensOut += task.agent_tokens_out
        if (tasksWithTokens === 0) tasksWithTokens = 1
      }

      // Group by role
      const role = task.role || 'unknown'
      if (!roleMetrics[role]) {
        roleMetrics[role] = { costs: [], cycleTimes: [], successCount: 0, totalCount: 0 }
      }
      const roleData = roleMetrics[role]
      roleData.totalCount++
      roleData.successCount++

      // Add cost to role
      if (events && events.length > 0) {
        let taskCost = 0
        let taskDuration = 0
        for (const e of events) {
          taskCost += e.costTotal
          taskDuration += e.durationMs
        }
        roleData.costs.push(taskCost)
        if (taskDuration > 0) {
          roleData.cycleTimes.push(taskDuration)
        }
      }
    }

    // Calculate averages
    const avgCostPerTask = tasksWithCost > 0 ? totalCost / tasksWithCost : 0
    const avgCycleTimeMs = tasksWithCycleTime > 0 ? totalCycleTime / tasksWithCycleTime : 0
    const avgTokensIn = tasksWithTokens > 0 ? totalTokensIn / tasksWithTokens : 0
    const avgTokensOut = tasksWithTokens > 0 ? totalTokensOut / tasksWithTokens : 0

    // Build role breakdown
    const byRole: Record<string, ModelRoleMetrics> = {}
    const roleKeys = Object.keys(roleMetrics)
    for (const role of roleKeys) {
      const data = roleMetrics[role]
      if (!data) continue

      let avgRoleCost = 0
      if (data.costs.length > 0) {
        let sum = 0
        for (const c of data.costs) sum += c
        avgRoleCost = sum / data.costs.length
      }

      let avgRoleCycleTime = 0
      if (data.cycleTimes.length > 0) {
        let sum = 0
        for (const c of data.cycleTimes) sum += c
        avgRoleCycleTime = sum / data.cycleTimes.length
      }

      byRole[role] = {
        count: data.totalCount,
        avgCost: avgRoleCost,
        avgCycleTimeMs: avgRoleCycleTime,
        successRate: data.totalCount > 0 ? data.successCount / data.totalCount : 0,
      }
    }

    models.push({
      model,
      modelShort: getModelShortName(model),
      tasksCompleted: tasks.length,
      avgCostPerTask,
      avgCycleTimeMs,
      successRate: 1, // All completed tasks are successes
      avgTokensIn,
      avgTokensOut,
      byRole,
    })
  }

  // Sort by task count descending (most used first)
  models.sort((a, b) => b.tasksCompleted - a.tasksCompleted)

  return models
}

// ============================================
// Queries
// ============================================

/**
 * Compare model performance across completed tasks
 * Aggregates metrics by model with role breakdowns
 */
export const modelComparison = query({
  args: {
    projectId: v.optional(v.string()),
    startDate: v.optional(v.number()), // timestamp in ms
    endDate: v.optional(v.number()), // timestamp in ms
  },
  handler: async (ctx, args): Promise<ModelComparisonResult> => {
    const now = Date.now()
    const endDate = args.endDate || now
    // Default to last 30 days if no start date
    const startDate = args.startDate || endDate - 30 * 24 * 60 * 60 * 1000

    // Build task query
    let tasksQuery = ctx.db
      .query('tasks')
      .withIndex('by_status', (q) => q.eq('status', 'done'))

    // Filter by project if specified
    const projectId = args.projectId
    if (projectId) {
      tasksQuery = ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) =>
          q.eq('project_id', projectId).eq('status', 'done')
        )
    }

    const completedTasks = await tasksQuery.collect()

    // Filter by completion date
    const filteredTasks: TaskDoc[] = []
    for (const task of completedTasks) {
      const completedAt = task.completed_at
      if (completedAt && completedAt >= startDate && completedAt <= endDate) {
        filteredTasks.push(task)
      }
    }

    // Only include tasks that have a model assigned
    const tasksWithModel: TaskDoc[] = []
    for (const task of filteredTasks) {
      if (task.agent_model) {
        tasksWithModel.push(task)
      }
    }

    // Fetch task events for cost data (only for tasks with models)
    const taskIds = tasksWithModel.map((t) => t.id)
    const taskEventsMap = await fetchTaskEvents(ctx as unknown as AggregationContext, taskIds)

    // Build model comparison records
    const models = await aggregateModelData(tasksWithModel, taskEventsMap)

    return {
      models,
      totalTasks: tasksWithModel.length,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    }
  },
})

/**
 * Get a summary of model usage for a specific project
 * Returns top models by task count with basic metrics
 */
export const getModelSummary = query({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ModelComparisonRecord[]> => {
    const now = Date.now()
    const endDate = now
    const startDate = endDate - 30 * 24 * 60 * 60 * 1000

    // Build task query
    const tasksQuery = ctx.db
      .query('tasks')
      .withIndex('by_project_status', (q) =>
        q.eq('project_id', args.projectId).eq('status', 'done')
      )

    const completedTasks = await tasksQuery.collect()

    // Filter by completion date
    const filteredTasks: TaskDoc[] = []
    for (const task of completedTasks) {
      const completedAt = task.completed_at
      if (completedAt && completedAt >= startDate && completedAt <= endDate) {
        filteredTasks.push(task)
      }
    }

    // Only include tasks that have a model assigned
    const tasksWithModel: TaskDoc[] = []
    for (const task of filteredTasks) {
      if (task.agent_model) {
        tasksWithModel.push(task)
      }
    }

    // Fetch task events for cost data
    const taskIds = tasksWithModel.map((t) => t.id)
    const taskEventsMap = await fetchTaskEvents(ctx as unknown as AggregationContext, taskIds)

    // Build model comparison records
    const models = await aggregateModelData(tasksWithModel, taskEventsMap)

    const limit = args.limit || models.length
    return models.slice(0, limit)
  },
})

/**
 * Get raw model usage stats without aggregation
 * Useful for custom analysis or exports
 */
export const getModelUsageStats = query({
  args: {
    projectId: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ModelUsageStats> => {
    const now = Date.now()
    const endDate = args.endDate || now
    const startDate = args.startDate || endDate - 30 * 24 * 60 * 60 * 1000

    // Build task query
    let tasksQuery = ctx.db
      .query('tasks')
      .withIndex('by_status', (q) => q.eq('status', 'done'))

    const projectId = args.projectId
    if (projectId) {
      tasksQuery = ctx.db
        .query('tasks')
        .withIndex('by_project_status', (q) =>
          q.eq('project_id', projectId).eq('status', 'done')
        )
    }

    const completedTasks = await tasksQuery.collect()

    // Filter by completion date
    const filteredTasks: TaskDoc[] = []
    for (const task of completedTasks) {
      const completedAt = task.completed_at
      if (completedAt && completedAt >= startDate && completedAt <= endDate) {
        filteredTasks.push(task)
      }
    }

    let tasksWithModelCount = 0
    let tasksWithoutModelCount = 0

    // Count by model
    const modelDistribution: Record<string, number> = {}
    for (const task of filteredTasks) {
      if (task.agent_model) {
        tasksWithModelCount++
        const model = task.agent_model
        modelDistribution[model] = (modelDistribution[model] || 0) + 1
      } else {
        tasksWithoutModelCount++
      }
    }

    return {
      totalTasks: filteredTasks.length,
      tasksWithModel: tasksWithModelCount,
      tasksWithoutModel: tasksWithoutModelCount,
      modelDistribution,
    }
  },
})
