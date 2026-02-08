import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/triage/escalate — Escalate to human for review
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { task_id, actor, reason } = body

  if (!task_id) {
    return NextResponse.json(
      { error: "task_id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    // Get the current task
    const result = await convex.query(api.tasks.getById, { id: task_id })
    if (!result) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    const { task } = result

    // Set escalated flag on task
    await convex.mutation(api.tasks.update, {
      id: task_id,
      escalated: true,
      escalated_at: Date.now(),
    })

    // Set triage_acked_at to acknowledge the triage
    await convex.mutation(api.tasks.update, {
      id: task_id,
      triage_acked_at: Date.now(),
    })

    // Create notification for Dan
    await convex.mutation(api.notifications.create, {
      taskId: task_id,
      projectId: task.project_id,
      type: "escalation",
      severity: "critical",
      title: `🚨 Escalated: ${task.title}`,
      message: reason || "Manually escalated by Ada",
    })

    // Add a comment documenting the escalation
    await convex.mutation(api.comments.create, {
      taskId: task_id,
      author: actor || "ada",
      authorType: "agent",
      content: `Task escalated to Dan for human review. Reason: ${reason || "Not specified"}`,
      type: "message",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Triage Escalate API] Error:", error)
    return NextResponse.json(
      { error: message || "Failed to escalate task" },
      { status: 500 }
    )
  }
}
