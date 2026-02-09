import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/amendments?status=pending&includeDeferred=true
// Fetches analyses with amendments, optionally filtered by status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const includeDeferred = searchParams.get("includeDeferred") === "true"

  try {
    const convex = getConvexClient()
    const analyses = await convex.query(api.taskAnalyses.listPendingAmendments, {
      includeDeferred,
    })

    return NextResponse.json({ analyses })
  } catch (error) {
    console.error("[Amendments API] Error fetching amendments:", error)
    return NextResponse.json(
      { error: "Failed to fetch amendments" },
      { status: 500 }
    )
  }
}

// PATCH /api/prompts/amendments
// Update amendment status on a task analysis
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, reject_reason } = body

    if (!id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: id, status" },
        { status: 400 }
      )
    }

    const validStatuses = ["pending", "applied", "rejected", "deferred"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    const convex = getConvexClient()
    await convex.mutation(api.taskAnalyses.updateAmendmentStatus, {
      id,
      status,
      reject_reason,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Amendments API] Error updating amendment status:", error)
    return NextResponse.json(
      { error: "Failed to update amendment status" },
      { status: 500 }
    )
  }
}
