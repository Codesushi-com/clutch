import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import type { Comment } from '../lib/db/types'

// ============================================
// Type Helpers
// ============================================

type AuthorType = "coordinator" | "agent" | "human"
type CommentType = "message" | "status_change" | "request_input" | "completion"

// Convert Convex document to Comment type
function toComment(doc: {
  _id: string
  _creationTime: number
  task_id: string
  author: string
  author_type: AuthorType
  content: string
  type: CommentType
  responded_at?: number
  created_at: number
}): Comment {
  return {
    id: doc._id,
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
 * Get comments for a task
 */
export const getByTask = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args): Promise<Comment[]> => {
    const comments = await ctx.db
      .query('comments')
      .withIndex('by_task', (q) => q.eq('task_id', args.taskId))
      .collect()

    return comments.map((c) => toComment(c as Parameters<typeof toComment>[0]))
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
    task_id: v.id('tasks'),
    content: v.string(),
    author: v.optional(v.string()),
    author_type: v.optional(v.union(
      v.literal('coordinator'),
      v.literal('agent'),
      v.literal('human')
    )),
    type: v.optional(v.union(
      v.literal('message'),
      v.literal('status_change'),
      v.literal('request_input'),
      v.literal('completion')
    )),
  },
  handler: async (ctx, args): Promise<Comment> => {
    // Verify task exists
    const task = await ctx.db.get(args.task_id)
    if (!task) {
      throw new Error(`Task not found: ${args.task_id}`)
    }

    const now = Date.now()

    const commentId = await ctx.db.insert('comments', {
      task_id: args.task_id,
      author: args.author ?? 'dan',
      author_type: args.author_type ?? 'human',
      content: args.content,
      type: args.type ?? 'message',
      created_at: now,
    })

    const comment = await ctx.db.get(commentId)
    if (!comment) {
      throw new Error('Failed to create comment')
    }

    return toComment(comment as Parameters<typeof toComment>[0])
  },
})

/**
 * Delete a comment
 */
export const deleteComment = mutation({
  args: { id: v.id('comments') },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db.get(args.id)

    if (!existing) {
      throw new Error(`Comment not found: ${args.id}`)
    }

    await ctx.db.delete(args.id)

    return { success: true }
  },
})
