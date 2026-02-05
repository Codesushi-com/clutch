/**
 * Chat message database operations with deduplication
 */

import Database from 'better-sqlite3'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ChatMessage, ChatMessageInsert } from './types'

// Database path - same as used by API routes
const DB_PATH = process.env.TRAP_DB_PATH || path.join(process.env.HOME || '', '.trap', 'trap.db')

function getDb() {
  return new Database(DB_PATH)
}

/**
 * Extract text content from OpenClaw message content (can be string or array)
 */
function extractContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') {
    return content
  }
  
  // Extract text from content array
  return content
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text!)
    .join('\n')
}

/**
 * Find chat ID by session key
 * Session keys have format: trap:{projectSlug}:{chatId}
 */
export function findChatBySessionKey(sessionKey: string): string | null {
  const db = getDb()
  try {
    // First, try to find a chat with this exact session_key
    const chat = db.prepare('SELECT id FROM chats WHERE session_key = ?').get(sessionKey) as { id: string } | undefined
    if (chat) {
      return chat.id
    }
    
    // Try to extract chat ID from session key format: trap:projectSlug:chatId
    const match = sessionKey.match(/^trap:[^:]+:(.+)$/)
    if (match) {
      const chatId = match[1]
      const exists = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId) as { id: string } | undefined
      if (exists) {
        // Update the chat's session_key
        db.prepare('UPDATE chats SET session_key = ? WHERE id = ?').run(sessionKey, chatId)
        return chatId
      }
    }
    
    return null
  } finally {
    db.close()
  }
}

/**
 * Save a message with deduplication via run_id
 * Returns the message ID if saved, null if duplicate
 */
export function saveMessage(
  chatId: string,
  author: string,
  content: string | Array<{ type: string; text?: string }>,
  options: {
    runId?: string | null
    sessionKey?: string | null
    isAutomated?: boolean
  } = {}
): string | null {
  const db = getDb()
  try {
    const textContent = extractContent(content)
    
    // Skip empty messages
    if (!textContent.trim()) {
      return null
    }
    
    // Check for duplicate via run_id
    if (options.runId) {
      const existing = db.prepare(
        'SELECT id FROM chat_messages WHERE chat_id = ? AND run_id = ?'
      ).get(chatId, options.runId) as { id: string } | undefined
      
      if (existing) {
        console.log('[Messages] Skipping duplicate message with run_id:', options.runId)
        return null
      }
    }
    
    // Insert the message
    const id = randomUUID()
    const now = Date.now()
    
    db.prepare(`
      INSERT INTO chat_messages (id, chat_id, author, content, run_id, session_key, is_automated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      chatId,
      author,
      textContent,
      options.runId || null,
      options.sessionKey || null,
      options.isAutomated ? 1 : 0,
      now
    )
    
    console.log('[Messages] Saved message:', { id, chatId, author, runId: options.runId })
    return id
  } finally {
    db.close()
  }
}

/**
 * Save an OpenClaw chat message event
 * Handles session key → chat ID mapping and deduplication
 */
export function saveOpenClawMessage(
  sessionKey: string,
  message: {
    role: string
    content: string | Array<{ type: string; text?: string }>
  },
  runId?: string
): string | null {
  // Find the chat for this session
  const chatId = findChatBySessionKey(sessionKey)
  
  if (!chatId) {
    console.log('[Messages] No chat found for session:', sessionKey)
    return null
  }
  
  // Map OpenClaw role to author
  const author = message.role === 'assistant' ? 'ada' : message.role
  
  return saveMessage(chatId, author, message.content, {
    runId,
    sessionKey,
    isAutomated: false
  })
}

/**
 * Get recent messages for a chat
 */
export function getMessages(chatId: string, limit: number = 50): ChatMessage[] {
  const db = getDb()
  try {
    return db.prepare(`
      SELECT * FROM chat_messages 
      WHERE chat_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(chatId, limit) as ChatMessage[]
  } finally {
    db.close()
  }
}
