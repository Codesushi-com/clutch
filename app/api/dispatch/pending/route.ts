import { NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { Task, Project } from "@/lib/db/types"
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
export async function GET() {
  try {
    const convex = getConvexClient()

    // Get all tasks with dispatch_status = 'pending'
    // TODO: Add a dedicated Convex query for pending dispatches
    const allTasks = await convex.query(api.tasks.getByProject, {
      projectId: "da46e964-a6d1-498a-85a8-c4795e980657", // TODO: should query across all projects
    })

    const tasks = allTasks.filter(
      (t: Task) => t.dispatch_status === "pending"
    )

    // Sort by priority then dispatch time
    const priorityOrder: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 }
    tasks.sort((a: Task, b: Task) => {
      const pa = priorityOrder[a.priority] || 3
      const pb = priorityOrder[b.priority] || 3
      if (pa !== pb) return pa - pb
      return (a.dispatch_requested_at || 0) - (b.dispatch_requested_at || 0)
    })

    const pending: PendingDispatch[] = []

    for (const task of tasks) {
      // Get project
      const projects = await convex.query(api.projects.getAll, {})
      const project = projects.find((p: Project) => p.id === task.project_id)
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
