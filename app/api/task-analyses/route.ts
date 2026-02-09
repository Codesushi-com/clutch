import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// POST /api/task-analyses
// Creates a new task analysis record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      task_id,
      session_key,
      role,
      model,
      prompt_version_id,
      outcome,
      token_count,
      duration_ms,
      failure_modes,
      amendments,
      analysis_summary,
      confidence,
    } = body

    // Validate required fields
    if (!task_id || !role || !model || !prompt_version_id || !outcome || !analysis_summary || confidence === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate outcome enum
    const validOutcomes = ["success", "failure", "partial", "abandoned"]
    if (!validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${validOutcomes.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate confidence is 0-1
    if (confidence < 0 || confidence > 1) {
      return NextResponse.json(
        { error: "confidence must be between 0 and 1" },
        { status: 400 }
      )
    }

    const convex = getConvexClient()

    const analysis = await convex.mutation(api.taskAnalyses.create, {
      task_id,
      session_key,
      role,
      model,
      prompt_version_id,
      outcome,
      token_count,
      duration_ms,
      failure_modes: failure_modes ? JSON.stringify(failure_modes) : undefined,
      amendments: amendments ? JSON.stringify(amendments) : undefined,
      analysis_summary,
      confidence,
    })

    return NextResponse.json({ analysis }, { status: 201 })
  } catch (error) {
    console.error("[Task Analyses API] Error creating analysis:", error)
    return NextResponse.json(
      { error: "Failed to create task analysis" },
      { status: 500 }
    )
  }
}