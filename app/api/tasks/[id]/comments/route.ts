import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/tasks/[id]/comments — List comments for task
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()

    // Verify task exists
    const taskResult = await convex.query(api.tasks.getById, { id })
    if (!taskResult) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    const comments = await convex.query(api.comments.getByTask, {
      taskId: id,
    })

    return NextResponse.json({ comments })
  } catch (error) {
    console.error("[Comments API] Error fetching comments:", error)
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    )
  }
}

// POST /api/tasks/[id]/comments — Add comment
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  const {
    content,
    author = "unknown",
    author_type = "human",
    type = "message",
  } = body

  if (!content) {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    // Verify task exists
    const taskResult = await convex.query(api.tasks.getById, { id })
    if (!taskResult) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    const comment = await convex.mutation(api.comments.create, {
      taskId: id,
      author,
      authorType: author_type,
      content,
      type,
    })

    // Log comment added event
    try {
      await convex.mutation(api.task_events.logCommentAdded, {
        taskId: id,
        author,
        preview: content.slice(0, 200), // Limit preview
      })
    } catch (logErr) {
      // Non-fatal — just log the error
      console.warn(`[Comments API] Failed to log comment added event:`, logErr)
    }

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error) {
    console.error("[Comments API] Error creating comment:", error)
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    )
  }
}
