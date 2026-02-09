import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/[id] — Get a specific version by UUID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: "Missing required parameter: id" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const version = await convex.query(api.promptVersions.getById, { id })

    if (!version) {
      return NextResponse.json(
        { error: "Prompt version not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ version })
  } catch (error) {
    console.error("[Prompts API] Error fetching version:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompt version" },
      { status: 500 }
    )
  }
}
