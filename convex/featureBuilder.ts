import { v } from "convex/values"
import { query, mutation } from "./_generated/server"
import type { GenericMutationCtx } from "convex/server"

// Query to get active sessions for a project
export const getActiveSessions = query({
  args: {
    project_id: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_project_status", (q) =>
        q.eq("project_id", args.project_id).eq("status", "active")
      )
      .order("desc")
      .take(10)
  },
})

// Query to get session by ID
export const getSession = query({
  args: {
    id: v.string(),
  },
  returns: v.optional(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_uuid", (q) => q.eq("id", args.id))
      .first()
  },
})

// Query to get recent sessions for a project
export const getRecentSessions = query({
  args: {
    project_id: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_project", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .take(args.limit ?? 20)
  },
})

// Mutation to create a new session
export const createSession = mutation({
  args: {
    project_id: v.string(),
    user_id: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = `fbs_${now}_${Math.random().toString(36).substring(2, 9)}`

    await ctx.db.insert("featureBuilderSessions", {
      id,
      project_id: args.project_id,
      user_id: args.user_id,
      status: "active",
      current_step: "overview",
      completed_steps: [],
      started_at: now,
      last_activity_at: now,
      steps_completed_count: 0,
      research_used: false,
    })

    return id
  },
})

// Mutation to update session progress
export const updateSessionProgress = mutation({
  args: {
    id: v.string(),
    current_step: v.string(),
    completed_steps: v.array(v.string()),
    feature_data: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_uuid", (q) => q.eq("id", args.id))
      .first()

    if (!session) {
      return false
    }

    const now = Date.now()
    const updates: Record<string, unknown> = {
      current_step: args.current_step,
      completed_steps: args.completed_steps,
      last_activity_at: now,
      steps_completed_count: args.completed_steps.length,
    }

    if (args.feature_data) {
      updates.feature_data = args.feature_data
    }

    // Check if research was used
    if (args.completed_steps.includes("research")) {
      updates.research_used = true
    }

    await ctx.db.patch(session._id, updates)
    return true
  },
})

// Mutation to complete a session
export const completeSession = mutation({
  args: {
    id: v.string(),
    result_task_id: v.optional(v.string()),
    tasks_generated: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_uuid", (q) => q.eq("id", args.id))
      .first()

    if (!session) {
      return false
    }

    const now = Date.now()
    const duration = now - session.started_at

    await ctx.db.patch(session._id, {
      status: "completed",
      completed_at: now,
      last_activity_at: now,
      duration_ms: duration,
      result_task_id: args.result_task_id,
      tasks_generated: args.tasks_generated,
    })

    // Update analytics
    await updateAnalytics(ctx, session.project_id, "completed", duration, session.steps_completed_count, args.tasks_generated ?? 0)

    return true
  },
})

// Mutation to cancel a session
export const cancelSession = mutation({
  args: {
    id: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_uuid", (q) => q.eq("id", args.id))
      .first()

    if (!session) {
      return false
    }

    const now = Date.now()
    const duration = now - session.started_at

    await ctx.db.patch(session._id, {
      status: "cancelled",
      completed_at: now,
      last_activity_at: now,
      duration_ms: duration,
    })

    // Update analytics
    await updateAnalytics(ctx, session.project_id, "cancelled", duration, session.steps_completed_count, 0)

    return true
  },
})

// Mutation to mark session as error
export const errorSession = mutation({
  args: {
    id: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("featureBuilderSessions")
      .withIndex("by_uuid", (q) => q.eq("id", args.id))
      .first()

    if (!session) {
      return false
    }

    const now = Date.now()

    await ctx.db.patch(session._id, {
      status: "error",
      completed_at: now,
      last_activity_at: now,
    })

    // Update analytics with error
    await updateAnalytics(ctx, session.project_id, "error", 0, session.steps_completed_count, 0)

    return true
  },
})

// Helper to update analytics - uses GenericMutationCtx for proper typing
async function updateAnalytics(
  ctx: GenericMutationCtx<Record<string, unknown>>,
  projectId: string,
  outcome: "completed" | "cancelled" | "error",
  durationMs: number,
  stepsCompleted: number,
  tasksGenerated: number
) {
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const id = `${projectId}:day:${dayStart}`

  const existing = await ctx.db
    .query("featureBuilderAnalytics")
    .withIndex("by_uuid", (q) => q.eq("id", id))
    .first()

  if (existing) {
    const updates: Record<string, unknown> = {
      updated_at: now,
    }

    if (outcome === "completed") {
      updates.sessions_completed = existing.sessions_completed + 1
      updates.features_created = existing.features_created + 1
      updates.tasks_generated = existing.tasks_generated + tasksGenerated
    } else if (outcome === "cancelled") {
      updates.sessions_cancelled = existing.sessions_cancelled + 1
    } else if (outcome === "error") {
      updates.error_count = existing.error_count + 1
    }

    // Update averages
    const totalSessions = existing.sessions_started
    updates.avg_session_duration_ms = 
      ((existing.avg_session_duration_ms * (totalSessions - 1)) + durationMs) / totalSessions
    updates.avg_steps_completed = 
      ((existing.avg_steps_completed * (totalSessions - 1)) + stepsCompleted) / totalSessions

    await ctx.db.patch(existing._id, updates)
  } else {
    // Create new analytics entry
    await ctx.db.insert("featureBuilderAnalytics", {
      id,
      project_id: projectId,
      period: "day",
      period_start: dayStart,
      sessions_started: 1,
      sessions_completed: outcome === "completed" ? 1 : 0,
      sessions_cancelled: outcome === "cancelled" ? 1 : 0,
      avg_session_duration_ms: durationMs,
      avg_steps_completed: stepsCompleted,
      features_created: outcome === "completed" ? 1 : 0,
      tasks_generated: tasksGenerated,
      error_count: outcome === "error" ? 1 : 0,
      updated_at: now,
    })
  }
}

// Query to get analytics for a project
export const getAnalytics = query({
  args: {
    project_id: v.string(),
    period: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("all_time")),
  },
  returns: v.optional(v.any()),
  handler: async (ctx, args) => {
    const periodStart = getPeriodStart(args.period)
    const id = `${args.project_id}:${args.period}:${periodStart}`

    return await ctx.db
      .query("featureBuilderAnalytics")
      .withIndex("by_uuid", (q) => q.eq("id", id))
      .first()
  },
})

// Query to get analytics history
export const getAnalyticsHistory = query({
  args: {
    project_id: v.string(),
    days: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureBuilderAnalytics")
      .withIndex("by_project_period", (q) =>
        q.eq("project_id", args.project_id).eq("period", "day")
      )
      .order("desc")
      .take(args.days ?? 30)
  },
})

function getPeriodStart(period: "day" | "week" | "month" | "all_time"): number {
  const now = new Date()
  
  switch (period) {
    case "day":
      return now.setHours(0, 0, 0, 0)
    case "week":
      const dayOfWeek = now.getDay()
      return now.setDate(now.getDate() - dayOfWeek)
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    case "all_time":
      return 0
    default:
      return 0
  }
}
