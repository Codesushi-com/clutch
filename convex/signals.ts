// Signal query helpers
import { db } from "@/lib/db"
import type { Signal, SignalKind, SignalSeverity } from "@/lib/db/types"

/**
 * Get all signals for a task, ordered by creation time (newest first)
 */
export function getByTask(taskId: string): Signal[] {
  const signals = db.prepare(`
    SELECT * FROM signals 
    WHERE task_id = ? 
    ORDER BY created_at DESC
  `).all(taskId) as Signal[]
  
  return signals
}

/**
 * Get a single signal by ID
 */
export function getById(signalId: string): Signal | undefined {
  return db.prepare("SELECT * FROM signals WHERE id = ?").get(signalId) as Signal | undefined
}

/**
 * Get pending (unresponded) signals for a task
 */
export function getPendingByTask(taskId: string): Signal[] {
  const signals = db.prepare(`
    SELECT * FROM signals 
    WHERE task_id = ? AND responded_at IS NULL
    ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
      END,
      created_at DESC
  `).all(taskId) as Signal[]
  
  return signals
}

/**
 * Get all pending blocking signals for a task
 */
export function getBlockingByTask(taskId: string): Signal[] {
  const signals = db.prepare(`
    SELECT * FROM signals 
    WHERE task_id = ? AND blocking = 1 AND responded_at IS NULL
    ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
      END,
      created_at DESC
  `).all(taskId) as Signal[]
  
  return signals
}

/**
 * Create a new signal
 */
export function create(
  taskId: string,
  sessionKey: string,
  agentId: string,
  kind: SignalKind,
  message: string,
  options: {
    severity?: SignalSeverity
    blocking?: boolean
  } = {}
): Signal {
  const { severity = "normal", blocking = kind !== "fyi" } = options
  
  const now = Date.now()
  const id = crypto.randomUUID()
  
  const signal: Signal = {
    id,
    task_id: taskId,
    session_key: sessionKey,
    agent_id: agentId,
    kind,
    severity,
    message,
    blocking: blocking ? 1 : 0,
    responded_at: null,
    response: null,
    created_at: now,
  }
  
  db.prepare(`
    INSERT INTO signals (id, task_id, session_key, agent_id, kind, severity, message, blocking, responded_at, response, created_at)
    VALUES (@id, @task_id, @session_key, @agent_id, @kind, @severity, @message, @blocking, @responded_at, @response, @created_at)
  `).run(signal)
  
  return signal
}

/**
 * Mark a signal as responded with a response message
 */
export function respond(signalId: string, response: string): Signal | undefined {
  const signal = getById(signalId)
  if (!signal) {
    return undefined
  }
  
  // Check if already responded
  if (signal.responded_at !== null) {
    return signal
  }
  
  const now = Date.now()
  
  db.prepare(`
    UPDATE signals 
    SET response = ?, responded_at = ?
    WHERE id = ?
  `).run(response, now, signalId)
  
  return getById(signalId)
}

/**
 * Check if a signal has been responded to
 */
export function isResponded(signalId: string): boolean {
  const signal = getById(signalId)
  return signal !== undefined && signal.responded_at !== null
}

/**
 * Delete a signal
 */
export function deleteSignal(signalId: string): boolean {
  const result = db.prepare("DELETE FROM signals WHERE id = ?").run(signalId)
  return result.changes > 0
}

/**
 * Get all pending signals across all tasks
 * Used by the gate to check for blocking signals
 */
export function getAllPending(options: {
  onlyBlocking?: boolean
  limit?: number
} = {}): Signal[] {
  const { onlyBlocking = false, limit = 50 } = options
  
  let query = `
    SELECT * FROM signals 
    WHERE responded_at IS NULL
  `
  
  if (onlyBlocking) {
    query += " AND blocking = 1"
  }
  
  query += `
    ORDER BY 
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
      END,
      created_at DESC
    LIMIT ?
  `
  
  return db.prepare(query).all(limit) as Signal[]
}

/**
 * Count pending signals
 */
export function countPending(options: {
  onlyBlocking?: boolean
  taskId?: string
} = {}): number {
  const { onlyBlocking = false, taskId } = options
  
  let query = "SELECT COUNT(*) as count FROM signals WHERE responded_at IS NULL"
  const params: (string | number)[] = []
  
  if (onlyBlocking) {
    query += " AND blocking = 1"
  }
  
  if (taskId) {
    query += " AND task_id = ?"
    params.push(taskId)
  }
  
  const result = db.prepare(query).get(...params) as { count: number }
  return result.count
}

/**
 * Get signals by session key
 * Useful for finding all signals from a specific agent session
 */
export function getBySessionKey(sessionKey: string): Signal[] {
  return db.prepare(`
    SELECT * FROM signals 
    WHERE session_key = ?
    ORDER BY created_at DESC
  `).all(sessionKey) as Signal[]
}
