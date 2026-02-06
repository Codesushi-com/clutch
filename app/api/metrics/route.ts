import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

/**
 * GET /api/metrics
 * Returns aggregated metrics from task analyses + prompt versions.
 * Query params: role, model, since (epoch ms)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const role = searchParams.get("role") || undefined
  const model = searchParams.get("model") || undefined
  const since = searchParams.get("since") ? Number(searchParams.get("since")) : undefined

  const convex = getConvexClient()

  const [analyses, promptVersions, filterOptions] = await Promise.all([
    convex.query(api.metrics.getAnalyses, { role, model, since }),
    convex.query(api.metrics.getPromptVersionsSummary, {}),
    convex.query(api.metrics.getFilterOptions, {}),
  ])

  return NextResponse.json({
    analyses,
    promptVersions,
    filterOptions,
  })
}
