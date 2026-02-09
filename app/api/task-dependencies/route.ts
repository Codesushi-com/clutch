import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/task-dependencies — Create a dependency
export async function POST(request: NextRequest) {
  const body = await request.json()

  const { task_id, depends_on_id } = body

  if (!task_id || !depends_on_id) {
    return NextResponse.json(
      { error: "task_id and depends_on_id are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const dependency = await convex.mutation(api.taskDependencies.add, {
      taskId: task_id,
      dependsOnId: depends_on_id,
    })

    return NextResponse.json({ dependency }, { status: 201 })
  } catch (error) {
    console.error("[Task Dependencies API] Error creating dependency:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create dependency" },
      { status: 500 }
    )
  }
}

// DELETE /api/task-dependencies?id=xxx — Delete a dependency
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const success = await convex.mutation(api.taskDependencies.remove, { id })

    if (!success) {
      return NextResponse.json(
        { error: "Dependency not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Task Dependencies API] Error removing dependency:", error)
    return NextResponse.json(
      { error: "Failed to remove dependency" },
      { status: 500 }
    )
  }
}
