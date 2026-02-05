import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"
import type { TaskStatus } from "@/lib/db/types"

type RouteParams = { params: Promise<{ id: string }> }

type TaskId = Id<"tasks">

// GET /api/tasks/[id] — Get task with comments
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  try {
    const result = await convexServerClient.query(api.tasks.getById, {
      id: id as TaskId,
    })

    if (!result) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching task:", error)
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
  } = body

  try {
    // If status is being changed, use the move mutation
    if (status !== undefined) {
      const movedTask = await convexServerClient.mutation(api.tasks.move, {
        id: id as TaskId,
        status: status as TaskStatus,
      })

      // Apply other updates if present
      if (title !== undefined || description !== undefined || priority !== undefined ||
          role !== undefined || assignee !== undefined || requires_human_review !== undefined ||
          tags !== undefined || session_id !== undefined) {
        const updated = await convexServerClient.mutation(api.tasks.update, {
          id: id as TaskId,
          title,
          description,
          priority,
          role,
          assignee,
          requires_human_review,
          tags,
          session_id,
        })
        return NextResponse.json({ task: updated })
      }

      return NextResponse.json({ task: movedTask })
    }

    // Otherwise just update
    const updated = await convexServerClient.mutation(api.tasks.update, {
      id: id as TaskId,
      title,
      description,
      priority,
      role,
      assignee,
      requires_human_review,
      tags,
      session_id,
    })

    return NextResponse.json({ task: updated })
  } catch (error) {
    console.error("Error updating task:", error)
    
    if (error instanceof Error) {
      if (error.message.includes("Task not found")) {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404 }
        )
      }
      if (error.message.includes("dependencies not complete")) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
    }
    
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
    await convexServerClient.mutation(api.tasks.deleteTask, {
      id: id as TaskId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting task:", error)
    
    if (error instanceof Error && error.message.includes("Task not found")) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    )
  }
}
