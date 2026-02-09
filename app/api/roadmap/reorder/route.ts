import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/roadmap/reorder/phases — Reorder phases
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project_id, phase_ids } = body

  if (!project_id || !phase_ids || !Array.isArray(phase_ids)) {
    return NextResponse.json(
      { error: "project_id and phase_ids array are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    await convex.mutation(api.roadmap.reorderPhases, {
      project_id,
      phase_ids,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Reorder API] Error reordering phases:", error)
    return NextResponse.json(
      { error: "Failed to reorder phases" },
      { status: 500 }
    )
  }
}
