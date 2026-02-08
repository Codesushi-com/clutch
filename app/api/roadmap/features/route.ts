import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/roadmap/features?project_id=xxx — List features for a project
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
    const features = await convex.query(api.roadmap.getFeatures, { project_id })
    return NextResponse.json({ features })
  } catch (error) {
    console.error("[Features API] Error fetching features:", error)
    return NextResponse.json(
      { error: "Failed to fetch features" },
      { status: 500 }
    )
  }
}

// POST /api/roadmap/features — Create a feature
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project_id, title, description, status, priority, position } = body

  if (!project_id || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const feature = await convex.mutation(api.roadmap.createFeature, {
      project_id,
      title,
      description,
      status,
      priority,
      position,
    })
    return NextResponse.json({ feature }, { status: 201 })
  } catch (error) {
    console.error("[Features API] Error creating feature:", error)
    return NextResponse.json(
      { error: "Failed to create feature" },
      { status: 500 }
    )
  }
}

// PATCH /api/roadmap/features — Update a feature
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
    const feature = await convex.mutation(api.roadmap.updateFeature, { id, ...updates })
    return NextResponse.json({ feature })
  } catch (error) {
    console.error("[Features API] Error updating feature:", error)
    return NextResponse.json(
      { error: "Failed to update feature" },
      { status: 500 }
    )
  }
}

// DELETE /api/roadmap/features?id=xxx — Delete a feature
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
    await convex.mutation(api.roadmap.deleteFeature, { id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Features API] Error deleting feature:", error)
    return NextResponse.json(
      { error: "Failed to delete feature" },
      { status: 500 }
    )
  }
}
