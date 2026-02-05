import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Signal, SignalKind, SignalSeverity } from "@/lib/db/types"

// GET /api/signal — List pending signals (for gate)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("task_id")
  const kind = searchParams.get("kind")
  const onlyBlocking = searchParams.get("blocking") === "true"
  const onlyUnresponded = searchParams.get("unresponded") === "true"
  const limit = parseInt(searchParams.get("limit") || "50")
  
  const whereConditions: string[] = []
  const params: unknown[] = []
  
  if (taskId) {
    whereConditions.push("task_id = ?")
    params.push(taskId)
  }
  
  if (kind) {
    whereConditions.push("kind = ?")
    params.push(kind)
  }
  
  if (onlyBlocking) {
    whereConditions.push("blocking = 1")
  }
  
  if (onlyUnresponded) {
    whereConditions.push("responded_at IS NULL")
  }
  
  const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : ""
  
  const query = `
    SELECT * FROM signals 
    ${whereClause}
    ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
      END,
      created_at DESC
    LIMIT ?
  `
  
  params.push(limit)
  
  const signals = db.prepare(query).all(...params) as Signal[]
  
  const pendingCount = db.prepare(`
    SELECT COUNT(*) as count FROM signals 
    WHERE blocking = 1 AND responded_at IS NULL
  `).get() as { count: number }
  
  return NextResponse.json({
    signals,
    pendingCount: pendingCount.count,
  })
}

// POST /api/signal — Create signal
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const { 
    taskId,
    sessionKey,
    agentId,
    kind,
    severity = "normal",
    message,
  } = body
  
  if (!taskId || !sessionKey || !agentId || !kind || !message) {
    return NextResponse.json(
      { error: "taskId, sessionKey, agentId, kind, and message are required" },
      { status: 400 }
    )
  }
  
  // Validate kind
  const validKinds: SignalKind[] = ["question", "blocker", "alert", "fyi"]
  if (!validKinds.includes(kind)) {
    return NextResponse.json(
      { error: `Invalid kind. Must be one of: ${validKinds.join(", ")}` },
      { status: 400 }
    )
  }
  
  // Validate severity
  const validSeverities: SignalSeverity[] = ["normal", "high", "critical"]
  if (!validSeverities.includes(severity)) {
    return NextResponse.json(
      { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
      { status: 400 }
    )
  }
  
  // Verify task exists
  const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(taskId)
  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }
  
  const now = Date.now()
  const id = crypto.randomUUID()
  
  // Set blocking based on kind (all kinds except "fyi" are blocking)
  const blocking = kind === "fyi" ? 0 : 1
  
  const signal: Signal = {
    id,
    task_id: taskId,
    session_key: sessionKey,
    agent_id: agentId,
    kind,
    severity,
    message,
    blocking,
    responded_at: null,
    response: null,
    created_at: now,
  }
  
  db.prepare(`
    INSERT INTO signals (id, task_id, session_key, agent_id, kind, severity, message, blocking, responded_at, response, created_at)
    VALUES (@id, @task_id, @session_key, @agent_id, @kind, @severity, @message, @blocking, @responded_at, @response, @created_at)
  `).run(signal)
  
  return NextResponse.json({ 
    signalId: id,
    blocking: Boolean(blocking),
    signal,
  }, { status: 201 })
}