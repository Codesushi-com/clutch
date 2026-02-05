import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type RouteParams = { params: Promise<{ id: string }> }

type TaskId = Id<"tasks">

// GET /api/tasks/[id]/dependencies — Get task dependencies
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const result = await convexServerClient.query(api.tasks.getWithDependencies, {
      id: id as TaskId,
    })

    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    return NextResponse.json({
      depends_on: result.dependencies,
      blocks: result.blockedBy,
    })
  } catch (error) {
    console.error("Error fetching dependencies:", error)
    return NextResponse.json(
      { error: "Failed to fetch dependencies" },
      { status: 500 }
    )
  }
}

// POST /api/tasks/[id]/dependencies — Add a dependency
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  const { depends_on_id } = body

  if (!depends_on_id) {
    return NextResponse.json(
      { error: "depends_on_id is required" },
      { status: 400 }
    )
  }

  try {
    const dependency = await convexServerClient.mutation(api.tasks.addDependency, {
      task_id: id as TaskId,
      depends_on_id: depends_on_id as TaskId,
    })

    return NextResponse.json({ dependency }, { status: 201 })
  } catch (error) {
    console.error("Error adding dependency:", error)

    if (error instanceof Error) {
      if (error.message.includes("Task not found")) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (
        error.message.includes("cannot depend on itself") ||
        error.message.includes("already exists") ||
        error.message.includes("circular dependency")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json(
      { error: "Failed to add dependency" },
      { status: 500 }
    )
  }
}
