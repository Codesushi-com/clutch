import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'

// ============================================
// Queries
// ============================================

// Get all chats for a project with last message info
export const getByProject = query({
  args: {
    projectId: v.string(),
  },
  returns: v.array(v.object({
    id: v.string(),
    project_id: v.string(),
    title: v.string(),
    participants: v.optional(v.string()),
    session_key: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
    lastMessage: v.optional(v.object({
      content: v.string(),
      author: v.string(),
      created_at: v.number(),
    })),
  })),
  handler: async (ctx, args) => {
    // Get all chats for project (filter by string project_id)
    const chats = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('project_id'), args.projectId))
      .order('desc')
      .take(100)

    // Get last message for each chat
    const result = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await ctx.db
          .query('chatMessages')
          .withIndex('by_chat', q => q.eq('chat_id', chat._id))
          .order('desc')
          .first()

        return {
          id: chat._id,
          project_id: chat.project_id,
          title: chat.title,
          participants: chat.participants ? JSON.stringify(chat.participants) : undefined,
          session_key: chat.session_key,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            author: lastMessage.author,
            created_at: lastMessage.created_at,
          } : undefined,
        }
      })
    )

    // Sort by last message time or chat updated_at
    return result.sort((a, b) => {
      const aTime = a.lastMessage?.created_at ?? a.updated_at
      const bTime = b.lastMessage?.created_at ?? b.updated_at
      return bTime - aTime
    })
  },
})

// Get a single chat by ID
export const getById = query({
  args: {
    id: v.string(),
  },
  returns: v.union(
    v.object({
      id: v.string(),
      project_id: v.string(),
      title: v.string(),
      participants: v.optional(v.string()),
      session_key: v.optional(v.string()),
      created_at: v.number(),
      updated_at: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('_id'), args.id))
      .first()
    if (!chat) return null

    return {
      id: chat._id,
      project_id: chat.project_id,
      title: chat.title,
      participants: chat.participants ? JSON.stringify(chat.participants) : undefined,
      session_key: chat.session_key,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    }
  },
})

// Find chat by session key (query - read-only)
export const findBySessionKey = query({
  args: {
    sessionKey: v.string(),
  },
  returns: v.union(
    v.object({
      id: v.string(),
      project_id: v.string(),
      title: v.string(),
      participants: v.optional(v.string()),
      session_key: v.optional(v.string()),
      created_at: v.number(),
      updated_at: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Try exact session key match first (scan all chats)
    const chat = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('session_key'), args.sessionKey))
      .first()

    if (chat) {
      return {
        id: chat._id,
        project_id: chat.project_id,
        title: chat.title,
        participants: chat.participants ? JSON.stringify(chat.participants) : undefined,
        session_key: chat.session_key,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
      }
    }

    // Try to extract chat ID from session key format: trap:projectSlug:chatId
    const match = args.sessionKey.match(/^trap:[^:]+:(.+)$/)
    if (match) {
      const chatId = match[1]
      const exists = await ctx.db
        .query('chats')
        .filter(q => q.eq(q.field('_id'), chatId))
        .first()
      if (exists) {
        // Note: We can't patch here (read-only context)
        // The caller should update the session_key separately if needed
        return {
          id: exists._id,
          project_id: exists.project_id,
          title: exists.title,
          participants: exists.participants ? JSON.stringify(exists.participants) : undefined,
          session_key: args.sessionKey,
          created_at: exists.created_at,
          updated_at: exists.updated_at,
        }
      }
    }

    return null
  },
})

// ============================================
// Mutations
// ============================================

// Create a new chat
export const create = mutation({
  args: {
    project_id: v.string(),
    title: v.string(),
    participants: v.optional(v.array(v.string())),
    session_key: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    project_id: v.string(),
    title: v.string(),
    participants: v.optional(v.string()),
    session_key: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()

    const id = await ctx.db.insert('chats', {
      project_id: args.project_id,
      title: args.title,
      participants: args.participants ?? ['ada'],
      session_key: args.session_key,
      created_at: now,
      updated_at: now,
    })

    const chat = await ctx.db.get(id)
    if (!chat) throw new Error('Failed to create chat')

    return {
      id: chat._id,
      project_id: chat.project_id,
      title: chat.title,
      participants: chat.participants ? JSON.stringify(chat.participants) : undefined,
      session_key: chat.session_key,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    }
  },
})

// Update a chat
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    session_key: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    project_id: v.string(),
    title: v.string(),
    participants: v.optional(v.string()),
    session_key: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('_id'), args.id))
      .first()
    if (!chat) throw new Error('Chat not found')

    const updates: { title?: string; session_key?: string; updated_at: number } = {
      updated_at: Date.now(),
    }

    if (args.title !== undefined) updates.title = args.title
    if (args.session_key !== undefined) updates.session_key = args.session_key

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- String ID compat
    await ctx.db.patch(args.id as any, updates)

    const updated = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('_id'), args.id))
      .first()
    if (!updated) throw new Error('Failed to update chat')

    return {
      id: updated._id,
      project_id: updated.project_id,
      title: updated.title,
      participants: updated.participants ? JSON.stringify(updated.participants) : undefined,
      session_key: updated.session_key,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    }
  },
})

// Delete a chat
export const deleteChat = mutation({
  args: {
    id: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query('chats')
      .filter(q => q.eq(q.field('_id'), args.id))
      .first()
    if (!chat) return false

    // Delete all messages first (cascade)
    const messages = await ctx.db
      .query('chatMessages')
      .filter(q => q.eq(q.field('chat_id'), args.id))
      .collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    // Delete the chat
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- String ID compat
    await ctx.db.delete(args.id as any)
    return true
  },
})

// ============================================
// Chat Messages
// ============================================

// Get messages for a chat (paginated)
export const getMessages = query({
  args: {
    chatId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()), // timestamp cursor
  },
  returns: v.object({
    messages: v.array(v.object({
      id: v.string(),
      chat_id: v.string(),
      author: v.string(),
      content: v.string(),
      run_id: v.optional(v.string()),
      session_key: v.optional(v.string()),
      is_automated: v.optional(v.number()),
      created_at: v.number(),
    })),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50

    // Build query
    let messages
    if (args.before) {
      messages = await ctx.db
        .query('chatMessages')
        .filter(q => q.and(
          q.eq(q.field('chat_id'), args.chatId),
          q.lt(q.field('created_at'), args.before!)
        ))
        .order('desc')
        .take(limit + 1)
    } else {
      messages = await ctx.db
        .query('chatMessages')
        .filter(q => q.eq(q.field('chat_id'), args.chatId))
        .order('desc')
        .take(limit + 1)
    }

    const hasMore = messages.length > limit
    if (hasMore) {
      messages.pop()
    }

    // Reverse to chronological order
    messages.reverse()

    return {
      messages: messages.map(m => ({
        id: m._id,
        chat_id: m.chat_id,
        author: m.author,
        content: m.content,
        run_id: m.run_id,
        session_key: m.session_key,
        is_automated: m.is_automated ? 1 : 0,
        created_at: m.created_at,
      })),
      hasMore,
    }
  },
})

// Create a new message
export const createMessage = mutation({
  args: {
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.boolean()),
  },
  returns: v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    created_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()

    const id = await ctx.db.insert('chatMessages', {
      chat_id: args.chat_id,
      author: args.author,
      content: args.content,
      run_id: args.run_id,
      session_key: args.session_key,
      is_automated: args.is_automated ?? false,
      created_at: now,
    })

    // Update chat's updated_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- String ID compat
    await ctx.db.patch(args.chat_id as any, { updated_at: now })

    const message = await ctx.db.get(id)
    if (!message) throw new Error('Failed to create message')

    return {
      id: message._id,
      chat_id: message.chat_id,
      author: message.author,
      content: message.content,
      run_id: message.run_id,
      session_key: message.session_key,
      is_automated: message.is_automated ? 1 : 0,
      created_at: message.created_at,
    }
  },
})

// Check if a message with run_id exists (for deduplication)
export const getMessageByRunId = query({
  args: {
    runId: v.string(),
  },
  returns: v.union(
    v.object({
      id: v.string(),
      chat_id: v.string(),
      author: v.string(),
      content: v.string(),
      run_id: v.optional(v.string()),
      session_key: v.optional(v.string()),
      is_automated: v.optional(v.number()),
      created_at: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Note: This requires a full table scan since run_id isn't indexed
    // For production, consider adding an index if deduplication is frequent
    const messages = await ctx.db
      .query('chatMessages')
      .filter(q => q.eq(q.field('run_id'), args.runId))
      .take(1)

    if (messages.length === 0) return null

    const m = messages[0]
    return {
      id: m._id,
      chat_id: m.chat_id,
      author: m.author,
      content: m.content,
      run_id: m.run_id,
      session_key: m.session_key,
      is_automated: m.is_automated ? 1 : 0,
      created_at: m.created_at,
    }
  },
})
