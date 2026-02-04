import { NextResponse } from "next/server"
import { db } from "@/lib/db"
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
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE dispatch_status = 'pending'
    ORDER BY 
      CASE priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      dispatch_requested_at ASC
  `).all() as Task[]
  
  const pending: PendingDispatch[] = []
  
  for (const task of tasks) {
    const project = db.prepare(
      "SELECT * FROM projects WHERE id = ?"
    ).get(task.project_id) as Project | undefined
    
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
  
  return NextResponse.json({
    count: pending.length,
    pending,
  })
}
