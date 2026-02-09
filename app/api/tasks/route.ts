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
    dependencies,
  } = body

  if (!project_id || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    )
  }

  // Validate dependencies if provided
  if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
    for (const dep of dependencies) {
      if (!dep.task_id || !dep.direction) {
        return NextResponse.json(
          { error: "Each dependency must have task_id and direction" },
          { status: 400 }
        )
      }
      if (dep.direction !== "depends_on" && dep.direction !== "blocks") {
        return NextResponse.json(
          { error: "direction must be 'depends_on' or 'blocks'" },
          { status: 400 }
        )
      }
    }
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

    // Create dependencies if provided
    if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
      const createdDeps: string[] = []
      const failedDeps: { task_id: string; error: string }[] = []

      for (const dep of dependencies) {
        try {
          // Determine the direction: if "depends_on", task depends on dep.task_id
          // If "blocks", dep.task_id depends on task (task blocks dep.task_id)
          const taskId = dep.direction === "depends_on" ? task.id : dep.task_id
          const dependsOnId = dep.direction === "depends_on" ? dep.task_id : task.id

          // Skip self-dependencies
          if (taskId === dependsOnId) {
            failedDeps.push({ task_id: dep.task_id, error: "Cannot depend on itself" })
            continue
          }

          await convex.mutation(api.taskDependencies.add, {
            taskId,
            dependsOnId,
          })
          createdDeps.push(dep.task_id)
        } catch (depError) {
          const errorMessage = depError instanceof Error ? depError.message : String(depError)
          failedDeps.push({ task_id: dep.task_id, error: errorMessage })
          console.warn(`[Tasks API] Failed to create dependency ${dep.task_id}:`, errorMessage)
        }
      }

      // Log dependency creation results
      if (failedDeps.length > 0) {
        console.warn(`[Tasks API] Some dependencies failed to create:`, failedDeps)
      }
    }

    // Log task created event using the existing events system (not task_events)
    try {
      await convex.mutation(api.events.create, {
        projectId: project_id,
        taskId: task.id,
        type: 'task_created',
        actor: 'user',
        data: JSON.stringify({ title, status, priority }),
      })
    } catch (logErr) {
      // Non-fatal — just log the error
      console.warn(`[Tasks API] Failed to log task created event:`, logErr)
    }

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error("[Tasks API] Error creating task:", error)
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    )
  }
}
