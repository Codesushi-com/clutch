import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"

type RouteParams = { params: Promise<{ id: string }> }

type ProjectId = Id<"projects">

// GET /api/projects/[id] — Get project by ID or slug
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  try {
    // Try to get by ID first
    let project = await convexServerClient.query(api.projects.getById, {
      id: id as ProjectId,
    })

    // If not found, try by slug
    if (!project) {
      project = await convexServerClient.query(api.projects.getBySlug, {
        slug: id,
      })
    }

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error("Error fetching project:", error)
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

  const {
    name,
    slug,
    description,
    color,
    repo_url,
    context_path,
    chat_layout,
    local_path,
    github_repo,
    work_loop_enabled,
    work_loop_schedule,
  } = body

  // Validate github_repo format if provided
  if (github_repo !== undefined && github_repo !== null) {
    if (typeof github_repo !== 'string' || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(github_repo)) {
      return NextResponse.json(
        { error: "github_repo must be in owner/repo format" },
        { status: 400 }
      )
    }
  }

  try {
    // First get the project to find its Convex ID
    let existingProject = await convexServerClient.query(api.projects.getById, {
      id: id as ProjectId,
    })

    if (!existingProject) {
      existingProject = await convexServerClient.query(api.projects.getBySlug, {
        slug: id,
      })
    }

    if (!existingProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    const updated = await convexServerClient.mutation(api.projects.update, {
      id: existingProject.id as ProjectId,
      name,
      slug,
      description,
      color,
      repo_url,
      context_path,
      chat_layout,
      local_path,
      github_repo,
      work_loop_enabled,
      work_loop_schedule,
    })

    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error("Error updating project:", error)

    if (error instanceof Error) {
      if (error.message.includes("Project not found")) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        )
      }
      if (error.message.includes("slug already exists")) {
        return NextResponse.json(
          { error: "A project with this slug already exists" },
          { status: 409 }
        )
      }
    }

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
    // First get the project to find its Convex ID
    let existingProject = await convexServerClient.query(api.projects.getById, {
      id: id as ProjectId,
    })

    if (!existingProject) {
      existingProject = await convexServerClient.query(api.projects.getBySlug, {
        slug: id,
      })
    }

    if (!existingProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    await convexServerClient.mutation(api.projects.deleteProject, {
      id: existingProject.id as ProjectId,
      force: true,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting project:", error)

    if (error instanceof Error && error.message.includes("Project not found")) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    )
  }
}
