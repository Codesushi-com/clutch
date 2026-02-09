import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/triage/kill — Move task to backlog (no longer relevant)
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

    // Move task to backlog
    const task = await convex.mutation(api.tasks.move, {
      id: task_id,
      status: "backlog",
    })

    // Set triage_acked_at to acknowledge the triage
    await convex.mutation(api.tasks.update, {
      id: task_id,
      triage_acked_at: Date.now(),
    })

    // Add a comment documenting the kill action
    await convex.mutation(api.comments.create, {
      taskId: task_id,
      author: actor || "ada",
      authorType: "agent",
      content: `Task moved to backlog (killed). Reason: ${reason || "No longer relevant"}`,
      type: "message",
    })

    return NextResponse.json({ task, success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Triage Kill API] Error:", error)
    return NextResponse.json(
      { error: message || "Failed to kill task" },
      { status: 500 }
    )
  }
}
