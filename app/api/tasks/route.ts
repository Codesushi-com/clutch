import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Task } from "@/lib/db/types"

// GET /api/tasks?projectId=xxx&status=xxx — List with filters
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")
  const status = searchParams.get("status")
  
  let query = "SELECT * FROM tasks WHERE 1=1"
  const params: (string | null)[] = []
  
  if (projectId) {
    query += " AND project_id = ?"
    params.push(projectId)
  }
  
  if (status) {
    query += " AND status = ?"
    params.push(status)
  }
  
  query += " ORDER BY created_at DESC"
  
  const tasks = db.prepare(query).all(...params) as Task[]

  return NextResponse.json({ tasks })
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
  } = body
  
  if (!project_id || !title) {
    return NextResponse.json(
      { error: "project_id and title are required" },
      { status: 400 }
    )
  }

  // Verify project exists
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(project_id)
  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    )
  }

  const now = Date.now()
  const id = crypto.randomUUID()
  
  const task: Task = {
    id,
    project_id,
    title,
    description: description || null,
    status,
    priority,
    assignee: assignee || null,
    requires_human_review: requires_human_review ? 1 : 0,
    tags: tags ? JSON.stringify(tags) : null,
    session_id: null,
    dispatch_status: null,
    dispatch_requested_at: null,
    dispatch_requested_by: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }

  db.prepare(`
    INSERT INTO tasks (
      id, project_id, title, description, status, priority, 
      assignee, requires_human_review, tags, session_id,
      dispatch_status, dispatch_requested_at, dispatch_requested_by,
      created_at, updated_at, completed_at
    )
    VALUES (
      @id, @project_id, @title, @description, @status, @priority,
      @assignee, @requires_human_review, @tags, @session_id,
      @dispatch_status, @dispatch_requested_at, @dispatch_requested_by,
      @created_at, @updated_at, @completed_at
    )
  `).run(task)

  return NextResponse.json({ task }, { status: 201 })
}
