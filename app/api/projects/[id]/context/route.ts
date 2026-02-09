import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { buildProjectContext, formatProjectContext } from "@/lib/project-context"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/projects/[id]/context — Get project context for AI sessions
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()

    // Try to get by ID first, then by slug
    let project = await convex.query(api.projects.getById, { id })

    if (!project) {
      project = await convex.query(api.projects.getBySlug, { slug: id })
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    const context = buildProjectContext(project)
    const formatted = formatProjectContext(context)

    return NextResponse.json({
      context,
      formatted,
      sessionKeyPrefix: `clutch:${project.slug}`,

    })
  } catch (error) {
    console.error("[Projects API] Error fetching project context:", error)
    return NextResponse.json(
      { error: "Failed to fetch project context" },
      { status: 500 }
    )
  }
}
