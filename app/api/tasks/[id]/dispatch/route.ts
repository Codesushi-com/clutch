import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { getAgent } from "@/lib/agents"
import { buildTaskContext, buildTaskLabel } from "@/lib/dispatch/context"

type RouteContext = {
  params: Promise<{ id: string }>
}

// POST /api/tasks/:id/dispatch — Request dispatch to agent
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  const body = await request.json().catch(() => ({}))

  try {
    const convex = getConvexClient()

    // Get task
    const result = await convex.query(api.tasks.getById, { id })
    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const { task } = result

    // Check if already dispatched
    if (task.dispatch_status === "pending" || task.dispatch_status === "spawning" || task.dispatch_status === "active") {
      return NextResponse.json(
        { error: "Task already has active dispatch", dispatch_status: task.dispatch_status },
        { status: 409 }
      )
    }

    // Determine agent - from body, task assignee, or default
    const agentId = body.agentId || task.assignee
    if (!agentId) {
      return NextResponse.json(
        { error: "No agent specified. Set task assignee or provide agentId." },
        { status: 400 }
      )
    }

    // Verify agent exists
    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentId}` },
        { status: 400 }
      )
    }

    // Get project
    const project = await convex.query(api.projects.getById, { id: task.project_id })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Build context for the agent
    const taskContext = buildTaskContext(task, project, agentId)
    const taskLabel = buildTaskLabel(task)

    const now = Date.now()
    const requestedBy = body.requestedBy || "api"

    // Log event to events table for agent dispatch
    await convex.mutation(api.events.create, {
      projectId: task.project_id,
      taskId: id,
      type: 'agent_started',
      actor: requestedBy,
      data: JSON.stringify({
        agent_id: agentId,
        dispatch_status: 'pending',
        requested_at: now,
      }),
    })

    const dispatchInfo = {
      taskId: task.id,
      agentId,
      status: "pending",
      label: taskLabel,
      requestedAt: now,
      requestedBy,
    }

    return NextResponse.json({
      success: true,
      dispatch: dispatchInfo,
      context: taskContext, // Include for debugging/preview
    })
  } catch (error) {
    console.error("[Dispatch API] Error dispatching task:", error)
    return NextResponse.json(
      { error: "Failed to dispatch task" },
      { status: 500 }
    )
  }
}

// GET /api/tasks/:id/dispatch — Get dispatch status and context preview
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params

  try {
    const convex = getConvexClient()

    const result = await convex.query(api.tasks.getById, { id })
    if (!result) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const { task } = result

    const project = await convex.query(api.projects.getById, { id: task.project_id })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const agentId = task.assignee
    const agent = agentId ? getAgent(agentId) : null

    // Build context preview (only if agent is assigned)
    const contextPreview = agentId
      ? buildTaskContext(task, project, agentId)
      : null

    return NextResponse.json({
      taskId: task.id,
      assignee: agentId,
      agent: agent ? { id: agent.id, name: agent.name, role: agent.role } : null,
      dispatch_status: task.dispatch_status,
      dispatch_requested_at: task.dispatch_requested_at,
      dispatch_requested_by: task.dispatch_requested_by,
      session_id: task.session_id,
      contextPreview,
    })
  } catch (error) {
    console.error("[Dispatch API] Error fetching dispatch status:", error)
    return NextResponse.json(
      { error: "Failed to fetch dispatch status" },
      { status: 500 }
    )
  }
}
