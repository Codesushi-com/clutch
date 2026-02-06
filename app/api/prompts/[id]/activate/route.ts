import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// PATCH /api/prompts/[id]/activate — Set a version as active
export async function PATCH(
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
    await convex.mutation(api.promptVersions.setActive, { id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Prompts API] Error activating version:", error)
    const message = error instanceof Error ? error.message : "Failed to activate prompt version"
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
