import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/server"
import type { TaskStatus } from "@/lib/db/types"

// Helper type for Convex IDs
type ProjectId = Id<"projects">

// GET /api/tasks?projectId=xxx&status=xxx&limit=n — List with filters
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")
  const status = searchParams.get("status")
  const limit = searchParams.get("limit")
  
  try {
    // If projectId is provided, use Convex query
    if (projectId) {
      const tasks = await convexServerClient.query(api.tasks.getByProject, {
        projectId: projectId as ProjectId,
        status: status as TaskStatus | undefined,
      })
      
      // Apply limit if specified
      let result = tasks
      if (limit) {
        const limitNum = parseInt(limit, 10)
        if (!isNaN(limitNum) && limitNum > 0) {
          result = tasks.slice(0, limitNum)
        }
      }
      
      return NextResponse.json({ tasks: result })
    }
    
    // Without projectId, we need a different approach - get all tasks is not implemented
    // Return empty array for now (frontend should always provide projectId)
    return NextResponse.json({ tasks: [] })
  } catch (error) {
    console.error("Error fetching tasks:", error)
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
    const task = await convexServerClient.mutation(api.tasks.create, {
      project_id: project_id as ProjectId,
      title,
      description,
      status: status as TaskStatus | undefined,
      priority,
      role,
      assignee,
      requires_human_review,
      tags,
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error("Error creating task:", error)
    
    if (error instanceof Error && error.message.includes("Project not found")) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    )
  }
}
