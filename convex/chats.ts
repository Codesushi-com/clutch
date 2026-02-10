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
      delivery_status: v.optional(v.union(
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("processing"),
        v.literal("responded"),
        v.literal("failed"),
      )),
      retry_count: v.optional(v.number()),
      cooldown_until: v.optional(v.number()),
      failure_reason: v.optional(v.string()),
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
        delivery_status: m.delivery_status,
        retry_count: m.retry_count,
        cooldown_until: m.cooldown_until,
        failure_reason: m.failure_reason,
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
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = generateId()

    // Set initial delivery_status: "sent" for human messages, null for agent messages
    // Human messages are those where author is not "ada"
    const initialDeliveryStatus = args.delivery_status ?? (args.author === "ada" ? undefined : "sent")

    const internalId = await ctx.db.insert('chatMessages', {
      id,
      chat_id: args.chat_id,
      author: args.author,
      content: args.content,
      run_id: args.run_id,
      session_key: args.session_key,
      is_automated: args.is_automated ?? false,
      delivery_status: initialDeliveryStatus,
      retry_count: args.retry_count ?? 0,
      cooldown_until: args.cooldown_until,
      failure_reason: args.failure_reason,
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
      delivery_status: message.delivery_status,
      retry_count: message.retry_count,
      cooldown_until: message.cooldown_until,
      failure_reason: message.failure_reason,
      created_at: message.created_at,
    }
  },
})

// Update delivery status for a message
export const updateDeliveryStatus = mutation({
  args: {
    message_id: v.string(),
    delivery_status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    ),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query('chatMessages')
      .withIndex('by_uuid', (q) => q.eq('id', args.message_id))
      .unique()
    if (!message) throw new Error('Message not found')

    await ctx.db.patch(message._id, {
      delivery_status: args.delivery_status,
      ...(args.retry_count !== undefined && { retry_count: args.retry_count }),
      ...(args.cooldown_until !== undefined && { cooldown_until: args.cooldown_until }),
      ...(args.failure_reason !== undefined && { failure_reason: args.failure_reason }),
    })

    const updated = await ctx.db.get(message._id)
    if (!updated) throw new Error('Failed to update message')

    return {
      id: updated.id,
      chat_id: updated.chat_id,
      author: updated.author,
      content: updated.content,
      run_id: updated.run_id,
      session_key: updated.session_key,
      is_automated: updated.is_automated ? 1 : 0,
      delivery_status: updated.delivery_status,
      retry_count: updated.retry_count,
      cooldown_until: updated.cooldown_until,
      failure_reason: updated.failure_reason,
      created_at: updated.created_at,
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
      delivery_status: v.optional(v.union(
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("processing"),
        v.literal("responded"),
        v.literal("failed"),
      )),
      retry_count: v.optional(v.number()),
      cooldown_until: v.optional(v.number()),
      failure_reason: v.optional(v.string()),
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
      delivery_status: m.delivery_status,
      retry_count: m.retry_count,
      cooldown_until: m.cooldown_until,
      failure_reason: m.failure_reason,
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

// ============================================
// Message Recovery and Retry
// ============================================

// Retry a failed message
export const retryMessage = mutation({
  args: {
    message_id: v.string(),
  },
  returns: v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query('chatMessages')
      .withIndex('by_uuid', (q) => q.eq('id', args.message_id))
      .unique()
    if (!message) throw new Error('Message not found')

    const currentRetryCount = message.retry_count ?? 0
    const maxRetries = 3

    if (currentRetryCount >= maxRetries) {
      throw new Error('Maximum retry attempts exceeded')
    }

    // Reset to "sent" and increment retry count
    await ctx.db.patch(message._id, {
      delivery_status: "sent",
      retry_count: currentRetryCount + 1,
      failure_reason: undefined, // Clear previous failure reason
      cooldown_until: undefined, // Clear cooldown
    })

    const updated = await ctx.db.get(message._id)
    if (!updated) throw new Error('Failed to retry message')

    return {
      id: updated.id,
      chat_id: updated.chat_id,
      author: updated.author,
      content: updated.content,
      run_id: updated.run_id,
      session_key: updated.session_key,
      is_automated: updated.is_automated ? 1 : 0,
      delivery_status: updated.delivery_status,
      retry_count: updated.retry_count,
      cooldown_until: updated.cooldown_until,
      failure_reason: updated.failure_reason,
      created_at: updated.created_at,
    }
  },
})

// Get messages that have been stuck for longer than the threshold
export const getStuckMessages = query({
  args: {
    age_threshold_ms: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
    age_ms: v.number(),
  })),
  handler: async (ctx, args) => {
    const now = Date.now()
    const threshold = now - args.age_threshold_ms
    const limit = args.limit ?? 100

    // Get messages in transitional states that are older than threshold
    const [sentMessages, deliveredMessages, processingMessages] = await Promise.all([
      ctx.db
        .query('chatMessages')
        .withIndex('by_delivery_status', (q) => q.eq('delivery_status', 'sent'))
        .filter((q) => q.lt(q.field('created_at'), threshold))
        .take(Math.floor(limit / 3)),
      ctx.db
        .query('chatMessages')
        .withIndex('by_delivery_status', (q) => q.eq('delivery_status', 'delivered'))
        .filter((q) => q.lt(q.field('created_at'), threshold))
        .take(Math.floor(limit / 3)),
      ctx.db
        .query('chatMessages')
        .withIndex('by_delivery_status', (q) => q.eq('delivery_status', 'processing'))
        .filter((q) => q.lt(q.field('created_at'), threshold))
        .take(Math.floor(limit / 3)),
    ])

    const allMessages = [...sentMessages, ...deliveredMessages, ...processingMessages]
      .filter(msg => msg.author !== "ada") // Only human messages can get stuck
      .map(m => ({
        id: m.id,
        chat_id: m.chat_id,
        author: m.author,
        content: m.content,
        run_id: m.run_id,
        session_key: m.session_key,
        is_automated: m.is_automated ? 1 : 0,
        delivery_status: m.delivery_status,
        retry_count: m.retry_count,
        cooldown_until: m.cooldown_until,
        failure_reason: m.failure_reason,
        created_at: m.created_at,
        age_ms: now - m.created_at,
      }))
      .sort((a, b) => a.created_at - b.created_at) // Oldest first

    return allMessages.slice(0, limit)
  },
})

// Mark multiple messages as failed (for bulk recovery)
export const markMessagesAsFailed = mutation({
  args: {
    message_ids: v.array(v.string()),
    failure_reason: v.string(),
  },
  returns: v.object({
    updated_count: v.number(),
    failed_ids: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    let updated_count = 0
    const failed_ids: string[] = []

    for (const message_id of args.message_ids) {
      try {
        const message = await ctx.db
          .query('chatMessages')
          .withIndex('by_uuid', (q) => q.eq('id', message_id))
          .unique()
        
        if (message) {
          await ctx.db.patch(message._id, {
            delivery_status: "failed",
            failure_reason: args.failure_reason,
          })
          updated_count++
        } else {
          failed_ids.push(message_id)
        }
      } catch {
        failed_ids.push(message_id)
      }
    }

    return {
      updated_count,
      failed_ids,
    }
  },
})

// Add a system message to a chat (for recovery notifications)
export const addSystemMessage = mutation({
  args: {
    chat_id: v.string(),
    content: v.string(),
  },
  returns: v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = generateId()

    const internalId = await ctx.db.insert('chatMessages', {
      id,
      chat_id: args.chat_id,
      author: "system",
      content: args.content,
      is_automated: true,
      delivery_status: undefined, // System messages don't need delivery tracking
      retry_count: 0,
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
    if (!message) throw new Error('Failed to create system message')

    return {
      id: message.id,
      chat_id: message.chat_id,
      author: message.author,
      content: message.content,
      run_id: message.run_id,
      session_key: message.session_key,
      is_automated: message.is_automated ? 1 : 0,
      delivery_status: message.delivery_status,
      retry_count: message.retry_count,
      cooldown_until: message.cooldown_until,
      failure_reason: message.failure_reason,
      created_at: message.created_at,
    }
  },
})

// Get messages by delivery status (for restart resilience)
export const getMessagesByDeliveryStatus = query({
  args: {
    delivery_status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    id: v.string(),
    chat_id: v.string(),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.number()),
    delivery_status: v.optional(v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("processing"),
      v.literal("responded"),
      v.literal("failed"),
    )),
    retry_count: v.optional(v.number()),
    cooldown_until: v.optional(v.number()),
    failure_reason: v.optional(v.string()),
    created_at: v.number(),
  })),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_delivery_status', (q) => q.eq('delivery_status', args.delivery_status))
      .order('desc')
      .take(limit)

    return messages.map((m) => ({
      id: m.id,
      chat_id: m.chat_id,
      author: m.author,
      content: m.content,
      run_id: m.run_id,
      session_key: m.session_key,
      is_automated: m.is_automated ? 1 : 0,
      delivery_status: m.delivery_status,
      retry_count: m.retry_count,
      cooldown_until: m.cooldown_until,
      failure_reason: m.failure_reason,
      created_at: m.created_at,
    }))
  },
})

// Get the latest human message in a chat (for status tracking)
export const getLatestHumanMessage = query({
  args: {
    chat_id: v.string(),
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
      delivery_status: v.optional(v.union(
        v.literal("sent"),
        v.literal("delivered"),
        v.literal("processing"),
        v.literal("responded"),
        v.literal("failed"),
      )),
      retry_count: v.optional(v.number()),
      cooldown_until: v.optional(v.number()),
      failure_reason: v.optional(v.string()),
      created_at: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Find the most recent message where author is not "ada" (human message)
    const message = await ctx.db
      .query('chatMessages')
      .withIndex('by_chat', (q) => q.eq('chat_id', args.chat_id))
      .filter((q) => q.neq(q.field('author'), 'ada'))
      .order('desc')
      .first()

    if (!message) return null

    return {
      id: message.id,
      chat_id: message.chat_id,
      author: message.author,
      content: message.content,
      run_id: message.run_id,
      session_key: message.session_key,
      is_automated: message.is_automated ? 1 : 0,
      delivery_status: message.delivery_status,
      retry_count: message.retry_count,
      cooldown_until: message.cooldown_until,
      failure_reason: message.failure_reason,
      created_at: message.created_at,
    }
  },
})
