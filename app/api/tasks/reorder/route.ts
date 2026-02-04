import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { wsManager } from "@/lib/websocket/server"
import type { Task } from "@/lib/db/types"

// POST /api/tasks/reorder — Reorder tasks within a column
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const { 
    project_id, 
    status, 
    task_id, 
    new_index,
  } = body
  
  if (!project_id || !status || !task_id || new_index === undefined) {
    return NextResponse.json(
      { error: "project_id, status, task_id, and new_index are required" },
      { status: 400 }
    )
  }

  try {
    // Get all tasks in this column ordered by position
    const tasks = db.prepare(`
      SELECT id, position FROM tasks 
      WHERE project_id = ? AND status = ? 
      ORDER BY position ASC, created_at ASC
    `).all(project_id, status) as { id: string; position: number }[]

    const taskIndex = tasks.findIndex(t => t.id === task_id)
    if (taskIndex === -1) {
      return NextResponse.json(
        { error: "Task not found in this column" },
        { status: 404 }
      )
    }

    // If position hasn't changed, return early
    if (taskIndex === new_index) {
      return NextResponse.json({ success: true })
    }

    // Remove task from current position
    const [movedTask] = tasks.splice(taskIndex, 1)
    
    // Insert at new position
    tasks.splice(new_index, 0, movedTask)

    // Update positions for all affected tasks
    const updateStmt = db.prepare(`
      UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?
    `)

    const now = Date.now()
    
    // Use a transaction for atomicity
    db.transaction(() => {
      tasks.forEach((task, index) => {
        updateStmt.run(index, now, task.id)
      })
    })()

    // Get the updated task to broadcast via WebSocket
    const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task_id) as Task
    if (updatedTask) {
      wsManager.broadcastToProject(project_id, {
        type: 'task:updated',
        data: updatedTask
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error reordering tasks:", error)
    return NextResponse.json(
      { error: "Failed to reorder tasks" },
      { status: 500 }
    )
  }
}
