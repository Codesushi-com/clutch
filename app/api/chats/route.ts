import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Chat, ChatMessage } from "@/lib/db/types"

// GET /api/chats?projectId=xxx — List chats for project
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")
  
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    )
  }

  // Get chats with last message
  const chats = db.prepare(`
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
  `).all(projectId) as (Chat & { 
    last_message_content: string | null
    last_message_author: string | null
    last_message_at: number | null 
  })[]

  // Transform to include lastMessage object
  const result = chats.map(chat => ({
    ...chat,
    lastMessage: chat.last_message_content ? {
      content: chat.last_message_content,
      author: chat.last_message_author,
      created_at: chat.last_message_at,
    } : null,
  }))

  return NextResponse.json({ chats: result })
}

// POST /api/chats — Create new chat
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const { project_id, title, participants = ["ada"] } = body
  
  if (!project_id) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    )
  }

  // Auto-generate title if none provided
  const chatTitle = title?.trim() || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`

  // Verify project exists
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(project_id)
  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    )
  }

  const now = Date.now()
  const id = crypto.randomUUID()
  
  const chat: Chat = {
    id,
    project_id,
    title: chatTitle,
    participants: JSON.stringify(participants),
    session_key: null, // Will be set when first message is sent
    created_at: now,
    updated_at: now,
  }

  db.prepare(`
    INSERT INTO chats (id, project_id, title, participants, session_key, created_at, updated_at)
    VALUES (@id, @project_id, @title, @participants, @session_key, @created_at, @updated_at)
  `).run(chat)

  return NextResponse.json({ chat }, { status: 201 })
}

// PATCH /api/chats — Update chat (supports title and session_key)
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  
  const { id, title, session_key } = body
  
  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    )
  }

  if (!title?.trim() && !session_key) {
    return NextResponse.json(
      { error: "title or session_key is required" },
      { status: 400 }
    )
  }

  // Verify chat exists
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(id)
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 }
    )
  }

  const now = Date.now()
  
  // Build dynamic update query based on provided fields
  const updateFields = []
  const values = []
  
  if (title?.trim()) {
    updateFields.push("title = ?")
    values.push(title.trim())
  }
  
  if (session_key) {
    updateFields.push("session_key = ?")
    values.push(session_key)
  }
  
  updateFields.push("updated_at = ?")
  values.push(now)
  values.push(id) // for WHERE clause
  
  db.prepare(`
    UPDATE chats 
    SET ${updateFields.join(", ")}
    WHERE id = ?
  `).run(...values)

  // Fetch the updated chat
  const updatedChat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as Chat

  return NextResponse.json({ chat: updatedChat })
}
