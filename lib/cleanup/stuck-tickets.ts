/**
 * Cleanup utilities for tickets stuck in 'in_review' status
 * without corresponding open PRs (usually due to direct commits to main)
 */

import Database from 'better-sqlite3'
import { Task } from '../db/types'

const STUCK_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export interface StuckTicket {
  id: string
  title: string
  updated_at: number
  age_minutes: number
}

/**
 * Find tickets stuck in 'in_review' status for over 30 minutes
 */
export function findStuckTickets(db: Database.Database, projectId: string): StuckTicket[] {
  const now = Date.now()
  const cutoff = now - STUCK_THRESHOLD_MS
  
  const stmt = db.prepare(`
    SELECT id, title, updated_at
    FROM tasks 
    WHERE project_id = ? 
      AND status = 'in_review'
      AND updated_at < ?
    ORDER BY updated_at ASC
  `)
  
  const rows = stmt.all(projectId, cutoff) as Pick<Task, 'id' | 'title' | 'updated_at'>[]
  
  return rows.map(row => ({
    ...row,
    age_minutes: Math.round((now - row.updated_at) / (1000 * 60))
  }))
}

/**
 * Mark a ticket as done and set completion timestamp
 */
export function markTicketDone(db: Database.Database, ticketId: string): void {
  const now = Date.now()
  
  const stmt = db.prepare(`
    UPDATE tasks 
    SET status = 'done', 
        updated_at = ?, 
        completed_at = ?
    WHERE id = ?
  `)
  
  stmt.run(now, now, ticketId)
}

/**
 * Move a ticket back to 'ready' status (for incomplete work)
 */
export function markTicketReady(db: Database.Database, ticketId: string): void {
  const now = Date.now()
  
  const stmt = db.prepare(`
    UPDATE tasks 
    SET status = 'ready', 
        updated_at = ?,
        completed_at = NULL
    WHERE id = ?
  `)
  
  stmt.run(now, ticketId)
}