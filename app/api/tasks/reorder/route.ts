import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type TaskId = Id<"tasks">

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
    // Use the reorder mutation
    const updatedTask = await convexServerClient.mutation(api.tasks.reorder, {
      id: task_id as TaskId,
      newPosition: new_index,
    })

    return NextResponse.json({ success: true, task: updatedTask })
  } catch (error) {
    console.error("Error reordering tasks:", error)

    if (error instanceof Error) {
      if (error.message.includes("Task not found")) {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      { error: "Failed to reorder tasks" },
      { status: 500 }
    )
  }
}
