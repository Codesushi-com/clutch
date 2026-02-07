import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string; depId: string }> }

// DELETE /api/tasks/[id]/dependencies/[depId] — Remove a dependency
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { depId } = await params

  try {
    const convex = getConvexClient()

    // Call the remove mutation (by dependency ID)
    const success = await convex.mutation(api.taskDependencies.remove, {
      id: depId,
    })

    if (!success) {
      return NextResponse.json({ error: "Dependency not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("[Dependencies API] Error removing dependency:", error)
    return NextResponse.json(
      { error: "Failed to remove dependency" },
      { status: 500 }
    )
  }
}
