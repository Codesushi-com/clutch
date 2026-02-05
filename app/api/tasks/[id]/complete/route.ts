import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type RouteContext = {
  params: Promise<{ id: string }>
}

type TaskId = Id<"tasks">

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
    const result = await convexServerClient.mutation(api.tasks.completeTask, {
      id: id as TaskId,
      summary,
      prUrl,
      notes,
      agent,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error completing task:", error)

    if (error instanceof Error && error.message.includes("Task not found")) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: "Failed to complete task" },
      { status: 500 }
    )
  }
}
