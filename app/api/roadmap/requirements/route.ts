import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/roadmap/requirements?project_id=xxx — List requirements for a project
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const project_id = searchParams.get("project_id")
  const feature_id = searchParams.get("feature_id")

  if (!project_id && !feature_id) {
    return NextResponse.json(
      { error: "project_id or feature_id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    if (feature_id) {
      const requirements = await convex.query(api.roadmap.getFeatureRequirements, { feature_id })
      return NextResponse.json({ requirements })
    }

    const requirements = await convex.query(api.roadmap.getRequirements, { project_id: project_id! })
    return NextResponse.json({ requirements })
  } catch (error) {
    console.error("[Requirements API] Error fetching requirements:", error)
    return NextResponse.json(
      { error: "Failed to fetch requirements" },
      { status: 500 }
    )
  }
}

// POST /api/roadmap/requirements — Create a requirement
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project_id, title, description, feature_id, category, status, priority, position } = body

  if (!project_id || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const requirement = await convex.mutation(api.roadmap.createRequirement, {
      project_id,
      title,
      description,
      feature_id,
      category,
      status,
      priority,
      position,
    })
    return NextResponse.json({ requirement }, { status: 201 })
  } catch (error) {
    console.error("[Requirements API] Error creating requirement:", error)
    return NextResponse.json(
      { error: "Failed to create requirement" },
      { status: 500 }
    )
  }
}

// PATCH /api/roadmap/requirements — Update a requirement
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
    const requirement = await convex.mutation(api.roadmap.updateRequirement, { id, ...updates })
    return NextResponse.json({ requirement })
  } catch (error) {
    console.error("[Requirements API] Error updating requirement:", error)
    return NextResponse.json(
      { error: "Failed to update requirement" },
      { status: 500 }
    )
  }
}

// DELETE /api/roadmap/requirements?id=xxx — Delete a requirement
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
    await convex.mutation(api.roadmap.deleteRequirement, { id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Requirements API] Error deleting requirement:", error)
    return NextResponse.json(
      { error: "Failed to delete requirement" },
      { status: 500 }
    )
  }
}
