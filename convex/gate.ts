import { query } from './_generated/server'
// Types imported for potential future use
import type { Id } from './_generated/server'

// ============================================
// Gate Status Query
// ============================================

interface GateStatusDetails {
  readyTasks: number
  pendingInputs: number
  stuckTasks: number
  reviewTasks: number
  pendingDispatch: number
  unreadEscalations: number
  pendingSignals: number
}

interface GateStatusResponse {
  needsAttention: boolean
  reason: string | null
  details: GateStatusDetails
  tasks?: {
    ready: Array<{ id: string; title: string; priority: string }>
    pendingInput: Array<{ taskId: string; taskTitle: string; author: string; content: string }>
    stuck: Array<{ id: string; title: string; assignee: string; hours: number }>
    review: Array<{ id: string; title: string; assignee: string }>
    pendingDispatch: Array<{ id: string; title: string; assignee: string }>
  }
  escalations?: Array<{ id: string; severity: string; message: string; agent: string }>
  signals?: Array<{ id: string; kind: string; severity: string; message: string; agent_id: string; task_id: string }>
  timestamp: number
}

/**
 * Get full gate status - checks all conditions for coordinator attention
 */
export const getStatus = query({
  args: {},
  handler: async (ctx): Promise<GateStatusResponse> => {
    const now = Date.now()
    const twoHoursAgo = now - (2 * 60 * 60 * 1000)

    // Get all tasks
    const allTasks = await ctx.db.query('tasks').collect()

    // Count ready tasks (excluding blocked ones)
    const readyTasks = []
    for (const task of allTasks) {
      const taskDoc = task as { _id: string; status: string; assignee?: string; title: string; priority: string }
      if (taskDoc.status === 'ready' && !taskDoc.assignee) {
        // Check for incomplete dependencies
        const deps = await ctx.db
          .query('taskDependencies')
          .withIndex('by_task', (q) => q.eq('task_id', taskDoc._id as unknown as Id<'tasks'>))
          .collect()
        
        let hasIncompleteDeps = false
        for (const dep of deps) {
          const depTask = await ctx.db.get((dep as { depends_on_id: string }).depends_on_id as unknown as Id<'tasks'>)
          if (depTask && (depTask as { status: string }).status !== 'done') {
            hasIncompleteDeps = true
            break
          }
        }

        if (!hasIncompleteDeps) {
          readyTasks.push(taskDoc)
        }
      }
    }

    // Count stuck tasks (in_progress for > 2 hours)
    const stuckTasks = allTasks.filter(
      (t) => (t as { status: string; updated_at: number }).status === 'in_progress' &&
             (t as { updated_at: number }).updated_at < twoHoursAgo
    )

    // Count review tasks
    const reviewTasks = allTasks.filter(
      (t) => (t as { status: string }).status === 'review'
    )

    // Count pending dispatch tasks
    const pendingDispatchTasks = allTasks.filter(
      (t) => (t as { dispatch_status?: string }).dispatch_status === 'pending'
    )

    // Count pending input requests
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_type', (q) => q.eq('type', 'request_input'))
      .collect()
    const pendingInputs = comments.filter((c) => !(c as { responded_at?: number }).responded_at)

    // Count unread escalations
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()
    const unreadEscalations = notifications.filter(
      (n) => (n as { type: string }).type === 'escalation'
    )

    // Count pending signals (blocking and unresponded)
    const allSignals = await ctx.db.query('signals').collect()
    const pendingSignals = allSignals.filter(
      (s) => (s as { blocking: boolean }).blocking && !(s as { responded_at?: number }).responded_at
    )

    // Build details
    const details: GateStatusDetails = {
      readyTasks: readyTasks.length,
      pendingInputs: pendingInputs.length,
      stuckTasks: stuckTasks.length,
      reviewTasks: reviewTasks.length,
      pendingDispatch: pendingDispatchTasks.length,
      unreadEscalations: unreadEscalations.length,
      pendingSignals: pendingSignals.length,
    }

    // Build reasons
    const reasons: string[] = []
    if (pendingSignals.length > 0) reasons.push(`${pendingSignals.length} pending agent signal(s)`)
    if (unreadEscalations.length > 0) reasons.push(`${unreadEscalations.length} unread escalation(s)`)
    if (pendingInputs.length > 0) reasons.push(`${pendingInputs.length} pending input request(s)`)
    if (pendingDispatchTasks.length > 0) reasons.push(`${pendingDispatchTasks.length} task(s) pending dispatch`)
    if (readyTasks.length > 0) reasons.push(`${readyTasks.length} task(s) ready for assignment`)
    if (stuckTasks.length > 0) reasons.push(`${stuckTasks.length} task(s) stuck > 2 hours`)
    if (reviewTasks.length > 0) reasons.push(`${reviewTasks.length} task(s) ready for review`)

    const needsAttention = reasons.length > 0

    const response: GateStatusResponse = {
      needsAttention,
      reason: needsAttention ? reasons.join('; ') : null,
      details,
      timestamp: now,
    }

    // If attention needed, fetch detailed data
    if (needsAttention) {
      // Ready tasks (sorted by priority)
      const priorityOrder: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 }
      response.tasks = {
        ready: readyTasks
          .sort((a, b) => (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5))
          .slice(0, 10)
          .map((t) => ({ id: t._id, title: t.title, priority: t.priority })),

        // Pending inputs with task titles
        pendingInput: await Promise.all(
          pendingInputs.slice(0, 10).map(async (c) => {
            const cDoc = c as { _id: string; task_id: string; author: string; content: string }
            const task = await ctx.db.get(cDoc.task_id as unknown as Id<'tasks'>)
            return {
              taskId: cDoc.task_id,
              taskTitle: task ? (task as { title: string }).title : 'Unknown',
              author: cDoc.author,
              content: cDoc.content,
            }
          })
        ),

        // Stuck tasks
        stuck: stuckTasks
          .sort((a, b) => (a as { updated_at: number }).updated_at - (b as { updated_at: number }).updated_at)
          .slice(0, 10)
          .map((t) => {
            const tDoc = t as { _id: string; title: string; assignee?: string; updated_at: number }
            return {
              id: tDoc._id,
              title: tDoc.title,
              assignee: tDoc.assignee || 'unassigned',
              hours: Math.floor((now - tDoc.updated_at) / (60 * 60 * 1000)),
            }
          }),

        // Review tasks
        review: reviewTasks
          .sort((a, b) => (b as { updated_at: number }).updated_at - (a as { updated_at: number }).updated_at)
          .slice(0, 10)
          .map((t) => {
            const tDoc = t as { _id: string; title: string; assignee?: string }
            return {
              id: tDoc._id,
              title: tDoc.title,
              assignee: tDoc.assignee || 'unassigned',
            }
          }),

        // Pending dispatch
        pendingDispatch: pendingDispatchTasks
          .sort((a, b) => {
            const aTime = (a as { dispatch_requested_at?: number }).dispatch_requested_at || 0
            const bTime = (b as { dispatch_requested_at?: number }).dispatch_requested_at || 0
            return aTime - bTime
          })
          .slice(0, 10)
          .map((t) => {
            const tDoc = t as { _id: string; title: string; assignee?: string }
            return {
              id: tDoc._id,
              title: tDoc.title,
              assignee: tDoc.assignee || 'unassigned',
            }
          }),
      }

      // Escalations
      if (unreadEscalations.length > 0) {
        response.escalations = unreadEscalations
          .sort((a, b) => {
            const severityOrder: Record<string, number> = { critical: 1, warning: 2, info: 3 }
            const aDoc = a as { severity: string; created_at: number; _id: string; message: string; agent?: string }
            const bDoc = b as { severity: string; created_at: number }
            const sevDiff = (severityOrder[aDoc.severity] || 4) - (severityOrder[bDoc.severity] || 4)
            if (sevDiff !== 0) return sevDiff
            return bDoc.created_at - aDoc.created_at
          })
          .slice(0, 10)
          .map((n) => {
            const nDoc = n as { _id: string; severity: string; message: string; agent?: string }
            return {
              id: nDoc._id,
              severity: nDoc.severity,
              message: nDoc.message,
              agent: nDoc.agent || 'unknown',
            }
          })
      }

      // Pending signals
      if (pendingSignals.length > 0) {
        response.signals = pendingSignals
          .sort((a, b) => {
            const severityOrder: Record<string, number> = { critical: 1, high: 2, normal: 3 }
            const aDoc = a as { severity: string; created_at: number; _id: string; kind: string; message: string; agent_id: string; task_id: string }
            const bDoc = b as { severity: string; created_at: number }
            const sevDiff = (severityOrder[aDoc.severity] || 4) - (severityOrder[bDoc.severity] || 4)
            if (sevDiff !== 0) return sevDiff
            return bDoc.created_at - aDoc.created_at
          })
          .slice(0, 10)
          .map((s) => {
            const sDoc = s as { _id: string; kind: string; severity: string; message: string; agent_id: string; task_id: string }
            return {
              id: sDoc._id,
              kind: sDoc.kind,
              severity: sDoc.severity,
              message: sDoc.message,
              agent_id: sDoc.agent_id,
              task_id: sDoc.task_id,
            }
          })
      }
    }

    return response
  },
})

/**
 * Get just the counts for lightweight polling
 */
export const getCounts = query({
  args: {},
  handler: async (ctx): Promise<GateStatusDetails> => {
    const now = Date.now()
    const twoHoursAgo = now - (2 * 60 * 60 * 1000)

    // Get all tasks
    const allTasks = await ctx.db.query('tasks').collect()

    // Count ready tasks (excluding blocked ones)
    let readyTasks = 0
    for (const task of allTasks) {
      const taskDoc = task as { _id: string; status: string; assignee?: string }
      if (taskDoc.status === 'ready' && !taskDoc.assignee) {
        // Check for incomplete dependencies
        const deps = await ctx.db
          .query('taskDependencies')
          .withIndex('by_task', (q) => q.eq('task_id', taskDoc._id as unknown as Id<'tasks'>))
          .collect()
        
        let hasIncompleteDeps = false
        for (const dep of deps) {
          const depTask = await ctx.db.get((dep as { depends_on_id: string }).depends_on_id as unknown as Id<'tasks'>)
          if (depTask && (depTask as { status: string }).status !== 'done') {
            hasIncompleteDeps = true
            break
          }
        }

        if (!hasIncompleteDeps) {
          readyTasks++
        }
      }
    }

    // Count stuck tasks (in_progress for > 2 hours)
    const stuckTasks = allTasks.filter(
      (t) => (t as { status: string; updated_at: number }).status === 'in_progress' &&
             (t as { updated_at: number }).updated_at < twoHoursAgo
    ).length

    // Count review tasks
    const reviewTasks = allTasks.filter(
      (t) => (t as { status: string }).status === 'review'
    ).length

    // Count pending dispatch tasks
    const pendingDispatch = allTasks.filter(
      (t) => (t as { dispatch_status?: string }).dispatch_status === 'pending'
    ).length

    // Count pending input requests
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_type', (q) => q.eq('type', 'request_input'))
      .collect()
    const pendingInputs = comments.filter((c) => !(c as { responded_at?: number }).responded_at).length

    // Count unread escalations
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()
    const unreadEscalations = notifications.filter(
      (n) => (n as { type: string }).type === 'escalation'
    ).length

    // Count pending signals (blocking and unresponded)
    const allSignals = await ctx.db.query('signals').collect()
    const pendingSignals = allSignals.filter(
      (s) => (s as { blocking: boolean }).blocking && !(s as { responded_at?: number }).responded_at
    ).length

    return {
      readyTasks,
      pendingInputs,
      stuckTasks,
      reviewTasks,
      pendingDispatch,
      unreadEscalations,
      pendingSignals,
    }
  },
})
