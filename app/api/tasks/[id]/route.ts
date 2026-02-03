import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Task, Comment } from "@/lib/db/types"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/tasks/[id] — Get task with comments
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined

  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  const comments = db.prepare(`
    SELECT * FROM comments 
    WHERE task_id = ? 
    ORDER BY created_at ASC
  `).all(id) as Comment[]

  return NextResponse.json({ task, comments })
}

// PATCH /api/tasks/[id] — Update task
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined
  
  if (!existing) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  const { 
    title, 
    description, 
    status, 
    priority,
    assignee,
    requires_human_review,
    tags,
    session_id,
  } = body

  const now = Date.now()
  
  // Track if status changed to done
  const wasCompleted = existing.status !== "done" && status === "done"
  
  const updated: Task = {
    ...existing,
    title: title ?? existing.title,
    description: description !== undefined ? description : existing.description,
    status: status ?? existing.status,
    priority: priority ?? existing.priority,
    assignee: assignee !== undefined ? assignee : existing.assignee,
    requires_human_review: requires_human_review !== undefined 
      ? (requires_human_review ? 1 : 0) 
      : existing.requires_human_review,
    tags: tags !== undefined ? (tags ? JSON.stringify(tags) : null) : existing.tags,
    session_id: session_id !== undefined ? session_id : existing.session_id,
    updated_at: now,
    completed_at: wasCompleted ? now : existing.completed_at,
  }

  db.prepare(`
    UPDATE tasks 
    SET title = @title, description = @description, status = @status,
        priority = @priority, assignee = @assignee, 
        requires_human_review = @requires_human_review, tags = @tags,
        session_id = @session_id, updated_at = @updated_at, completed_at = @completed_at
    WHERE id = @id
  `).run(updated)

  return NextResponse.json({ task: updated })
}

// DELETE /api/tasks/[id] — Delete task
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  const existing = db.prepare("SELECT id FROM tasks WHERE id = ?").get(id)
  
  if (!existing) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  db.prepare("DELETE FROM tasks WHERE id = ?").run(id)

  return NextResponse.json({ success: true })
}
