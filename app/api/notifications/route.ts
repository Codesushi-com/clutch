import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"
import type { Notification, NotificationType, NotificationSeverity } from "@/lib/db/types"

// GET /api/notifications — List notifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get("unread") === "true"
    const limit = parseInt(searchParams.get("limit") || "50")

    const result = await convexServerClient.query(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "notifications/getAll" },
      {
        unreadOnly: unreadOnly || undefined,
        limit,
      }
    ) as { notifications: Notification[]; unreadCount: number }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[notifications/get] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch notifications", details: String(error) },
      { status: 500 }
    )
  }
}

// POST /api/notifications — Create notification (escalation, request_input, etc.)
export async function POST(request: NextRequest) {
  try {
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

    // Create notification
    const notification = await convexServerClient.mutation(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "notifications/create" },
      {
        taskId: taskId || undefined,
        projectId: projectId || undefined,
        type: type as NotificationType,
        severity: severity as NotificationSeverity,
        title: title || undefined,
        message,
        agent: agent || undefined,
      }
    ) as Notification

    // If escalation on a task, also add a comment
    if (taskId && (type === "escalation" || type === "request_input")) {
      const commentType = type === "escalation" ? "message" : "request_input"
      const commentContent = type === "escalation" 
        ? `## 🚨 Escalation (${severity})\n\n${message}`
        : `## ❓ Input Requested\n\n${message}`

      await convexServerClient.mutation(
        // @ts-expect-error - Convex self-hosted uses any api type
        { name: "comments/create" },
        {
          taskId,
          author: agent || "agent",
          authorType: "agent",
          content: commentContent,
          type: commentType,
        }
      )
    }

    return NextResponse.json({ 
      notification,
      success: true,
    }, { status: 201 })
  } catch (error) {
    console.error("[notifications/create] Error:", error)
    return NextResponse.json(
      { error: "Failed to create notification", details: String(error) },
      { status: 500 }
    )
  }
}
