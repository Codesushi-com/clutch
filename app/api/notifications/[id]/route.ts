import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"
import type { Notification } from "@/lib/db/types"

type RouteContext = {
  params: Promise<{ id: string }>
}

// PATCH /api/notifications/:id — Update notification (mark read)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    if (body.read !== undefined) {
      const notification = await convexServerClient.mutation(
        // @ts-expect-error - Convex self-hosted uses any api type
        { name: "notifications/markRead" },
        {
          id,
          read: Boolean(body.read),
        }
      ) as Notification

      return NextResponse.json({ notification })
    }

    // If no read field, just return the notification
    const notification = await convexServerClient.query(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "notifications/getById" },
      { id }
    ) as Notification | null

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    return NextResponse.json({ notification })
  } catch (error) {
    console.error("[notifications/patch] Error:", error)
    
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to update notification", details: String(error) },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/:id — Delete notification
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    await convexServerClient.mutation(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "notifications/deleteNotification" },
      { id }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[notifications/delete] Error:", error)
    
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to delete notification", details: String(error) },
      { status: 500 }
    )
  }
}
