import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Task, Project } from "@/lib/types"
import { getAgent } from "@/lib/agents"
import { buildTaskContext, buildTaskLabel } from "@/lib/dispatch/context"

interface PendingDispatch {
  task: Task
  project: Project
  agent: {
    id: string
    name: string
    model: string
    role: string
  }
  context: string
  label: string
}

// GET /api/dispatch/pending — List tasks pending dispatch
// Optional query param: projectId — filter to specific project
export async function GET(request: NextRequest) {
  try {
    const convex = getConvexClient()

    // Get optional projectId from query params
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId") || undefined

    // Get all tasks with dispatch_status = 'pending' using dedicated query
    const tasks = await convex.query(api.tasks.getPendingDispatches, {
      projectId,
    })

    const pending: PendingDispatch[] = []

    for (const task of tasks) {
      // Get project
      const project = await convex.query(api.projects.getById, { id: task.project_id })
      if (!project) continue

      const agentId = task.assignee
      if (!agentId) continue

      const agent = getAgent(agentId)
      if (!agent) continue

      const context = await buildTaskContext(task, project, agentId)
      pending.push({
        task,
        project,
        agent: {
          id: agent.id,
          name: agent.name,
          model: agent.model,
          role: agent.role,
        },
        context,
        label: buildTaskLabel(task),
      })
    }

    return NextResponse.json({
      count: pending.length,
      pending,
    })
  } catch (error) {
    console.error("[Dispatch API] Error fetching pending:", error)
    return NextResponse.json(
      { error: "Failed to fetch pending dispatches" },
      { status: 500 }
    )
  }
}
