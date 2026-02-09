import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/roadmap?project_id=xxx — Get roadmap data for a project
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
    const roadmap = await convex.query(api.roadmap.getRoadmap, { project_id })
    return NextResponse.json(roadmap)
  } catch (error) {
    console.error("[Roadmap API] Error fetching roadmap:", error)
    return NextResponse.json(
      { error: "Failed to fetch roadmap" },
      { status: 500 }
    )
  }
}
