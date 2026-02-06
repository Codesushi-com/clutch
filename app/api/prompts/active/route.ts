import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/active?role=dev&model=kimi — Get active prompt version for a role+model
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get("role")
  const model = searchParams.get("model") || undefined

  if (!role) {
    return NextResponse.json(
      { error: "Missing required query parameter: role" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const promptVersion = await convex.query(api.promptVersions.getActive, {
      role,
      model,
    })

    if (!promptVersion) {
      return NextResponse.json(
        { error: `No active prompt version found for role: ${role}${model ? `, model: ${model}` : ""}` },
        { status: 404 }
      )
    }

    return NextResponse.json({ promptVersion })
  } catch (error) {
    console.error("[Prompts API] Error fetching active prompt:", error)
    return NextResponse.json(
      { error: "Failed to fetch active prompt version" },
      { status: 500 }
    )
  }
}
