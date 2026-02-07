/**
 * Signals Phase
 *
 * Detects tasks that have received responses to their signals and re-queues
 * them for the PM agent to continue processing with the new context.
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { LogRunParams } from "../logger"
import type { Signal } from "../../lib/types"

// ============================================
// Types
// ============================================

interface ProjectInfo {
  id: string
  slug: string
  name: string
  work_loop_enabled: boolean
  work_loop_max_agents?: number | null
  local_path?: string | null
  github_repo?: string | null
}

interface SignalsContext {
  convex: ConvexHttpClient
  cycle: number
  project: ProjectInfo
  log: (params: LogRunParams) => Promise<void>
}

interface SignalsResult {
  requeuedCount: number
  details: Array<{
    taskId: string
    signalCount: number
  }>
}

// ============================================
// Main Signals Phase
// ============================================

/**
 * Run the signals phase.
 *
 * Finds tasks that:
 * - Are in 'in_progress' status with role='pm'
 * - Have signals with responses that haven't been processed
 *
 * Moves these tasks back to 'ready' status so the PM agent picks them up
 * again with the full Q&A context included in the prompt.
 */
export async function runSignals(ctx: SignalsContext): Promise<SignalsResult> {
  const { convex, cycle, project, log } = ctx

  // Find tasks with responded signals
  const tasksWithSignals = await convex.query(api.signals.getTasksWithRespondedSignals, {
    projectId: project.id,
  })

  await log({
    projectId: project.id,
    cycle,
    phase: "work",
    action: "signals_check",
    details: { tasksFound: tasksWithSignals.length },
  })

  const result: SignalsResult = {
    requeuedCount: 0,
    details: [],
  }

  for (const { taskId, respondedSignalIds } of tasksWithSignals) {
    try {
      // Get the signals to verify they exist
      const signals: Signal[] = []
      for (const signalId of respondedSignalIds) {
        const signal = await convex.query(api.signals.getById, { id: signalId })
        if (signal) {
          signals.push(signal)
        }
      }

      if (signals.length === 0) {
        await log({
          projectId: project.id,
          cycle,
          phase: "work",
          action: "signals_skip",
          taskId,
          details: { reason: "no_valid_signals" },
        })
        continue
      }

      // Move task back to ready (clearing agent fields so PM picks it up fresh)
      await convex.mutation(api.tasks.move, {
        id: taskId,
        status: "ready",
      })

      // Add a comment to track that this was re-queued due to signal responses
      const signalSummary = signals
        .map((s) => `- Q: ${s.message.substring(0, 100)}${s.message.length > 100 ? "..." : ""}`)
        .join("\n")

      await convex.mutation(api.comments.create, {
        taskId,
        author: "system",
        authorType: "coordinator",
        content: `Re-queued for PM after receiving ${signals.length} signal response(s):\n${signalSummary}`,
        type: "status_change",
      })

      result.requeuedCount++
      result.details.push({
        taskId,
        signalCount: signals.length,
      })

      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "signals_requeued",
        taskId,
        details: { signalCount: signals.length },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "signals_error",
        taskId,
        details: { error: message },
      })
    }
  }

  return result
}
