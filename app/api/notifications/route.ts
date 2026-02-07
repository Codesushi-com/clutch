import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/notifications — List notifications
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const unreadOnly = searchParams.get("unread") === "true"
  const limit = parseInt(searchParams.get("limit") || "50")
  
  try {
    const convex = getConvexClient()
    const result = await convex.query(api.notifications.getAll, {
      unreadOnly,
      limit,
    })
    
    return NextResponse.json({
      notifications: result.notifications,
      unreadCount: result.unreadCount,
    })
  } catch (error) {
    console.error("[Notifications API] Error fetching notifications:", error)
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    )
  }
}

// POST /api/notifications — Create notification (escalation, request_input, etc.)
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const { 
    taskId, 
    projectId,
    type = "escalation",
    severity = "info",
    title,
    message,
    agent,
  } = body
  
  if (!message) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    )
  }
  
  try {
    const convex = getConvexClient()

    const notification = await convex.mutation(api.notifications.create, {
      message,
      ...(taskId && { taskId }),
      ...(projectId && { projectId }),
      type,
      severity,
      ...(title && { title }),
      ...(agent && { agent }),
    })

    // Create comments for escalation/request_input notifications
    if (taskId && (type === 'escalation' || type === 'request_input')) {
      try {
        await convex.mutation(api.comments.create, {
          taskId,
          author: agent || 'Coordinator',
          authorType: agent ? 'agent' : 'coordinator',
          content: message,
          type: type === 'request_input' ? 'request_input' : 'status_change',
        })
      } catch (commentError) {
        // Log but don't fail the notification creation if comment fails
        console.error('[Notifications API] Failed to create comment:', commentError)
      }
    }

    return NextResponse.json({
      notification,
      success: true,
    }, { status: 201 })
  } catch (error) {
    console.error("[Notifications API] Error creating notification:", error)
    const message = error instanceof Error ? error.message : "Failed to create notification"
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
