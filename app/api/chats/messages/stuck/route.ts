import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/chats/messages/stuck — Get messages stuck in transitional delivery states
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)
  const ageThresholdMinutes = parseInt(searchParams.get("age_minutes") || "5")
  
  try {
    const convex = getConvexClient()

    // Use the new getStuckMessages query with age threshold
    const stuckMessages = await convex.query(api.chats.getStuckMessages, {
      age_threshold_ms: ageThresholdMinutes * 60 * 1000, // Convert minutes to milliseconds
      limit,
    })

    return NextResponse.json({ 
      messages: stuckMessages,
      total: stuckMessages.length,
      age_threshold_minutes: ageThresholdMinutes
    })
  } catch (error) {
    console.error("[Stuck Messages API] Error fetching stuck messages:", error)
    return NextResponse.json(
      { error: "Failed to fetch stuck messages" },
      { status: 500 }
    )
  }
}