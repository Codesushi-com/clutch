import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"
import type { Project } from "@/lib/db/types"
import { buildProjectContext, formatProjectContext } from "@/lib/project-context"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/projects/[id]/context — Get project context for AI sessions
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Try to get by ID first, then by slug
    let project: Project | null = null
    
    try {
      project = await convexServerClient.query(
        // @ts-expect-error - Convex self-hosted uses any api type
        { name: "projects/getById" },
        { id }
      ) as Project | null
    } catch {
      // If not found by ID, try by slug
      project = null
    }

    if (!project) {
      // Try by slug
      project = await convexServerClient.query(
        // @ts-expect-error - Convex self-hosted uses any api type
        { name: "projects/getBySlug" },
        { slug: id }
      ) as Project | null
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
      sessionKeyPrefix: `trap:${project.slug}`,
    })
  } catch (error) {
    console.error("[projects/context] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch project context", details: String(error) },
      { status: 500 }
    )
  }
}
