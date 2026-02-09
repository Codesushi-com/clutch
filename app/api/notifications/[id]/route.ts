import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteContext = {
  params: Promise<{ id: string }>
}

// PATCH /api/notifications/:id — Update notification (mark read)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  const body = await request.json()
  
  try {
    const convex = getConvexClient()

    if (body.read !== undefined) {
      const notification = await convex.mutation(api.notifications.markRead, {
        id,
        read: body.read ? true : false,
      })
      return NextResponse.json({ notification })
    }

    // If no read field, just fetch the notification
    const notification = await convex.query(api.notifications.getById, { id })
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    return NextResponse.json({ notification })
  } catch (error) {
    console.error("[Notifications API] Error updating notification:", error)
    const message = error instanceof Error ? error.message : "Failed to update notification"
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/notifications/:id — Delete notification
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  
  try {
    const convex = getConvexClient()
    const result = await convex.mutation(api.notifications.deleteNotification, { id })
    
    if (!result.success) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Notifications API] Error deleting notification:", error)
    const message = error instanceof Error ? error.message : "Failed to delete notification"
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
