import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { generateId } from './_helpers'

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
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .order('desc')
      .take(100)

    const result = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await ctx.db
          .query('chatMessages')
          .withIndex('by_chat', (q) => q.eq('chat_id', chat.id))
          .order('desc')
          .first()

        return {
          id: chat.id,
          project_id: chat.project_id,
          title: chat.title,
          participants: chat.participants ?? undefined,
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

    return result.sort((a, b) => {
      const aTime = a.lastMessage?.created_at ?? a.updated_at
      const bTime = b.lastMessage?.created_at ?? b.updated_at
      return bTime - aTime
    })
  },
})

// Get a single chat by UUID
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
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()
    if (!chat) return null

    return {
      id: chat.id,
      project_id: chat.project_id,
      title: chat.title,
      participants: chat.participants ?? undefined,
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
    // Try exact session key match first
    const chat = await ctx.db
      .query('chats')
      .withIndex('by_session_key', (q) => q.eq('session_key', args.sessionKey))
      .unique()

    if (chat) {
      return {
        id: chat.id,
        project_id: chat.project_id,
        title: chat.title,
        participants: chat.participants ?? undefined,
        session_key: chat.session_key,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
      }
    }

    // Try to extract chat UUID from session key format: clutch:projectSlug:chatId
    const match = args.sessionKey.match(/^clutch:[^:]+:(.+)$/)
    if (match) {
      const chatUuid = match[1]
      const exists = await ctx.db
        .query('chats')
        .withIndex('by_uuid', (q) => q.eq('id', chatUuid))
        .unique()
      if (exists) {
        return {
          id: exists.id,
          project_id: exists.project_id,
          title: exists.title,
          participants: exists.participants ?? undefined,
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
    participants: v.optional(v.string()),
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
    const id = generateId()

    const internalId = await ctx.db.insert('chats', {
      id,
      project_id: args.project_id,
      title: args.title,
      participants: args.participants ?? '["ada"]',
      session_key: args.session_key,
      created_at: now,
      updated_at: now,
    })

    const chat = await ctx.db.get(internalId)
    if (!chat) throw new Error('Failed to create chat')

    return {
      id: chat.id,
      project_id: chat.project_id,
      title: chat.title,
      participants: chat.participants ?? undefined,
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
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()
    if (!chat) throw new Error('Chat not found')

    const updates: Record<string, unknown> = {
      updated_at: Date.now(),
    }

    if (args.title !== undefined) updates.title = args.title
    if (args.session_key !== undefined) updates.session_key = args.session_key

    await ctx.db.patch(chat._id, updates)

    const updated = await ctx.db.get(chat._id)
    if (!updated) throw new Error('Failed to update chat')

    return {
      id: updated.id,
      project_id: updated.project_id,
      title: updated.title,
      participants: updated.participants ?? undefined,
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
      .withIndex('by_uuid', (q) => q.eq('id', args.id))
      .unique()
    if (!chat) return false

    // Delete all messages first (cascade)
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_chat', (q) => q.eq('chat_id', args.id))
      .collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    // Delete the chat
    await ctx.db.delete(chat._id)
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
    before: v.optional(v.number()),
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

    let messages
    if (args.before) {
      messages = await ctx.db
        .query('chatMessages')
        .withIndex('by_chat', (q) => q.eq('chat_id', args.chatId))
        .filter((q) => q.lt(q.field('created_at'), args.before!))
        .order('desc')
        .take(limit + 1)
    } else {
      messages = await ctx.db
        .query('chatMessages')
        .withIndex('by_chat', (q) => q.eq('chat_id', args.chatId))
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
      messages: messages.map((m) => ({
        id: m.id,
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
    const id = generateId()

    const internalId = await ctx.db.insert('chatMessages', {
      id,
      chat_id: args.chat_id,
      author: args.author,
      content: args.content,
      run_id: args.run_id,
      session_key: args.session_key,
      is_automated: args.is_automated ?? false,
      created_at: now,
    })

    // Update chat's updated_at
    const chat = await ctx.db
      .query('chats')
      .withIndex('by_uuid', (q) => q.eq('id', args.chat_id))
      .unique()
    if (chat) {
      await ctx.db.patch(chat._id, { updated_at: now })
    }

    const message = await ctx.db.get(internalId)
    if (!message) throw new Error('Failed to create message')

    return {
      id: message.id,
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
    const messages = await ctx.db
      .query('chatMessages')
      .filter((q) => q.eq(q.field('run_id'), args.runId))
      .take(1)

    if (messages.length === 0) return null

    const m = messages[0]
    return {
      id: m.id,
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

// ============================================
// Typing State (reactive via Convex)
// ============================================

// Get typing state for a chat
export const getTypingState = query({
  args: {
    chatId: v.string(),
  },
  returns: v.array(v.object({
    chat_id: v.string(),
    author: v.string(),
    state: v.union(v.literal("thinking"), v.literal("typing")),
    updated_at: v.number(),
  })),
  handler: async (ctx, args) => {
    const typingStates = await ctx.db
      .query('typingState')
      .withIndex('by_chat', (q) => q.eq('chat_id', args.chatId))
      .collect()

    return typingStates.map((ts) => ({
      chat_id: ts.chat_id,
      author: ts.author,
      state: ts.state,
      updated_at: ts.updated_at,
    }))
  },
})

// Set typing state for a user in a chat
export const setTyping = mutation({
  args: {
    chat_id: v.string(),
    author: v.string(),
    state: v.union(v.literal("thinking"), v.literal("typing")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const now = Date.now()

    // Check if entry exists
    const existing = await ctx.db
      .query('typingState')
      .withIndex('by_chat_author', (q) =>
        q.eq('chat_id', args.chat_id).eq('author', args.author)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: args.state,
        updated_at: now,
      })
    } else {
      await ctx.db.insert('typingState', {
        chat_id: args.chat_id,
        author: args.author,
        state: args.state,
        updated_at: now,
      })
    }

    return true
  },
})

// Clear typing state for a user in a chat
export const clearTyping = mutation({
  args: {
    chat_id: v.string(),
    author: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('typingState')
      .withIndex('by_chat_author', (q) =>
        q.eq('chat_id', args.chat_id).eq('author', args.author)
      )
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    return true
  },
})

// Clear stale typing states (older than 30 seconds)
export const clearStaleTyping = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const staleThreshold = Date.now() - 30000 // 30 seconds

    const staleStates = await ctx.db
      .query('typingState')
      .filter((q) => q.lt(q.field('updated_at'), staleThreshold))
      .collect()

    for (const state of staleStates) {
      await ctx.db.delete(state._id)
    }

    return staleStates.length
  },
})
