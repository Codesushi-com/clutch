import { NextResponse } from "next/server"
import { db } from "@/lib/db"

interface GateStatus {
  needsAttention: boolean
  reason: string | null
  details: {
    readyTasks: number
    pendingInputs: number
    stuckTasks: number
    reviewTasks: number
    pendingDispatch: number
    unreadEscalations: number
  }
  tasks?: {
    ready: Array<{ id: string; title: string; priority: string }>
    pendingInput: Array<{ taskId: string; taskTitle: string; author: string; content: string }>
    stuck: Array<{ id: string; title: string; assignee: string; hours: number }>
    review: Array<{ id: string; title: string; assignee: string }>
    pendingDispatch: Array<{ id: string; title: string; assignee: string }>
  }
  escalations?: Array<{ id: string; severity: string; message: string; agent: string }>
  timestamp: number
}

// GET /api/gate — Check if coordinator should wake
export async function GET() {
  const now = Date.now()
  const twoHoursAgo = now - (2 * 60 * 60 * 1000)
  
  // Get counts for all conditions
  const counts = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM tasks WHERE status = 'ready' AND assignee IS NULL) as ready_tasks,
      (SELECT COUNT(*) FROM comments WHERE type = 'request_input' AND responded_at IS NULL) as pending_inputs,
      (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress' AND updated_at < ?) as stuck_tasks,
      (SELECT COUNT(*) FROM tasks WHERE status = 'review') as review_tasks,
      (SELECT COUNT(*) FROM tasks WHERE dispatch_status = 'pending') as pending_dispatch,
      (SELECT COUNT(*) FROM notifications WHERE type = 'escalation' AND read = 0) as unread_escalations
  `).get(twoHoursAgo) as {
    ready_tasks: number
    pending_inputs: number
    stuck_tasks: number
    review_tasks: number
    pending_dispatch: number
    unread_escalations: number
  }
  
  // Build detailed response
  const status: GateStatus = {
    needsAttention: false,
    reason: null,
    details: {
      readyTasks: counts.ready_tasks,
      pendingInputs: counts.pending_inputs,
      stuckTasks: counts.stuck_tasks,
      reviewTasks: counts.review_tasks,
      pendingDispatch: counts.pending_dispatch,
      unreadEscalations: counts.unread_escalations,
    },
    timestamp: now,
  }
  
  // Build reasons list (priority order)
  const reasons: string[] = []
  
  if (counts.unread_escalations > 0) {
    reasons.push(`${counts.unread_escalations} unread escalation(s)`)
  }
  if (counts.pending_inputs > 0) {
    reasons.push(`${counts.pending_inputs} pending input request(s)`)
  }
  if (counts.pending_dispatch > 0) {
    reasons.push(`${counts.pending_dispatch} task(s) pending dispatch`)
  }
  if (counts.ready_tasks > 0) {
    reasons.push(`${counts.ready_tasks} task(s) ready for assignment`)
  }
  if (counts.stuck_tasks > 0) {
    reasons.push(`${counts.stuck_tasks} task(s) stuck > 2 hours`)
  }
  if (counts.review_tasks > 0) {
    reasons.push(`${counts.review_tasks} task(s) ready for review`)
  }
  
  if (reasons.length > 0) {
    status.needsAttention = true
    status.reason = reasons.join("; ")
    
    // Fetch task details
    const tasks: NonNullable<GateStatus["tasks"]> = {
      ready: db.prepare(`
        SELECT id, title, priority FROM tasks 
        WHERE status = 'ready' AND assignee IS NULL
        ORDER BY 
          CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
        LIMIT 10
      `).all() as Array<{ id: string; title: string; priority: string }>,
      
      pendingInput: db.prepare(`
        SELECT c.task_id as taskId, t.title as taskTitle, c.author, c.content
        FROM comments c
        JOIN tasks t ON c.task_id = t.id
        WHERE c.type = 'request_input' AND c.responded_at IS NULL
        ORDER BY c.created_at
        LIMIT 10
      `).all() as Array<{ taskId: string; taskTitle: string; author: string; content: string }>,
      
      stuck: db.prepare(`
        SELECT id, title, assignee, 
          CAST((? - updated_at) / 3600000.0 AS INT) as hours
        FROM tasks 
        WHERE status = 'in_progress' AND updated_at < ?
        ORDER BY updated_at
        LIMIT 10
      `).all(now, twoHoursAgo) as Array<{ id: string; title: string; assignee: string; hours: number }>,
      
      review: db.prepare(`
        SELECT id, title, assignee FROM tasks 
        WHERE status = 'review'
        ORDER BY updated_at DESC
        LIMIT 10
      `).all() as Array<{ id: string; title: string; assignee: string }>,
      
      pendingDispatch: db.prepare(`
        SELECT id, title, assignee FROM tasks 
        WHERE dispatch_status = 'pending'
        ORDER BY dispatch_requested_at
        LIMIT 10
      `).all() as Array<{ id: string; title: string; assignee: string }>,
    }
    
    status.tasks = tasks
    
    // Fetch escalations
    if (counts.unread_escalations > 0) {
      status.escalations = db.prepare(`
        SELECT id, severity, message, agent FROM notifications
        WHERE type = 'escalation' AND read = 0
        ORDER BY 
          CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
          created_at DESC
        LIMIT 10
      `).all() as GateStatus["escalations"]
    }
  }
  
  // Log check (could be persisted to DB)
  console.log(
    `[gate_check] needsAttention=${status.needsAttention} ` +
    `ready=${counts.ready_tasks} pending=${counts.pending_inputs} ` +
    `dispatch=${counts.pending_dispatch} stuck=${counts.stuck_tasks} ` +
    `review=${counts.review_tasks} escalations=${counts.unread_escalations}`
  )
  
  return NextResponse.json(status)
}
