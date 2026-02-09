import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/metrics?role=dev&model=kimi&period=all_time
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get("role")
  const model = searchParams.get("model")
  const period = searchParams.get("period") as "day" | "week" | "all_time" | undefined

  if (!role || !model) {
    return NextResponse.json(
      { error: "Missing required query parameters: role and model" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const metrics = await convex.query(api.promptMetrics.getByRoleModel, {
      role,
      model,
      period,
    })

    return NextResponse.json({ metrics })
  } catch (error) {
    console.error("[Prompts Metrics API] Error fetching metrics:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompt metrics" },
      { status: 500 }
    )
  }
}

// POST /api/prompts/metrics — Trigger metrics computation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { since } = body

    const convex = getConvexClient()
    const result = await convex.action(api.promptMetrics.compute, {
      since,
    })

    return NextResponse.json({
      success: true,
      computed: result.computed,
      errors: result.errors,
    })
  } catch (error) {
    console.error("[Prompts Metrics API] Error computing metrics:", error)
    return NextResponse.json(
      { error: "Failed to compute prompt metrics" },
      { status: 500 }
    )
  }
}
