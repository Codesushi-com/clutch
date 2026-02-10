import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { 
  params: Promise<{ id: string; messageId: string }> 
}

// PATCH /api/chats/[id]/messages/[messageId]/status — Update message delivery status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id, messageId } = await params
  const body = await request.json()
  
  const { delivery_status, retry_count, cooldown_until, failure_reason } = body
  
  if (!delivery_status) {
    return NextResponse.json(
      { error: "delivery_status is required" },
      { status: 400 }
    )
  }

  const validStatuses = ["sent", "delivered", "processing", "responded", "failed"]
  if (!validStatuses.includes(delivery_status)) {
    return NextResponse.json(
      { error: `delivery_status must be one of: ${validStatuses.join(", ")}` },
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

    // Update the message delivery status with optional retry/cooldown fields
    const updatedMessage = await convex.mutation(api.chats.updateDeliveryStatus, {
      message_id: messageId,
      delivery_status,
      ...(retry_count !== undefined && { retry_count }),
      ...(cooldown_until !== undefined && { cooldown_until }),
      ...(failure_reason !== undefined && { failure_reason }),
    })

    return NextResponse.json({ 
      message: updatedMessage,
      success: true 
    })
  } catch (error) {
    console.error("[Message Status API] Error updating delivery status:", error)
    
    // Handle specific error cases
    if (error instanceof Error && error.message === "Message not found") {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to update message status" },
      { status: 500 }
    )
  }
}