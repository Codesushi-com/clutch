import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type RouteParams = { params: Promise<{ id: string; depId: string }> }

type TaskId = Id<"tasks">
// Note: taskDependencies not in generated types yet, use string for now
type TaskDependencyId = string

// DELETE /api/tasks/[id]/dependencies/[depId] — Remove a dependency
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id, depId } = await params

  try {
    // Verify task exists
    const taskResult = await convexServerClient.query(api.tasks.getById, {
      id: id as TaskId,
    })

    if (!taskResult) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Remove the dependency using Convex mutation
    await convexServerClient.mutation(api.tasks.removeDependency, {
      id: depId as TaskDependencyId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error removing dependency:", error)

    if (error instanceof Error) {
      if (error.message.includes("Dependency not found")) {
        return NextResponse.json(
          { error: "Dependency not found" },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      { error: "Failed to remove dependency" },
      { status: 500 }
    )
  }
}
