import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { wsManager } from "@/lib/websocket/server"
import type { Task } from "@/lib/db/types"

// GET /api/tasks?projectId=xxx&status=xxx&limit=n — List with filters
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get("projectId")
  const status = searchParams.get("status")
  const limit = searchParams.get("limit")
  
  let query = "SELECT * FROM tasks WHERE 1=1"
  const params: (string | number | null)[] = []
  
  if (projectId) {
    query += " AND project_id = ?"
    params.push(projectId)
  }
  
  if (status) {
    query += " AND status = ?"
    params.push(status)
  }
  
  // For done tasks, sort by completion time (most recent first)
  // For other statuses, sort by position
  if (status === "done") {
    query += " ORDER BY completed_at DESC, updated_at DESC"
  } else {
    query += " ORDER BY position ASC, created_at ASC"
  }
  
  // Apply limit if specified
  if (limit) {
    const limitNum = parseInt(limit, 10)
    if (!isNaN(limitNum) && limitNum > 0) {
      query += " LIMIT ?"
      params.push(limitNum)
    }
  }
  
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
  
  // Get the highest position in this column to append new task at the end
  const maxPositionResult = db.prepare(`
    SELECT MAX(position) as max_pos FROM tasks 
    WHERE project_id = ? AND status = ?
  `).get(project_id, status) as { max_pos: number | null }
  
  const position = (maxPositionResult?.max_pos ?? -1) + 1
  
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
    position,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }

  db.prepare(`
    INSERT INTO tasks (
      id, project_id, title, description, status, priority, 
      assignee, requires_human_review, tags, session_id,
      dispatch_status, dispatch_requested_at, dispatch_requested_by,
      position, created_at, updated_at, completed_at
    )
    VALUES (
      @id, @project_id, @title, @description, @status, @priority,
      @assignee, @requires_human_review, @tags, @session_id,
      @dispatch_status, @dispatch_requested_at, @dispatch_requested_by,
      @position, @created_at, @updated_at, @completed_at
    )
  `).run(task)

  // Emit WebSocket event for real-time updates
  wsManager.broadcastToProject(project_id, {
    type: 'task:created',
    data: task
  })

  return NextResponse.json({ task }, { status: 201 })
}
