import { query } from './_generated/server'

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
      if (task.status === 'ready' && !task.assignee) {
        // Check for incomplete dependencies
        const deps = await ctx.db
          .query('taskDependencies')
          .withIndex('by_task', (q) => q.eq('task_id', task.id))
          .collect()

        let hasIncompleteDeps = false
        for (const dep of deps) {
          const depTask = await ctx.db
            .query('tasks')
            .withIndex('by_uuid', (q) => q.eq('id', dep.depends_on_id))
            .unique()
          if (depTask && depTask.status !== 'done') {
            hasIncompleteDeps = true
            break
          }
        }

        if (!hasIncompleteDeps) {
          readyTasks.push(task)
        }
      }
    }

    // Count stuck tasks (in_progress for > 2 hours)
    const stuckTasks = allTasks.filter(
      (t) => t.status === 'in_progress' && t.updated_at < twoHoursAgo
    )

    // Count review tasks
    const reviewTasks = allTasks.filter((t) => t.status === 'in_review')

    // Count pending dispatch tasks
    const pendingDispatchTasks = allTasks.filter((t) => t.dispatch_status === 'pending')

    // Count pending input requests
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_type', (q) => q.eq('type', 'request_input'))
      .collect()
    const pendingInputs = comments.filter((c) => !c.responded_at)

    // Count unread escalations
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()
    const unreadEscalations = notifications.filter((n) => n.type === 'escalation')

    // Count pending signals (blocking and unresponded)
    const allSignals = await ctx.db.query('signals').collect()
    const pendingSignals = allSignals.filter((s) => s.blocking && !s.responded_at)

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
      const priorityOrder: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 }
      response.tasks = {
        ready: readyTasks
          .sort((a, b) => (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5))
          .slice(0, 10)
          .map((t) => ({ id: t.id, title: t.title, priority: t.priority })),

        pendingInput: await Promise.all(
          pendingInputs.slice(0, 10).map(async (c) => {
            const task = await ctx.db
              .query('tasks')
              .withIndex('by_uuid', (q) => q.eq('id', c.task_id))
              .unique()
            return {
              taskId: c.task_id,
              taskTitle: task ? task.title : 'Unknown',
              author: c.author,
              content: c.content,
            }
          })
        ),

        stuck: stuckTasks
          .sort((a, b) => a.updated_at - b.updated_at)
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            title: t.title,
            assignee: t.assignee || 'unassigned',
            hours: Math.floor((now - t.updated_at) / (60 * 60 * 1000)),
          })),

        review: reviewTasks
          .sort((a, b) => b.updated_at - a.updated_at)
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            title: t.title,
            assignee: t.assignee || 'unassigned',
          })),

        pendingDispatch: pendingDispatchTasks
          .sort((a, b) => (a.dispatch_requested_at || 0) - (b.dispatch_requested_at || 0))
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            title: t.title,
            assignee: t.assignee || 'unassigned',
          })),
      }

      // Escalations
      if (unreadEscalations.length > 0) {
        response.escalations = unreadEscalations
          .sort((a, b) => {
            const severityOrder: Record<string, number> = { critical: 1, warning: 2, info: 3 }
            const sevDiff = (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4)
            if (sevDiff !== 0) return sevDiff
            return b.created_at - a.created_at
          })
          .slice(0, 10)
          .map((n) => ({
            id: n.id,
            severity: n.severity,
            message: n.message,
            agent: n.agent || 'unknown',
          }))
      }

      // Pending signals
      if (pendingSignals.length > 0) {
        response.signals = pendingSignals
          .sort((a, b) => {
            const severityOrder: Record<string, number> = { critical: 1, high: 2, normal: 3 }
            const sevDiff = (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4)
            if (sevDiff !== 0) return sevDiff
            return b.created_at - a.created_at
          })
          .slice(0, 10)
          .map((s) => ({
            id: s.id,
            kind: s.kind,
            severity: s.severity,
            message: s.message,
            agent_id: s.agent_id,
            task_id: s.task_id,
          }))
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

    const allTasks = await ctx.db.query('tasks').collect()

    // Count ready tasks (excluding blocked ones)
    let readyTasks = 0
    for (const task of allTasks) {
      if (task.status === 'ready' && !task.assignee) {
        const deps = await ctx.db
          .query('taskDependencies')
          .withIndex('by_task', (q) => q.eq('task_id', task.id))
          .collect()

        let hasIncompleteDeps = false
        for (const dep of deps) {
          const depTask = await ctx.db
            .query('tasks')
            .withIndex('by_uuid', (q) => q.eq('id', dep.depends_on_id))
            .unique()
          if (depTask && depTask.status !== 'done') {
            hasIncompleteDeps = true
            break
          }
        }

        if (!hasIncompleteDeps) {
          readyTasks++
        }
      }
    }

    const stuckTasks = allTasks.filter(
      (t) => t.status === 'in_progress' && t.updated_at < twoHoursAgo
    ).length

    const reviewTasks = allTasks.filter((t) => t.status === 'in_review').length

    const pendingDispatch = allTasks.filter((t) => t.dispatch_status === 'pending').length

    const comments = await ctx.db
      .query('comments')
      .withIndex('by_type', (q) => q.eq('type', 'request_input'))
      .collect()
    const pendingInputs = comments.filter((c) => !c.responded_at).length

    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()
    const unreadEscalations = notifications.filter((n) => n.type === 'escalation').length

    const allSignals = await ctx.db.query('signals').collect()
    const pendingSignals = allSignals.filter((s) => s.blocking && !s.responded_at).length

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
