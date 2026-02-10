import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { 
  params: Promise<{ id: string; messageId: string }> 
}

// POST /api/chats/[id]/messages/[messageId]/retry — Retry a failed message
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id, messageId } = await params
  
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

    // Retry the message (this resets delivery_status to "sent" and increments retry_count)
    const retryedMessage = await convex.mutation(api.chats.retryMessage, {
      message_id: messageId,
    })

    return NextResponse.json({ 
      message: retryedMessage,
      success: true 
    })
  } catch (error) {
    console.error("[Message Retry API] Error retrying message:", error)
    
    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message === "Message not found") {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 }
        )
      }
      if (error.message === "Maximum retry attempts exceeded") {
        return NextResponse.json(
          { error: "Maximum retry attempts exceeded. Please create a new message." },
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      { error: "Failed to retry message" },
      { status: 500 }
    )
  }
}