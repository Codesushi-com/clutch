import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import type { Chat, ChatMessage } from '../lib/db/types'
import type { Id } from './_generated/server'

// ============================================
// Type Helpers
// ============================================

function toChat(doc: {
  _id: string
  _creationTime: number
  project_id: string
  title: string
  participants?: string[]
  session_key?: string
  created_at: number
  updated_at: number
}): Chat {
  return {
    id: doc._id,
    project_id: doc.project_id,
    title: doc.title,
    participants: doc.participants ? JSON.stringify(doc.participants) : null,
    session_key: doc.session_key ?? null,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  }
}

function toChatMessage(doc: {
  _id: string
  _creationTime: number
  chat_id: string
  author: string
  content: string
  run_id?: string
  session_key?: string
  is_automated?: boolean
  created_at: number
}): ChatMessage {
  return {
    id: doc._id,
    chat_id: doc.chat_id,
    author: doc.author,
    content: doc.content,
    run_id: doc.run_id ?? null,
    session_key: doc.session_key ?? null,
    is_automated: doc.is_automated ? 1 : 0,
    created_at: doc.created_at,
  }
}

// Chat with last message info for list views
export interface ChatWithLastMessage extends Chat {
  lastMessage?: {
    content: string
    author: string
    created_at: number
  }
}

// ============================================
// Queries
// ============================================

/**
 * Get all chats for a project, ordered by most recent activity
 * Includes last message preview for each chat
 */
export const getByProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args): Promise<ChatWithLastMessage[]> => {
    // Get chats for project
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_project', (q) => q.eq('project_id', args.projectId))
      .order('desc')
      .collect()

    // For each chat, get the last message
    const result: ChatWithLastMessage[] = []
    
    for (const chat of chats) {
      const chatDoc = chat as {
        _id: string
        _creationTime: number
        project_id: string
        title: string
        participants?: string[]
        session_key?: string
        created_at: number
        updated_at: number
      }

      // Get most recent message
      const messages = await ctx.db
        .query('chatMessages')
        .withIndex('by_chat', (q) => q.eq('chat_id', chatDoc._id))
        .order('desc')
        .take(1)

      const lastMessage = messages[0] as {
        content: string
        author: string
        created_at: number
      } | undefined

      result.push({
        ...toChat(chatDoc),
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              author: lastMessage.author,
              created_at: lastMessage.created_at,
            }
          : undefined,
      })
    }

    // Sort by most recent activity (last message or chat creation)
    result.sort((a, b) => {
      const aTime = a.lastMessage?.created_at ?? a.updated_at
      const bTime = b.lastMessage?.created_at ?? b.updated_at
      return bTime - aTime
    })

    return result
  },
})

/**
 * Get a single chat by ID
 */
export const getById = query({
  args: {
    id: v.id('chats'),
  },
  handler: async (ctx, args): Promise<Chat | null> => {
    const chat = await ctx.db.get(args.id)
    if (!chat) return null
    return toChat(chat as Parameters<typeof toChat>[0])
  },
})

/**
 * Get a chat with all its messages
 * Messages are ordered by created_at ASC (oldest first)
 */
export const getWithMessages = query({
  args: {
    id: v.id('chats'),
  },
  handler: async (ctx, args): Promise<{ chat: Chat; messages: ChatMessage[] } | null> => {
    const chat = await ctx.db.get(args.id)
    if (!chat) return null

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_chat', (q) => q.eq('chat_id', args.id))
      .order('asc')
      .collect()

    return {
      chat: toChat(chat as Parameters<typeof toChat>[0]),
      messages: messages.map((m) => toChatMessage(m as Parameters<typeof toChatMessage>[0])),
    }
  },
})

/**
 * Get messages for a chat with optional pagination
 * Returns messages in chronological order (oldest first)
 */
export const getMessages = query({
  args: {
    chatId: v.id('chats'),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ChatMessage[]> => {
    const limit = args.limit ?? 50

    let messages
    
    if (args.before) {
      // Get messages before a specific timestamp
      const allMessages = await ctx.db
        .query('chatMessages')
        .withIndex('by_chat', (q) => q.eq('chat_id', args.chatId))
        .order('desc')
        .filter((q) => q.lt('created_at', args.before as unknown as string))
        .take(limit)
      
      messages = allMessages.reverse()
    } else {
      // Get most recent messages
      const allMessages = await ctx.db
        .query('chatMessages')
        .withIndex('by_chat', (q) => q.eq('chat_id', args.chatId))
        .order('desc')
        .take(limit)
      
      messages = allMessages.reverse()
    }

    return messages.map((m) => toChatMessage(m as Parameters<typeof toChatMessage>[0]))
  },
})

// ============================================
// Mutations
// ============================================

/**
 * Create a new chat
 */
export const create = mutation({
  args: {
    project_id: v.id('projects'),
    title: v.optional(v.string()),
    participants: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Chat> => {
    // Verify project exists
    const project = await ctx.db.get(args.project_id)
    if (!project) {
      throw new Error(`Project not found: ${args.project_id}`)
    }

    // Auto-generate title if none provided
    const chatTitle =
      args.title?.trim() ||
      `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`

    const now = Date.now()

    const chatId = await ctx.db.insert('chats', {
      project_id: args.project_id,
      title: chatTitle,
      participants: args.participants ?? ['ada'],
      created_at: now,
      updated_at: now,
    })

    const chat = await ctx.db.get(chatId)
    if (!chat) {
      throw new Error('Failed to create chat')
    }

    return toChat(chat as Parameters<typeof toChat>[0])
  },
})

/**
 * Update a chat (title or session_key)
 */
export const update = mutation({
  args: {
    id: v.id('chats'),
    title: v.optional(v.string()),
    session_key: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Chat> => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      throw new Error(`Chat not found: ${args.id}`)
    }

    const updates: { updated_at: number; title?: string; session_key?: string | null } = {
      updated_at: Date.now(),
    }

    if (args.title !== undefined) updates.title = args.title.trim()
    if (args.session_key !== undefined) updates.session_key = args.session_key

    await ctx.db.patch(args.id, updates)

    const updated = await ctx.db.get(args.id)
    if (!updated) {
      throw new Error('Failed to update chat')
    }

    return toChat(updated as Parameters<typeof toChat>[0])
  },
})

/**
 * Delete a chat and all its messages
 */
export const deleteChat = mutation({
  args: {
    id: v.id('chats'),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      throw new Error(`Chat not found: ${args.id}`)
    }

    // Delete all messages for this chat
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_chat', (q) => q.eq('chat_id', args.id))
      .collect()

    for (const message of messages) {
      await ctx.db.delete((message as { _id: Id<'chatMessages'> })._id)
    }

    // Delete the chat
    await ctx.db.delete(args.id)

    return { success: true }
  },
})

/**
 * Add a message to a chat
 * Updates the chat's updated_at timestamp
 */
export const addMessage = mutation({
  args: {
    chat_id: v.id('chats'),
    author: v.string(),
    content: v.string(),
    run_id: v.optional(v.string()),
    session_key: v.optional(v.string()),
    is_automated: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ChatMessage> => {
    // Verify chat exists
    const chat = await ctx.db.get(args.chat_id)
    if (!chat) {
      throw new Error(`Chat not found: ${args.chat_id}`)
    }

    const now = Date.now()

    const messageId = await ctx.db.insert('chatMessages', {
      chat_id: args.chat_id,
      author: args.author,
      content: args.content,
      run_id: args.run_id ?? null,
      session_key: args.session_key ?? null,
      is_automated: args.is_automated ?? false,
      created_at: now,
    })

    // Update chat's updated_at
    await ctx.db.patch(args.chat_id, { updated_at: now })

    const message = await ctx.db.get(messageId)
    if (!message) {
      throw new Error('Failed to create message')
    }

    return toChatMessage(message as Parameters<typeof toChatMessage>[0])
  },
})

/**
 * Find chat by session key
 */
export const findBySessionKey = query({
  args: {
    sessionKey: v.string(),
  },
  handler: async (ctx, args): Promise<Chat | null> => {
    const chat = await ctx.db
      .query('chats')
      .withIndex('by_project', (q) => q.eq('project_id', '')) // Dummy index usage
      .filter((q) => q.eq('session_key', args.sessionKey))
      .unique()

    if (!chat) return null
    return toChat(chat as Parameters<typeof toChat>[0])
  },
})
