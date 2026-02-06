import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/ab-test?role=dev&model=kimi — Get A/B test state for a role+model
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

  const convex = getConvexClient()
  const state = await convex.query(api.promptVersions.getABTestState, {
    role,
    model,
  })

  return NextResponse.json(state)
}

// POST /api/prompts/ab-test — Start a new A/B test
// Body: { challenger_id, split_percent?, min_tasks? }
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { challenger_id, split_percent, min_tasks } = body

  if (!challenger_id) {
    return NextResponse.json(
      { error: "Missing required field: challenger_id" },
      { status: 400 }
    )
  }

  const convex = getConvexClient()
  const result = await convex.mutation(api.promptVersions.startABTest, {
    challenger_id,
    split_percent,
    min_tasks,
  })

  return NextResponse.json(result)
}

// DELETE /api/prompts/ab-test — End an A/B test (promote or reject)
// Body: { role, model?, action: "promote" | "reject" }
export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const { role, model, action } = body

  if (!role || !action) {
    return NextResponse.json(
      { error: "Missing required fields: role, action" },
      { status: 400 }
    )
  }

  if (action !== "promote" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'promote' or 'reject'" },
      { status: 400 }
    )
  }

  const convex = getConvexClient()
  await convex.mutation(api.promptVersions.endABTest, {
    role,
    model,
    action,
  })

  return NextResponse.json({ success: true })
}
