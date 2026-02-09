import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'
import type { Comment } from '../lib/types'

// ============================================
// Type Helpers
// ============================================

type AuthorType = "coordinator" | "agent" | "human"
type CommentType = "message" | "status_change" | "request_input" | "completion"

// Convert Convex document to Comment type
function toComment(doc: {
  id: string
  task_id: string
  author: string
  author_type: AuthorType
  content: string
  type: CommentType
  responded_at?: number
  created_at: number
}): Comment {
  return {
    id: doc.id,
    task_id: doc.task_id,
    author: doc.author,
    author_type: doc.author_type,
    content: doc.content,
    type: doc.type,
    responded_at: doc.responded_at ?? null,
    created_at: doc.created_at,
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get comments for a task (by task UUID)
 */
export const getByTask = query({
  args: {
    taskId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Comment[]> => {
    let comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('task_id', args.taskId))
      .collect()

    // Sort by created_at ascending (oldest first)
    comments = comments.sort((a, b) => a.created_at - b.created_at)

    if (args.limit) {
      comments = comments.slice(0, args.limit)
    }

    return comments.map((c) => toComment(c as Parameters<typeof toComment>[0]))
  },
})

/**
 * Get a single comment by UUID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<Comment | null> => {
    const comment = await ctx.db
      .query('comments')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!comment) {
      return null
    }

    return toComment(comment as Parameters<typeof toComment>[0])
  },
})

/**
 * Get pending input requests (unresponded request_input comments)
 */
export const getPendingInputs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Array<Comment & { taskTitle?: string }>> => {
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_type', (q) => q.eq('type', 'request_input'))
      .collect()

    const pending = comments.filter((c) => !c.responded_at)

    // Get task titles
    const result: Array<Comment & { taskTitle?: string }> = []
    for (const comment of pending.slice(0, args.limit ?? 10)) {
      const task = await ctx.db
        .query('tasks')
        .withIndex('by_uuid', (q) => q.eq('id', comment.task_id))
        .unique()
      const commentData = toComment(comment as Parameters<typeof toComment>[0])
      result.push({
        ...commentData,
        taskTitle: task ? task.title : undefined,
      })
    }

    return result
  },
})

/**
 * Get pending input count
 */
export const getPendingInputCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_type', (q) => q.eq('type', 'request_input'))
      .collect()

    return comments.filter((c) => !c.responded_at).length
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new comment
 */
export const create = mutation({
  args: {
    taskId: v.string(),
    author: v.string(),
    authorType: v.union(
      v.literal('coordinator'),
      v.literal('agent'),
      v.literal('human')
    ),
    content: v.string(),
    type: v.optional(v.union(
      v.literal('message'),
      v.literal('status_change'),
      v.literal('request_input'),
      v.literal('completion')
    )),
  },
  handler: async (ctx, args): Promise<Comment> => {
    if (!args.content || args.content.trim().length === 0) {
      throw new Error('Content is required')
    }

    // Verify task exists
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_uuid', (q) => q.eq('id', args.taskId))
      .unique()
    if (!task) {
      throw new Error(`Task not found: ${args.taskId}`)
    }

    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('comments', {
      id,
      task_id: args.taskId,
      author: args.author,
      author_type: args.authorType,
      content: args.content.trim(),
      type: args.type ?? 'message',
      created_at: now,
    })

    const comment = await ctx.db.get(internalId)
    if (!comment) {
      throw new Error('Failed to create comment')
    }

    return toComment(comment as Parameters<typeof toComment>[0])
  },
})

/**
 * Mark a request_input comment as responded
 */
export const markResponded = mutation({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<Comment> => {
    const existing = await ctx.db
      .query('comments')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Comment not found: ${args.id}`)
    }

    const now = Date.now()

    await ctx.db.patch(existing._id, { responded_at: now })

    const updated = await ctx.db.get(existing._id)
    if (!updated) {
      throw new Error('Failed to update comment')
    }

    return toComment(updated as Parameters<typeof toComment>[0])
  },
})

/**
 * Delete a comment
 */
export const deleteComment = mutation({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db
      .query('comments')
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()

    if (!existing) {
      throw new Error(`Comment not found: ${args.id}`)
    }

    await ctx.db.delete(existing._id)

    return { success: true }
  },
})
