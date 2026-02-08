import { type NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"

// Session management for Feature Builder
// Stores sessions in Convex for reference and analytics

function getConvexClient() {
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is not configured")
  }
  return new ConvexHttpClient(convexUrl)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, user_id } = body

    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 })
    }

    const convex = getConvexClient()

    // Call Convex mutation (bypass generated api typing)
    const sessionId = await (convex as unknown as { 
      mutation: (name: string, args: Record<string, unknown>) => Promise<string> 
    }).mutation("featureBuilder:createSession", {
      project_id,
      user_id,
    })

    return NextResponse.json({ sessionId })
  } catch (error) {
    console.error("[FeatureBuilder] Failed to create session:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, current_step, completed_steps, feature_data } = body

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const convex = getConvexClient()

    await (convex as unknown as { 
      mutation: (name: string, args: Record<string, unknown>) => Promise<unknown> 
    }).mutation("featureBuilder:updateSessionProgress", {
      id,
      current_step,
      completed_steps,
      feature_data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[FeatureBuilder] Failed to update session:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action, result_task_id, tasks_generated } = body

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const convex = getConvexClient()

    const mutate = (convex as unknown as { 
      mutation: (name: string, args: Record<string, unknown>) => Promise<unknown> 
    }).mutation

    switch (action) {
      case "cancel":
        await mutate("featureBuilder:cancelSession", { id })
        break
      case "complete":
        await mutate("featureBuilder:completeSession", {
          id,
          result_task_id,
          tasks_generated,
        })
        break
      case "error":
        await mutate("featureBuilder:errorSession", { id })
        break
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[FeatureBuilder] Failed to update session status:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
