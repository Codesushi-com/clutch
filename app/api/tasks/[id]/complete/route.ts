import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteContext = {
  params: Promise<{ id: string }>
}

// POST /api/tasks/:id/complete — Mark task as complete
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  const body = await request.json()

  const { summary, prUrl, notes, agent } = body

  if (!summary) {
    return NextResponse.json(
      { error: "Summary is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    // Get task
    const result = await convex.query(api.tasks.getById, { id })
    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const { task } = result

    // Determine new status - 'review' if PR created, 'done' otherwise
    const newStatus = prUrl ? "in_review" : "done"

    // Build completion comment content
    let commentContent = `## Task Completed\n\n${summary}`
    if (prUrl) {
      commentContent += `\n\n**Pull Request**: ${prUrl}`
    }
    if (notes) {
      commentContent += `\n\n**Notes**: ${notes}`
    }

    const now = Date.now()
    const author = agent || task.assignee || "agent"

    // Create completion comment
    const comment = await convex.mutation(api.comments.create, {
      taskId: id,
      author,
      authorType: "agent",
      content: commentContent,
      type: "completion",
    })

    // Update task status - use move mutation to handle position properly
    const updatedTask = await convex.mutation(api.tasks.move, {
      id,
      status: newStatus,
    })

    // TODO: Log event to events table - needs Convex events.create function

    return NextResponse.json({
      success: true,
      task: {
        id: updatedTask.id,
        status: updatedTask.status,
        completed_at: updatedTask.completed_at,
      },
      comment: {
        id: comment.id,
        type: "completion",
      },
    })
  } catch (error) {
    console.error("[Complete API] Error completing task:", error)
    return NextResponse.json(
      { error: "Failed to complete task" },
      { status: 500 }
    )
  }
}
