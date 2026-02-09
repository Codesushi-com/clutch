import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/tasks/unanalyzed?projectId=xxx&limit=n
// Returns tasks that need post-mortem analysis
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")
  const limit = searchParams.get("limit")

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()

    const tasks = await convex.query(api.tasks.getUnanalyzed, {
      projectId,
      limit: limit ? parseInt(limit, 10) : undefined,
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error("[Unanalyzed Tasks API] Error fetching tasks:", error)
    return NextResponse.json(
      { error: "Failed to fetch unanalyzed tasks" },
      { status: 500 }
    )
  }
}