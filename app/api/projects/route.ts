import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/projects — List all projects
export async function GET() {
  try {
    const convex = getConvexClient()
    const projects = await convex.query(api.projects.getAll, {})
    return NextResponse.json({ projects })
  } catch (error) {
    console.error("[Projects API] Error fetching projects:", error)
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    )
  }
}

// POST /api/projects — Create project
export async function POST(request: NextRequest) {
  const body = await request.json()

  const { name, slug, description, color, repo_url, chat_layout, local_path, github_repo, work_loop_enabled, work_loop_max_agents } = body

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Name and slug are required" },
      { status: 400 }
    )
  }

  // Validate local_path if provided
  if (local_path && typeof local_path !== 'string') {
    return NextResponse.json(
      { error: "local_path must be a string" },
      { status: 400 }
    )
  }

  // Validate github_repo format if provided
  if (github_repo) {
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

  try {
    const convex = getConvexClient()
    const project = await convex.mutation(api.projects.create, {
      name,
      slug,
      description: description || undefined,
      color: color || undefined,
      repo_url: repo_url || undefined,
      local_path: local_path || undefined,
      github_repo: github_repo || undefined,
      chat_layout: chat_layout || undefined,
      work_loop_enabled: work_loop_enabled ?? undefined,
      work_loop_max_agents: work_loop_max_agents ?? undefined,
    })

    // Create default "General" chat for the project
    await convex.mutation(api.chats.create, {
      project_id: project.id,
      title: "General",
      participants: "[]",
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Handle slug uniqueness error
    if (message.includes("unique") || message.includes("slug")) {
      return NextResponse.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      )
    }

    console.error("[Projects API] Error creating project:", error)
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    )
  }
}
