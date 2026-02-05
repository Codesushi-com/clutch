import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import type { Notification } from '../lib/db/types'

// ============================================
// Type Helpers
// ============================================

type NotificationType = "escalation" | "request_input" | "completion" | "system"
type NotificationSeverity = "info" | "warning" | "critical"

// Convert Convex document to Notification type
function toNotification(doc: {
  _id: string
  _creationTime: number
  task_id?: string
  project_id?: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  agent?: string
  read: boolean
  created_at: number
}): Notification {
  return {
    id: doc._id,
    task_id: doc.task_id ?? null,
    project_id: doc.project_id ?? null,
    type: doc.type,
    severity: doc.severity,
    title: doc.title,
    message: doc.message,
    agent: doc.agent ?? null,
    read: doc.read ? 1 : 0,
    created_at: doc.created_at,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get all notifications with optional unread filter
 */
export const getAll = query({
  args: {
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ notifications: Notification[]; unreadCount: number }> => {
    let notifications

    if (args.unreadOnly) {
      notifications = await ctx.db
        .query('notifications')
        .withIndex('by_read', (q) => q.eq('read', false))
        .collect()
    } else {
      notifications = await ctx.db
        .query('notifications')
        .order('desc')
        .collect()
    }

    // Sort by severity (critical first) then by created_at
    const sorted = notifications
      .sort((a, b) => {
        const severityOrder: Record<NotificationSeverity, number> = {
          critical: 0,
          warning: 1,
          info: 2,
        }
        const aDoc = a as { severity: NotificationSeverity; created_at: number }
        const bDoc = b as { severity: NotificationSeverity; created_at: number }
        const sevDiff = severityOrder[aDoc.severity] - severityOrder[bDoc.severity]
        if (sevDiff !== 0) return sevDiff
        return bDoc.created_at - aDoc.created_at
      })
      .slice(0, args.limit ?? 50)

    // Get total unread count
    const allUnread = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()

    return {
      notifications: sorted.map((n) => toNotification(n as Parameters<typeof toNotification>[0])),
      unreadCount: allUnread.length,
    }
  },
})

/**
 * Get a single notification by ID
 */
export const getById = query({
  args: { id: v.id('notifications') },
  handler: async (ctx, args): Promise<Notification | null> => {
    const notification = await ctx.db.get(args.id)

    if (!notification) {
      return null
    }

    return toNotification(notification as Parameters<typeof toNotification>[0])
  },
})

/**
 * Get unread escalations count
 */
export const getUnreadEscalationsCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()

    return notifications.filter(
      (n) => (n as { type: NotificationType }).type === 'escalation'
    ).length
  },
})

/**
 * Get unread escalations (for gate)
 */
export const getUnreadEscalations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Notification[]> => {
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_read', (q) => q.eq('read', false))
      .collect()

    return notifications
      .filter((n) => (n as { type: NotificationType }).type === 'escalation')
      .sort((a, b) => {
        const severityOrder: Record<NotificationSeverity, number> = {
          critical: 0,
          warning: 1,
          info: 2,
        }
        const aDoc = a as { severity: NotificationSeverity; created_at: number }
        const bDoc = b as { severity: NotificationSeverity; created_at: number }
        const sevDiff = severityOrder[aDoc.severity] - severityOrder[bDoc.severity]
        if (sevDiff !== 0) return sevDiff
        return bDoc.created_at - aDoc.created_at
      })
      .slice(0, args.limit ?? 10)
      .map((n) => toNotification(n as Parameters<typeof toNotification>[0]))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new notification
 */
export const create = mutation({
  args: {
    taskId: v.optional(v.id('tasks')),
    projectId: v.optional(v.id('projects')),
    type: v.optional(v.union(
      v.literal('escalation'),
      v.literal('request_input'),
      v.literal('completion'),
      v.literal('system')
    )),
    severity: v.optional(v.union(
      v.literal('info'),
      v.literal('warning'),
      v.literal('critical')
    )),
    title: v.optional(v.string()),
    message: v.string(),
    agent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Notification> => {
    if (!args.message || args.message.trim().length === 0) {
      throw new Error('Message is required')
    }

    const now = Date.now()
    const type = args.type ?? 'system'
    const severity = args.severity ?? 'info'

    // Resolve project_id from task if not provided
    let resolvedProjectId = args.projectId
    if (!resolvedProjectId && args.taskId) {
      const task = await ctx.db.get(args.taskId)
      if (task) {
        resolvedProjectId = (task as { project_id: string }).project_id as unknown as typeof resolvedProjectId
      }
    }

    // Generate title if not provided
    const notificationTitle = args.title || (() => {
      switch (type) {
        case 'escalation': return `🚨 ${severity === 'critical' ? 'CRITICAL: ' : ''}Escalation`
        case 'request_input': return '❓ Input Requested'
        case 'completion': return '✅ Task Completed'
        default: return '📢 Notification'
      }
    })()

    const notificationData: {
      task_id?: typeof args.taskId
      project_id?: typeof resolvedProjectId
      type: typeof type
      severity: typeof severity
      title: string
      message: string
      agent?: string
      read: boolean
      created_at: number
    } = {
      type,
      severity,
      title: notificationTitle,
      message: args.message.trim(),
      read: false,
      created_at: now,
    }

    if (args.taskId) notificationData.task_id = args.taskId
    if (resolvedProjectId) notificationData.project_id = resolvedProjectId
    if (args.agent) notificationData.agent = args.agent

    const notificationId = await ctx.db.insert('notifications', notificationData)

    const notification = await ctx.db.get(notificationId)
    if (!notification) {
      throw new Error('Failed to create notification')
    }

    return toNotification(notification as Parameters<typeof toNotification>[0])
  },
})

/**
 * Mark notification as read/unread
 */
export const markRead = mutation({
  args: {
    id: v.id('notifications'),
    read: v.boolean(),
  },
  handler: async (ctx, args): Promise<Notification> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Notification not found: ${args.id}`)
    }

    await ctx.db.patch(args.id, { read: args.read })

    const updated = await ctx.db.get(args.id)
    if (!updated) {
      throw new Error('Failed to update notification')
    }

    return toNotification(updated as Parameters<typeof toNotification>[0])
  },
})

/**
 * Delete a notification
 */
export const deleteNotification = mutation({
  args: { id: v.id('notifications') },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Notification not found: ${args.id}`)
    }

    await ctx.db.delete(args.id)

    return { success: true }
  },
})
