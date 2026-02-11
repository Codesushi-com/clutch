import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id]/oldest-delivered-message — Get the oldest message with "delivered" status (FIFO)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
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

    // Get the oldest message with "delivered" status
    const message = await convex.query(api.chats.getOldestDeliveredMessage, {
      chat_id: id,
    })

    return NextResponse.json({ 
      message: message,
      chat_id: id 
    })
  } catch (error) {
    console.error("[Oldest Delivered Message API] Error fetching message:", error)
    return NextResponse.json(
      { error: "Failed to fetch oldest delivered message" },
      { status: 500 }
    )
  }
}