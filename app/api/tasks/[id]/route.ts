import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/tasks/[id] — Get task with comments
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()
    const result = await convex.query(api.tasks.getById, { id })

    if (!result) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Tasks API] Error fetching task:", error)
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    )
  }
}

// PATCH /api/tasks/[id] — Update task
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  const {
    title,
    description,
    status,
    priority,
    role,
    assignee,
    requires_human_review,
    tags,
    session_id,
    prompt_version_id,
  } = body

  try {
    const convex = getConvexClient()

    // If status is changing, use the move mutation (handles dependencies + position)
    if (status !== undefined) {
      // First do the status change via move
      const movedTask = await convex.mutation(api.tasks.move, { id, status })

      // If there are other fields to update, do that separately
      const otherUpdates: Record<string, unknown> = {}
      if (title !== undefined) otherUpdates.title = title
      if (description !== undefined) otherUpdates.description = description || undefined
      if (priority !== undefined) otherUpdates.priority = priority
      if (role !== undefined) otherUpdates.role = role || undefined
      if (assignee !== undefined) otherUpdates.assignee = assignee || undefined
      if (requires_human_review !== undefined) otherUpdates.requires_human_review = !!requires_human_review
      if (tags !== undefined) otherUpdates.tags = tags ? (typeof tags === "string" ? tags : JSON.stringify(tags)) : undefined
      if (session_id !== undefined) otherUpdates.session_id = session_id || undefined
      if (prompt_version_id !== undefined) otherUpdates.prompt_version_id = prompt_version_id || undefined

      if (Object.keys(otherUpdates).length > 0) {
        const task = await convex.mutation(api.tasks.update, { id, ...otherUpdates })
        return NextResponse.json({ task })
      }

      return NextResponse.json({ task: movedTask })
    }

    // No status change — just update fields
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description || undefined
    if (priority !== undefined) updates.priority = priority
    if (role !== undefined) updates.role = role || undefined
    if (assignee !== undefined) updates.assignee = assignee || undefined
    if (requires_human_review !== undefined) updates.requires_human_review = !!requires_human_review
    if (tags !== undefined) updates.tags = tags ? (typeof tags === "string" ? tags : JSON.stringify(tags)) : undefined
    if (session_id !== undefined) updates.session_id = session_id || undefined
    if (prompt_version_id !== undefined) updates.prompt_version_id = prompt_version_id || undefined

    const task = await convex.mutation(api.tasks.update, {
      id,
      ...updates,
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ task })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    // Handle dependency blocking errors from Convex
    if (message.includes("dependencies not complete")) {
      return NextResponse.json(
        { error: message },
        { status: 400 }
      )
    }

    console.error("[Tasks API] Error updating task:", error)
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    )
  }
}

// DELETE /api/tasks/[id] — Delete task
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()
    await convex.mutation(api.tasks.deleteTask, { id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Tasks API] Error deleting task:", error)
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    )
  }
}
