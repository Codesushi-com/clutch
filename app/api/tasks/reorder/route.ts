import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/tasks/reorder — Reorder tasks within a column
export async function POST(request: NextRequest) {
  const body = await request.json()

  const {
    project_id,
    status,
    task_id,
    new_index,
  } = body

  if (!project_id || !status || !task_id || new_index === undefined) {
    return NextResponse.json(
      { error: "project_id, status, task_id, and new_index are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    // Use the reorder mutation
    const task = await convex.mutation(api.tasks.reorder, {
      id: task_id,
      newPosition: new_index,
    })

    return NextResponse.json({ success: true, task })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    console.error("[Reorder API] Error reordering tasks:", error)
    return NextResponse.json(
      { error: "Failed to reorder tasks" },
      { status: 500 }
    )
  }
}
