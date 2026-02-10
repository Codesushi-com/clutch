import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/projects/[id] — Get project by ID or slug
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

    // Get task count separately
    const tasks = await convex.query(api.tasks.getByProject, {
      projectId: project.id,
    })

    return NextResponse.json({
      project: {
        ...project,
        task_count: tasks.length,
      },
    })
  } catch (error) {
    console.error("[Projects API] Error fetching project:", error)
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    )
  }
}

// PATCH /api/projects/[id] — Update project
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  try {
    const convex = getConvexClient()

    // Try to get by ID first, then by slug to find the project
    let existing = await convex.query(api.projects.getById, { id })

    if (!existing) {
      existing = await convex.query(api.projects.getBySlug, { slug: id })
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    const { name, slug, description, color, repo_url, context_path, chat_layout, local_path, github_repo, work_loop_enabled, work_loop_max_agents, role_model_overrides } = body

    // Validate local_path if provided
    if (local_path !== undefined && local_path !== null && typeof local_path !== 'string') {
      return NextResponse.json(
        { error: "local_path must be a string" },
        { status: 400 }
      )
    }

    // Validate github_repo format if provided
    if (github_repo !== undefined && github_repo !== null) {
      if (typeof github_repo !== 'string' || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(github_repo)) {
        return NextResponse.json(
          { error: "github_repo must be in owner/repo format" },
          { status: 400 }
        )
      }
    }

    // Validate work_loop_enabled if provided
    if (work_loop_enabled !== undefined && typeof work_loop_enabled !== 'boolean') {
      return NextResponse.json(
        { error: "work_loop_enabled must be a boolean" },
        { status: 400 }
      )
    }

    // Validate work_loop_max_agents if provided
    if (work_loop_max_agents !== undefined && work_loop_max_agents !== null) {
      if (typeof work_loop_max_agents !== 'number' || work_loop_max_agents < 1 || !Number.isInteger(work_loop_max_agents)) {
        return NextResponse.json(
          { error: "work_loop_max_agents must be a positive integer" },
          { status: 400 }
        )
      }
    }

    // Validate role_model_overrides if provided
    if (role_model_overrides !== undefined && role_model_overrides !== null) {
      if (typeof role_model_overrides !== 'object' || Array.isArray(role_model_overrides)) {
        return NextResponse.json(
          { error: "role_model_overrides must be an object mapping roles to model strings" },
          { status: 400 }
        )
      }
      // Validate that all values are strings
      for (const [role, model] of Object.entries(role_model_overrides)) {
        if (typeof model !== 'string') {
          return NextResponse.json(
            { error: `role_model_overrides.${role} must be a string` },
            { status: 400 }
          )
        }
      }
    }

    // Build updates object - only include fields that were explicitly provided
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (slug !== undefined) updates.slug = slug
    if (description !== undefined) updates.description = description
    if (color !== undefined) updates.color = color
    if (repo_url !== undefined) updates.repo_url = repo_url
    if (context_path !== undefined) updates.context_path = context_path
    if (local_path !== undefined) updates.local_path = local_path
    if (github_repo !== undefined) updates.github_repo = github_repo
    if (chat_layout !== undefined) updates.chat_layout = chat_layout
    if (work_loop_enabled !== undefined) updates.work_loop_enabled = work_loop_enabled
    if (work_loop_max_agents !== undefined) updates.work_loop_max_agents = work_loop_max_agents
    if (role_model_overrides !== undefined) updates.role_model_overrides = role_model_overrides

    const project = await convex.mutation(api.projects.update, {
      id: existing.id,
      ...updates,
    })

    return NextResponse.json({ project })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Handle slug uniqueness error
    if (message.includes("unique") || message.includes("slug")) {
      return NextResponse.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      )
    }

    console.error("[Projects API] Error updating project:", error)
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] — Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    const convex = getConvexClient()

    // Try to get by ID first, then by slug to find the project
    let existing = await convex.query(api.projects.getById, { id })

    if (!existing) {
      existing = await convex.query(api.projects.getBySlug, { slug: id })
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    await convex.mutation(api.projects.deleteProject, {
      id: existing.id,
      force: true,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Projects API] Error deleting project:", error)
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    )
  }
}
