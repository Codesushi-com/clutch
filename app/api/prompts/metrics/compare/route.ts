import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/prompts/metrics/compare?versionA=X&versionB=Y&period=all_time
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const versionA = searchParams.get("versionA")
  const versionB = searchParams.get("versionB")
  const period = searchParams.get("period") as "day" | "week" | "all_time" | undefined

  if (!versionA || !versionB) {
    return NextResponse.json(
      { error: "Missing required query parameters: versionA and versionB" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const result = await convex.query(api.promptMetrics.compareVersions, {
      version_a: versionA,
      version_b: versionB,
      period,
    })

    // Calculate comparison summary
    const summary = calculateComparisonSummary(result.version_a, result.version_b)

    return NextResponse.json({
      version_a: versionA,
      version_b: versionB,
      metrics_a: result.version_a,
      metrics_b: result.version_b,
      summary,
    })
  } catch (error) {
    console.error("[Prompts Metrics Compare API] Error comparing versions:", error)
    return NextResponse.json(
      { error: "Failed to compare prompt versions" },
      { status: 500 }
    )
  }
}

/**
 * Calculate comparison summary between two versions
 */
function calculateComparisonSummary(
  metricsA: Array<{
    role: string
    model: string
    total_tasks: number
    success_count: number
    failure_count: number
    avg_tokens: number
    avg_duration_ms: number
  }>,
  metricsB: Array<{
    role: string
    model: string
    total_tasks: number
    success_count: number
    failure_count: number
    avg_tokens: number
    avg_duration_ms: number
  }>
) {
  // Aggregate totals across all role/model combinations
  const totalA = metricsA.reduce(
    (acc, m) => ({
      tasks: acc.tasks + m.total_tasks,
      success: acc.success + m.success_count,
      failure: acc.failure + m.failure_count,
      tokens: acc.tokens + m.avg_tokens * m.total_tasks,
      duration: acc.duration + m.avg_duration_ms * m.total_tasks,
    }),
    { tasks: 0, success: 0, failure: 0, tokens: 0, duration: 0 }
  )

  const totalB = metricsB.reduce(
    (acc, m) => ({
      tasks: acc.tasks + m.total_tasks,
      success: acc.success + m.success_count,
      failure: acc.failure + m.failure_count,
      tokens: acc.tokens + m.avg_tokens * m.total_tasks,
      duration: acc.duration + m.avg_duration_ms * m.total_tasks,
    }),
    { tasks: 0, success: 0, failure: 0, tokens: 0, duration: 0 }
  )

  const successRateA = totalA.tasks > 0 ? totalA.success / totalA.tasks : 0
  const successRateB = totalB.tasks > 0 ? totalB.success / totalB.tasks : 0
  const avgTokensA = totalA.tasks > 0 ? totalA.tokens / totalA.tasks : 0
  const avgTokensB = totalB.tasks > 0 ? totalB.tokens / totalB.tasks : 0
  const avgDurationA = totalA.tasks > 0 ? totalA.duration / totalA.tasks : 0
  const avgDurationB = totalB.tasks > 0 ? totalB.duration / totalB.tasks : 0

  return {
    version_a: {
      total_tasks: totalA.tasks,
      success_rate: Math.round(successRateA * 100) / 100,
      avg_tokens: Math.round(avgTokensA),
      avg_duration_ms: Math.round(avgDurationA),
    },
    version_b: {
      total_tasks: totalB.tasks,
      success_rate: Math.round(successRateB * 100) / 100,
      avg_tokens: Math.round(avgTokensB),
      avg_duration_ms: Math.round(avgDurationB),
    },
    delta: {
      success_rate: Math.round((successRateB - successRateA) * 100) / 100,
      avg_tokens: Math.round(avgTokensB - avgTokensA),
      avg_duration_ms: Math.round(avgDurationB - avgDurationA),
    },
    confidence: calculateConfidence(totalA.tasks, totalB.tasks),
  }
}

/**
 * Calculate confidence level based on sample sizes
 * Low sample size = low confidence
 */
function calculateConfidence(nA: number, nB: number): "high" | "medium" | "low" {
  const minSample = Math.min(nA, nB)
  if (minSample >= 50) return "high"
  if (minSample >= 20) return "medium"
  return "low"
}
