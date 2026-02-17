import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/roles — List all distinct roles with prompt versions
export async function GET(_request: NextRequest) {
  try {
    const convex = getConvexClient()
    const roles = await convex.query(api.promptVersions.listRoles, {})

    return NextResponse.json({ roles })
  } catch (error) {
    console.error("[Prompts Roles API] Error fetching roles:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompt roles" },
      { status: 500 }
    )
  }
}
