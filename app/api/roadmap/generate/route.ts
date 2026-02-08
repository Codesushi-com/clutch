import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/roadmap/generate — Generate roadmap from requirements
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project_id, depth } = body

  if (!project_id) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const result = await convex.mutation(api.roadmap.generateRoadmap, {
      project_id,
      depth: depth || 'standard',
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[Roadmap Generate API] Error:", error)
    return NextResponse.json(
      { error: message || "Failed to generate roadmap" },
      { status: 500 }
    )
  }
}
