import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"

// GET /api/projects — List all projects
export async function GET() {
  try {
    const projects = await convexServerClient.query(api.projects.getAll, {})
    return NextResponse.json({ projects })
  } catch (error) {
    console.error("Error fetching projects:", error)
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    )
  }
}

// POST /api/projects — Create project
export async function POST(request: NextRequest) {
  const body = await request.json()

  const {
    name,
    slug,
    description,
    color,
    repo_url,
    chat_layout,
    local_path,
    github_repo,
    work_loop_enabled,
    work_loop_schedule,
  } = body

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Name and slug are required" },
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

  try {
    const project = await convexServerClient.mutation(api.projects.create, {
      name,
      slug,
      description,
      color,
      repo_url,
      chat_layout,
      local_path,
      github_repo,
      work_loop_enabled,
      work_loop_schedule,
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error("Error creating project:", error)

    if (error instanceof Error) {
      if (error.message.includes("slug already exists")) {
        return NextResponse.json(
          { error: "A project with this slug already exists" },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    )
  }
}
