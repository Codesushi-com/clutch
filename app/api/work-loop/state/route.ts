import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// PATCH /api/work-loop/state — Update work loop state
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, status, current_phase, current_cycle, active_agents, max_agents, error_message, last_cycle_at } = body

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      )
    }

    if (!status || !["running", "paused", "stopped", "error"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be one of: running, paused, stopped, error" },
        { status: 400 }
      )
    }

    // Upsert the state with provided values
    // Convex will handle creating new or updating existing
    const convex = getConvexClient()
    const updatedState = await convex.mutation(api.workLoop.upsertState, {
      project_id: projectId,
      status,
      current_phase,
      current_cycle: current_cycle ?? 0,
      active_agents: active_agents ?? 0,
      max_agents: max_agents ?? 3,
      error_message,
      last_cycle_at,
    })

    return NextResponse.json({ success: true, state: updatedState })
  } catch (error) {
    console.error("Failed to update work loop state:", error)
    return NextResponse.json(
      { error: "Failed to update work loop state", details: String(error) },
      { status: 500 }
    )
  }
}
