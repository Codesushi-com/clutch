import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Project } from "@/lib/db/types"
import { buildProjectContext, formatProjectContext } from "@/lib/project-context"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/projects/[id]/context — Get project context for AI sessions
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ? OR slug = ?
  `).get(id, id) as Project | undefined

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
}
