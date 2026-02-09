import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id]/messages — Get messages (paginated)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
  const before = searchParams.get("before")
  
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

    // Get the created_at timestamp for cursor pagination if 'before' is provided
    let beforeTimestamp: number | undefined
    if (before) {
      // We need to fetch the message to get its created_at
      // Since we don't have a direct getMessageById, we'll use the messages query
      // This is a simplification - the Convex query handles the cursor internally
      const beforeMsg = await convex.query(api.chats.getMessages, {
        chatId: id,
        limit: 100,
      })
      const targetMsg = beforeMsg.messages.find(m => m.id === before)
      if (targetMsg) {
        beforeTimestamp = targetMsg.created_at
      }
    }

    const result = await convex.query(api.chats.getMessages, {
      chatId: id,
      limit,
      ...(beforeTimestamp && { before: beforeTimestamp }),
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

    // Check for duplicate run_id to prevent double messages from backend event handler
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
      ...(run_id && { run_id }),
      ...(session_key && { session_key }),
      is_automated: is_automated ? true : false,
    })

    // Note: No need to broadcast via SSE - Convex handles reactivity

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error("[Messages API] Error creating message:", error)
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 }
    )
  }
}
