import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { broadcastToChat } from "@/lib/sse/connections"
import type { Id } from "@/convex/_generated/server"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id]/messages — Get messages (paginated)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
  const before = searchParams.get("before")
    ? parseInt(searchParams.get("before")!)
    : undefined

  try {
    // Verify chat exists
    const chat = await convexServerClient.query(api.chats.getById, {
      id: id as Id<"chats">,
    })

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    const messages = await convexServerClient.query(api.chats.getMessages, {
      chatId: id as Id<"chats">,
      limit,
      before,
    })

    // Check if there are more messages
    const hasMore = messages.length === limit

    return NextResponse.json({
      messages,
      hasMore,
      cursor: messages.length > 0 ? messages[0].id : null,
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
    // Verify chat exists
    const chat = await convexServerClient.query(api.chats.getById, {
      id: id as Id<"chats">,
    })

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      )
    }

    // Note: Duplicate run_id check is not implemented in Convex version
    // The UI layer handles this, and Convex mutations are idempotent by nature

    const message = await convexServerClient.mutation(api.chats.addMessage, {
      chat_id: id as Id<"chats">,
      author,
      content,
      run_id: run_id || undefined,
      session_key: session_key || undefined,
      is_automated: is_automated || false,
    })

    // Broadcast new message to SSE subscribers
    broadcastToChat(id, {
      type: "message",
      data: message,
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error("[Messages API] Error sending message:", error)
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    )
  }
}
