import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/triage/split — Break task into subtasks
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { task_id, actor, subtasks } = body

  if (!task_id) {
    return NextResponse.json(
      { error: "task_id is required" },
      { status: 400 }
    )
  }

  if (!subtasks || !Array.isArray(subtasks) || subtasks.length === 0) {
    return NextResponse.json(
      { error: "subtasks array is required" },
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

    const { task: parentTask } = result

    // Create subtasks
    const createdSubtasks = []
    for (const subtask of subtasks) {
      const newTask = await convex.mutation(api.tasks.create, {
        project_id: parentTask.project_id,
        title: subtask.title,
        description: subtask.description,
        status: "ready",
        priority: subtask.priority || parentTask.priority,
        role: subtask.role || parentTask.role,
      })
      createdSubtasks.push(newTask)
    }

    // Move original task to done with discarded resolution (replaced by subtasks)
    await convex.mutation(api.tasks.move, {
      id: task_id,
      status: "done",
      resolution: "discarded",
    })

    // Set triage_acked_at to acknowledge the triage
    await convex.mutation(api.tasks.update, {
      id: task_id,
      triage_acked_at: Date.now(),
    })

    // Add a comment documenting the split
    const subtaskTitles = createdSubtasks.map((t) => `- ${t.title}`).join("\n")
    await convex.mutation(api.comments.create, {
      taskId: task_id,
      author: actor || "ada",
      authorType: "agent",
      content: `Task split into ${createdSubtasks.length} subtasks:\n${subtaskTitles}`,
      type: "message",
    })

    return NextResponse.json({
      success: true,
      parent_task_id: task_id,
      subtasks: createdSubtasks,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Triage Split API] Error:", error)
    return NextResponse.json(
      { error: message || "Failed to split task" },
      { status: 500 }
    )
  }
}
