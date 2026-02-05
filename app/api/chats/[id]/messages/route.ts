import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { ChatMessage } from "@/lib/db/types"
import { broadcastToChat } from "@/lib/sse/connections"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id]/messages — Get messages (paginated)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
  const before = searchParams.get("before") // Message ID to paginate before
  
  // Verify chat exists
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(id)
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 }
    )
  }

  let query = `
    SELECT * FROM chat_messages 
    WHERE chat_id = ?
  `
  const queryParams: (string | number)[] = [id]
  
  if (before) {
    // Get the created_at of the 'before' message for cursor pagination
    const beforeMsg = db.prepare(
      "SELECT created_at FROM chat_messages WHERE id = ?"
    ).get(before) as { created_at: number } | undefined
    
    if (beforeMsg) {
      query += " AND created_at < ?"
      queryParams.push(beforeMsg.created_at)
    }
  }
  
  query += " ORDER BY created_at DESC LIMIT ?"
  queryParams.push(limit)
  
  const messages = db.prepare(query).all(...queryParams) as ChatMessage[]
  
  // Reverse to chronological order
  messages.reverse()
  
  // Check if there are more messages
  const hasMore = messages.length === limit

  return NextResponse.json({ 
    messages, 
    hasMore,
    cursor: messages.length > 0 ? messages[0].id : null,
  })
}

// POST /api/chats/[id]/messages — Send message
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  
  const { content, author = "dan", run_id, session_key, is_automated } = body
  
  if (!content) {
    return NextResponse.json(
      { error: "Content is required" },
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

  // Check for duplicate run_id to prevent double messages from OpenClaw WebSocket
  if (run_id) {
    const existing = db.prepare("SELECT id FROM chat_messages WHERE run_id = ?").get(run_id)
    if (existing) {
      console.log(`[Messages] Skipping duplicate message with run_id: ${run_id}`)
      return NextResponse.json(
        { error: "Message already exists" },
        { status: 409 }
      )
    }
  }

  const now = Date.now()
  const messageId = crypto.randomUUID()
  
  const message: ChatMessage = {
    id: messageId,
    chat_id: id,
    author,
    content,
    run_id: run_id || null,
    session_key: session_key || null,
    is_automated: is_automated ? 1 : 0,
    created_at: now,
  }

  db.prepare(`
    INSERT INTO chat_messages (id, chat_id, author, content, run_id, session_key, is_automated, created_at)
    VALUES (@id, @chat_id, @author, @content, @run_id, @session_key, @is_automated, @created_at)
  `).run(message)

  // Update chat's updated_at
  db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, id)

  // Broadcast new message to SSE subscribers
  broadcastToChat(id, {
    type: "message",
    data: message,
  })

  return NextResponse.json({ message }, { status: 201 })
}
