import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/tasks/[id]/dependencies — Get task dependencies
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()

    // Use getWithDependencies to get task with dependencies info
    const result = await convex.query(api.tasks.getWithDependencies, { id })

    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    return NextResponse.json({
      depends_on: result.dependencies,
      blocks: result.blockedBy,
    })
  } catch (error) {
    console.error("[Dependencies API] Error fetching dependencies:", error)
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

  // Check for self-dependency
  if (id === depends_on_id) {
    return NextResponse.json(
      { error: "Task cannot depend on itself" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    // Check for circular dependency first (the add mutation doesn't check this)
    const wouldCycle = await convex.query(api.taskDependencies.wouldCreateCycle, {
      taskId: id,
      dependsOnId: depends_on_id,
    })
    if (wouldCycle) {
      return NextResponse.json(
        { error: "Circular dependency detected" },
        { status: 400 }
      )
    }

    // Call the add mutation
    const result = await convex.mutation(api.taskDependencies.add, {
      taskId: id,
      dependsOnId: depends_on_id,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Dependencies API] Error adding dependency:", error)

    // Handle specific error messages from the mutation
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('already exists')) {
      return NextResponse.json({ error: "Dependency already exists" }, { status: 409 })
    }
    if (errorMessage.includes('self-dependency') || errorMessage.includes('self')) {
      return NextResponse.json({ error: "Task cannot depend on itself" }, { status: 400 })
    }

    return NextResponse.json(
      { error: "Failed to add dependency" },
      { status: 500 }
    )
  }
}
