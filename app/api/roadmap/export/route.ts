import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/roadmap/export?project_id=xxx — Export roadmap for task breakdown
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
    const result = await convex.query(api.roadmap.exportRoadmap, { project_id })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Roadmap Export API] Error:", error)
    return NextResponse.json(
      { error: "Failed to export roadmap" },
      { status: 500 }
    )
  }
}
