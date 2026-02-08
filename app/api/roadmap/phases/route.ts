import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/roadmap/phases?project_id=xxx — List phases for a project
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const project_id = searchParams.get("project_id")

  if (!project_id) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const phases = await convex.query(api.roadmap.getPhases, { project_id })
    return NextResponse.json({ phases })
  } catch (error) {
    console.error("[Phases API] Error fetching phases:", error)
    return NextResponse.json(
      { error: "Failed to fetch phases" },
      { status: 500 }
    )
  }
}

// POST /api/roadmap/phases — Create a phase
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project_id, number, name, goal, description, status, depends_on, success_criteria, inserted } = body

  if (!project_id || !number || !name || !goal) {
    return NextResponse.json(
      { error: "project_id, number, name, and goal are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const phase = await convex.mutation(api.roadmap.createPhase, {
      project_id,
      number,
      name,
      goal,
      description,
      status,
      depends_on,
      success_criteria,
      inserted,
    })
    return NextResponse.json({ phase }, { status: 201 })
  } catch (error) {
    console.error("[Phases API] Error creating phase:", error)
    return NextResponse.json(
      { error: "Failed to create phase" },
      { status: 500 }
    )
  }
}

// PATCH /api/roadmap/phases — Update a phase
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const phase = await convex.mutation(api.roadmap.updatePhase, { id, ...updates })
    return NextResponse.json({ phase })
  } catch (error) {
    console.error("[Phases API] Error updating phase:", error)
    return NextResponse.json(
      { error: "Failed to update phase" },
      { status: 500 }
    )
  }
}

// DELETE /api/roadmap/phases?id=xxx — Delete a phase
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    await convex.mutation(api.roadmap.deletePhase, { id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Phases API] Error deleting phase:", error)
    return NextResponse.json(
      { error: "Failed to delete phase" },
      { status: 500 }
    )
  }
}
