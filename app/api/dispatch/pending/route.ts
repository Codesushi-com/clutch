import { NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"
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
    // Get all tasks and filter for pending dispatch
    const tasks = await convexServerClient.query(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "tasks/getByStatus" },
      { status: "in_progress" }
    ) as Task[]

    const pendingTasks = tasks.filter((t) => t.dispatch_status === "pending")

    const pending: PendingDispatch[] = []
    
    for (const task of pendingTasks) {
      // Get project for each task
      const project = await convexServerClient.query(
        // @ts-expect-error - Convex self-hosted uses any api type
        { name: "projects/getById" },
        { id: task.project_id }
      ) as Project | null
      
      if (!project) continue
      
      const agentId = task.assignee
      if (!agentId) continue
      
      const agent = getAgent(agentId)
      if (!agent) continue
      
      pending.push({
        task,
        project,
        agent: {
          id: agent.id,
          name: agent.name,
          model: agent.model,
          role: agent.role,
        },
        context: buildTaskContext(task, project, agentId),
        label: buildTaskLabel(task),
      })
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = {
      urgent: 1,
      high: 2,
      medium: 3,
      low: 4,
    }

    pending.sort((a, b) => {
      const pDiff = (priorityOrder[a.task.priority] || 5) - (priorityOrder[b.task.priority] || 5)
      if (pDiff !== 0) return pDiff
      // Then by dispatch_requested_at
      const aTime = a.task.dispatch_requested_at || 0
      const bTime = b.task.dispatch_requested_at || 0
      return aTime - bTime
    })

    return NextResponse.json({
      count: pending.length,
      pending,
    })
  } catch (error) {
    console.error("[dispatch/pending] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch pending dispatches", details: String(error) },
      { status: 500 }
    )
  }
}
