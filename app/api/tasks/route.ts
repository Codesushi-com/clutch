import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/tasks?projectId=xxx&status=xxx&limit=n — List with filters
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")
  const status = searchParams.get("status")
  const limit = searchParams.get("limit")

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    
    // Map status names if needed (app uses in_review, Convex may use review)
    const convexStatus = (status || undefined) as "backlog" | "ready" | "in_progress" | "in_review" | "done" | undefined

    let tasks = await convex.query(api.tasks.getByProject, {
      projectId,
      status: convexStatus,
    })

    // Apply limit client-side (Convex query doesn't support limit param)
    if (limit) {
      const limitNum = parseInt(limit, 10)
      if (!isNaN(limitNum) && limitNum > 0) {
        tasks = tasks.slice(0, limitNum)
      }
    }

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error("[Tasks API] Error fetching tasks:", error)
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    )
  }
}

// POST /api/tasks — Create task
export async function POST(request: NextRequest) {
  const body = await request.json()

  const {
    project_id,
    title,
    description,
    status = "backlog",
    priority = "medium",
    assignee,
    requires_human_review,
    tags,
    role,
  } = body

  if (!project_id || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    )
  }

  try {
    const convex = getConvexClient()
    const task = await convex.mutation(api.tasks.create, {
      project_id,
      title,
      description: description || undefined,
      status,
      priority,
      assignee: assignee || undefined,
      requires_human_review: requires_human_review ? true : false,
      tags: tags ? (typeof tags === "string" ? tags : JSON.stringify(tags)) : undefined,
      role: role || undefined,
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error("[Tasks API] Error creating task:", error)
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    )
  }
}
