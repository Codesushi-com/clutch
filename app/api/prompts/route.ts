import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts?role=dev&model=kimi — List versions for a role
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
    const versions = await convex.query(api.promptVersions.listByRole, {
      role,
      model,
    })

    return NextResponse.json({ versions })
  } catch (error) {
    console.error("[Prompts API] Error fetching versions:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompt versions" },
      { status: 500 }
    )
  }
}

// POST /api/prompts — Create a new version
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { role, content, model, change_summary, parent_version_id, created_by } = body

    if (!role || !content) {
      return NextResponse.json(
        { error: "Missing required fields: role, content" },
        { status: 400 }
      )
    }

    const convex = getConvexClient()
    const version = await convex.mutation(api.promptVersions.create, {
      role,
      content,
      model,
      change_summary,
      parent_version_id,
      created_by: created_by || "human",
    })

    return NextResponse.json({ version })
  } catch (error) {
    console.error("[Prompts API] Error creating version:", error)
    return NextResponse.json(
      { error: "Failed to create prompt version" },
      { status: 500 }
    )
  }
}
