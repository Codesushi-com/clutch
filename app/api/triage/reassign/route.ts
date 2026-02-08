import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/triage/reassign — Change role/model and move to ready
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { task_id, actor, role, agent_model } = body

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

    // Update role if provided
    if (role) {
      await convex.mutation(api.tasks.update, {
        id: task_id,
        role,
      })
    }

    // Move task to ready status
    const task = await convex.mutation(api.tasks.move, {
      id: task_id,
      status: "ready",
    })

    // Set triage_acked_at to acknowledge the triage
    await convex.mutation(api.tasks.update, {
      id: task_id,
      triage_acked_at: Date.now(),
    })

    // Add a comment documenting the reassignment
    const changes: string[] = []
    if (role) changes.push(`role: ${role}`)
    if (agent_model) changes.push(`model: ${agent_model}`)
    const changeStr = changes.length > 0 ? ` (${changes.join(", ")})` : ""

    await convex.mutation(api.comments.create, {
      taskId: task_id,
      author: actor || "ada",
      authorType: "agent",
      content: `Task reassigned and moved to ready${changeStr}.`,
      type: "message",
    })

    return NextResponse.json({ task, success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Triage Reassign API] Error:", error)
    return NextResponse.json(
      { error: message || "Failed to reassign task" },
      { status: 500 }
    )
  }
}
