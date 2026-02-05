import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { broadcastToChat } from "@/lib/sse/connections"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id]/messages — Get messages (paginated)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
  const before = searchParams.get("before") // Message ID to paginate before

  try {
    const convex = getConvexClient()

    // Verify chat exists
    const chat = await convex.query(api.chats.getById, { id })
    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    // Get the created_at of the 'before' message for cursor pagination
    let beforeTimestamp: number | undefined
    if (before) {
      // Note: We'd need a getMessageById query for proper cursor pagination
      // For now, we'll pass the before as a timestamp if it's numeric
      const parsed = parseInt(before)
      if (!isNaN(parsed)) {
        beforeTimestamp = parsed
      }
    }

    const result = await convex.query(api.chats.getMessages, {
      chatId: id,
      limit,
      before: beforeTimestamp,
    })

    return NextResponse.json({
      messages: result.messages,
      hasMore: result.hasMore,
      cursor: result.messages.length > 0 ? result.messages[0].id : null,
    })
  } catch (error) {
    console.error("[Messages API] Error fetching messages:", error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }
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

  try {
    const convex = getConvexClient()

    // Verify chat exists
    const chat = await convex.query(api.chats.getById, { id })
    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    // Check for duplicate run_id to prevent double messages from OpenClaw WebSocket
    if (run_id) {
      const existing = await convex.query(api.chats.getMessageByRunId, { runId: run_id })
      if (existing) {
        console.log(`[Messages] Skipping duplicate message with run_id: ${run_id}`)
        return NextResponse.json(
          { error: "Message already exists" },
          { status: 409 }
        )
      }
    }

    const message = await convex.mutation(api.chats.createMessage, {
      chat_id: id,
      author,
      content,
      run_id,
      session_key,
      is_automated,
    })

    // Broadcast new message to SSE subscribers
    broadcastToChat(id, {
      type: "message",
      data: message,
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error("[Messages API] Error creating message:", error)
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 }
    )
  }
}