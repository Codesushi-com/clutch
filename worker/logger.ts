/**
 * Work Loop Logger
 *
 * Helpers for logging work loop actions to Convex.
 * All logs go to the workLoopRuns table for audit trail.
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"

// ============================================
// Types
// ============================================

type WorkLoopPhase = "cleanup" | "notify" | "review" | "work" | "analyze" | "idle" | "error"

export interface LogRunParams {
  projectId: string
  cycle: number
  phase: WorkLoopPhase
  action: string
  taskId?: string
  sessionKey?: string
  details?: Record<string, unknown>
  durationMs?: number
}

interface LogCycleCompleteParams {
  projectId: string
  cycle: number
  durationMs: number
  totalActions: number
  phases: {
    cleanup: boolean
    notify: boolean
    review: boolean
    signals: boolean
    work: boolean
    analyze: boolean
  }
}

// ============================================
// ID Generation
// ============================================

/**
 * Generate a UUID v4 string.
 *
 * Simple implementation that doesn't rely on crypto.randomUUID()
 * for maximum compatibility.
 */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === "x" ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// ============================================
// Logging Functions
// ============================================

/**
 * Log a single action to the workLoopRuns table.
 *
 * This is the primary logging function - every significant action
 * in the work loop should be logged via this function.
 */
export async function logRun(
  convex: ConvexHttpClient,
  params: LogRunParams
): Promise<void> {
  try {
    await convex.mutation(api.workLoop.logRun, {
      project_id: params.projectId,
      cycle: params.cycle,
      phase: params.phase,
      action: params.action,
      task_id: params.taskId,
      session_key: params.sessionKey,
      details: params.details ? JSON.stringify(params.details) : undefined,
      duration_ms: params.durationMs,
    })
  } catch (error) {
    // Log to console if Convex logging fails - don't let logging errors
    // break the main loop
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Logger] Failed to log to Convex: ${message}`, params)
  }
}

/**
 * Log cycle completion summary.
 *
 * Creates a summary entry for the entire cycle with aggregate stats.
 */
export async function logCycleComplete(
  convex: ConvexHttpClient,
  params: LogCycleCompleteParams
): Promise<void> {
  await logRun(convex, {
    projectId: params.projectId,
    cycle: params.cycle,
    phase: "idle",
    action: "cycle_complete",
    details: {
      duration_ms: params.durationMs,
      total_actions: params.totalActions,
      phases: params.phases,
    },
    durationMs: params.durationMs,
  })
}
