import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/active?role=dev&model=kimi — Get active prompt version for a role+model
// Now supports A/B testing: randomly returns control or challenger based on split %
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
    const rand = Math.floor(Math.random() * 100)

    const result = await convex.query(api.promptVersions.resolveActive, {
      role,
      model,
      rand,
    })

    if (!result.promptVersion) {
      return NextResponse.json(
        { error: `No active prompt version found for role: ${role}${model ? `, model: ${model}` : ""}` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      promptVersion: result.promptVersion,
      ab_test: result.ab_test,
      ab_variant: result.ab_variant,
    })
  } catch (error) {
    console.error("[Prompts API] Error fetching active prompt:", error)
    return NextResponse.json(
      { error: "Failed to fetch active prompt version" },
      { status: 500 }
    )
  }
}
