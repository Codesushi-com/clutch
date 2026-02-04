import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Task, Project } from "@/lib/db/types"
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
  
  // Get task
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }
  
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
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(task.project_id) as Project | undefined
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }
  
  // Build context for the agent
  const taskContext = buildTaskContext(task, project, agentId)
  const taskLabel = buildTaskLabel(task)
  
  const now = Date.now()
  const requestedBy = body.requestedBy || "api"
  
  // Update task with dispatch request
  db.prepare(`
    UPDATE tasks 
    SET 
      assignee = ?,
      dispatch_status = 'pending',
      dispatch_requested_at = ?,
      dispatch_requested_by = ?,
      updated_at = ?
    WHERE id = ?
  `).run(agentId, now, requestedBy, now, id)
  
  // Log event
  db.prepare(`
    INSERT INTO events (id, project_id, task_id, type, actor, data, created_at)
    VALUES (?, ?, ?, 'task_assigned', ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    task.project_id,
    task.id,
    requestedBy,
    JSON.stringify({ agentId, dispatch_status: "pending" }),
    now
  )
  
  return NextResponse.json({
    success: true,
    dispatch: {
      taskId: task.id,
      agentId,
      status: "pending",
      label: taskLabel,
      requestedAt: now,
      requestedBy,
    },
    context: taskContext, // Include for debugging/preview
  })
}

// GET /api/tasks/:id/dispatch — Get dispatch status and context preview
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }
  
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(task.project_id) as Project | undefined
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
}
