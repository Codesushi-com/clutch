// Chat query helpers
import { db } from "@/lib/db"
import type { Chat, ChatMessage } from "@/lib/db/types"

/**
 * Get all chats for a project, ordered by most recent activity
 * Includes last message preview for each chat
 */
export function getByProject(projectId: string): Array<Chat & { lastMessage?: { content: string; author: string; created_at: number } }> {
  const rows = db.prepare(`
    SELECT 
      c.*,
      m.content as last_message_content,
      m.author as last_message_author,
      m.created_at as last_message_at
    FROM chats c
    LEFT JOIN (
      SELECT chat_id, content, author, created_at
      FROM chat_messages
      WHERE id IN (
        SELECT id FROM chat_messages cm2 
        WHERE cm2.chat_id = chat_messages.chat_id 
        ORDER BY created_at DESC LIMIT 1
      )
    ) m ON m.chat_id = c.id
    WHERE c.project_id = ?
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
  `).all(projectId) as Array<Chat & { 
    last_message_content: string | null
    last_message_author: string | null
    last_message_at: number | null 
  }>
  
  return rows.map(chat => ({
    ...chat,
    lastMessage: chat.last_message_content ? {
      content: chat.last_message_content,
      author: chat.last_message_author!,
      created_at: chat.last_message_at!,
    } : undefined,
  }))
}

/**
 * Get a single chat by ID (without messages)
 */
export function getById(chatId: string): Chat | undefined {
  return db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as Chat | undefined
}

/**
 * Get a chat with all its messages
 * Messages are ordered by created_at ASC (oldest first)
 */
export function getWithMessages(chatId: string): { chat: Chat; messages: ChatMessage[] } | undefined {
  const chat = getById(chatId)
  if (!chat) {
    return undefined
  }
  
  const messages = db.prepare(`
    SELECT * FROM chat_messages 
    WHERE chat_id = ? 
    ORDER BY created_at ASC
  `).all(chatId) as ChatMessage[]
  
  return { chat, messages }
}

/**
 * Get messages for a chat with optional pagination
 * Returns messages in chronological order (oldest first)
 */
export function getMessages(
  chatId: string,
  options: { limit?: number; before?: number } = {}
): ChatMessage[] {
  const { limit = 50, before } = options
  
  let query = `
    SELECT * FROM chat_messages 
    WHERE chat_id = ?
  `
  const params: (string | number)[] = [chatId]
  
  if (before) {
    query += " AND created_at < ?"
    params.push(before)
  }
  
  query += " ORDER BY created_at DESC LIMIT ?"
  params.push(limit)
  
  const messages = db.prepare(query).all(...params) as ChatMessage[]
  
  // Reverse to chronological order
  messages.reverse()
  
  return messages
}

/**
 * Create a new chat
 */
export function create(
  projectId: string,
  title: string,
  options: {
    participants?: string[]
    sessionKey?: string | null
  } = {}
): Chat {
  const { participants = ["ada"], sessionKey = null } = options
  
  const now = Date.now()
  const id = crypto.randomUUID()
  
  const chat: Chat = {
    id,
    project_id: projectId,
    title,
    participants: JSON.stringify(participants),
    session_key: sessionKey,
    created_at: now,
    updated_at: now,
  }
  
  db.prepare(`
    INSERT INTO chats (id, project_id, title, participants, session_key, created_at, updated_at)
    VALUES (@id, @project_id, @title, @participants, @session_key, @created_at, @updated_at)
  `).run(chat)
  
  return chat
}

/**
 * Add a message to a chat
 * Updates the chat's updated_at timestamp
 */
export function addMessage(
  chatId: string,
  author: string,
  content: string,
  options: {
    runId?: string | null
    sessionKey?: string | null
    isAutomated?: boolean
  } = {}
): ChatMessage {
  const { runId = null, sessionKey = null, isAutomated = false } = options
  
  const now = Date.now()
  const id = crypto.randomUUID()
  
  const message: ChatMessage = {
    id,
    chat_id: chatId,
    author,
    content,
    run_id: runId,
    session_key: sessionKey,
    is_automated: isAutomated ? 1 : 0,
    created_at: now,
  }
  
  // Insert message
  db.prepare(`
    INSERT INTO chat_messages (id, chat_id, author, content, run_id, session_key, is_automated, created_at)
    VALUES (@id, @chat_id, @author, @content, @run_id, @session_key, @is_automated, @created_at)
  `).run(message)
  
  // Update chat's updated_at
  db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, chatId)
  
  return message
}

/**
 * Update a chat's title or session_key
 */
export function update(
  chatId: string,
  updates: { title?: string; sessionKey?: string | null }
): Chat | undefined {
  const sets: string[] = []
  const values: (string | number | null)[] = []
  
  if (updates.title !== undefined) {
    sets.push("title = ?")
    values.push(updates.title)
  }
  
  if (updates.sessionKey !== undefined) {
    sets.push("session_key = ?")
    values.push(updates.sessionKey)
  }
  
  if (sets.length === 0) {
    return getById(chatId)
  }
  
  sets.push("updated_at = ?")
  values.push(Date.now())
  values.push(chatId)
  
  db.prepare(`UPDATE chats SET ${sets.join(", ")} WHERE id = ?`).run(...values)
  
  return getById(chatId)
}

/**
 * Delete a chat (cascade deletes messages)
 */
export function deleteChat(chatId: string): boolean {
  const result = db.prepare("DELETE FROM chats WHERE id = ?").run(chatId)
  return result.changes > 0
}

/**
 * Find chat by session key
 */
export function findBySessionKey(sessionKey: string): Chat | undefined {
  return db.prepare("SELECT * FROM chats WHERE session_key = ?").get(sessionKey) as Chat | undefined
}
