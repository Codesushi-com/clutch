import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/roadmap/phase-requirements — Link a requirement to a phase
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { phase_id, requirement_id, project_id } = body

  if (!phase_id || !requirement_id || !project_id) {
    return NextResponse.json(
      { error: "phase_id, requirement_id, and project_id are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const link = await convex.mutation(api.roadmap.linkRequirementToPhase, {
      phase_id,
      requirement_id,
      project_id,
    })
    return NextResponse.json({ link }, { status: 201 })
  } catch (error) {
    console.error("[Phase Requirements API] Error linking requirement:", error)
    return NextResponse.json(
      { error: "Failed to link requirement to phase" },
      { status: 500 }
    )
  }
}

// DELETE /api/roadmap/phase-requirements — Unlink a requirement from a phase
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phase_id = searchParams.get("phase_id")
  const requirement_id = searchParams.get("requirement_id")

  if (!phase_id || !requirement_id) {
    return NextResponse.json(
      { error: "phase_id and requirement_id are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    await convex.mutation(api.roadmap.unlinkRequirementFromPhase, {
      phase_id,
      requirement_id,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Phase Requirements API] Error unlinking requirement:", error)
    return NextResponse.json(
      { error: "Failed to unlink requirement from phase" },
      { status: 500 }
    )
  }
}
