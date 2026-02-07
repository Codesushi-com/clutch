/**
 * Notification Phase
 *
 * Detects undelivered blocking PM signals and routes them to the user
 * via the OpenClaw gateway (Discord). Marks signals as delivered after
 * successful notification.
 */

import { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import { getGatewayClient } from "../gateway-client"
import type { Signal, WorkLoopPhase } from "../../lib/types"

// ============================================
// Types
// ============================================

interface NotifyContext {
  convex: ConvexHttpClient
  cycle: number
  projectId: string
  log: (params: {
    projectId: string
    cycle: number
    phase: WorkLoopPhase
    action: string
    taskId?: string
    sessionKey?: string
    details?: Record<string, unknown>
    durationMs?: number
  }) => Promise<void>
}

interface NotifyResult {
  notifiedCount: number
  errors: string[]
}

// ============================================
// Constants
// ============================================

const DISCORD_SESSION_KEY = "agent:main:trap" // Main session for Discord notifications

// ============================================
// Notification Phase
// ============================================

/**
 * Run the notification phase.
 *
 * Checks for undelivered blocking signals and sends them to the user
 * via the OpenClaw gateway. Marks signals as delivered after sending.
 */
export async function runNotify(ctx: NotifyContext): Promise<NotifyResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let notifiedCount = 0

  // Get undelivered blocking signals
  const signals = await ctx.convex.query(api.signals.getUndeliveredBlocking, { limit: 20 })

  if (signals.length === 0) {
    return { notifiedCount: 0, errors: [] }
  }

  console.log(`[Notify] Found ${signals.length} undelivered blocking signal(s)`)

  // Group signals by task for batched notifications
  const signalsByTask = groupSignalsByTask(signals)

  // Process each task's signals
  for (const [taskId, taskSignals] of signalsByTask) {
    try {
      // Get task details
      const taskResult = await ctx.convex.query(api.tasks.getById, { id: taskId })
      if (!taskResult || !taskResult.task) {
        errors.push(`Task not found: ${taskId}`)
        continue
      }
      const task = taskResult.task

      // Format and send notification
      const message = formatNotificationMessage(task.title, task.id, taskSignals)
      await sendDiscordNotification(message)

      // Mark all signals for this task as delivered
      for (const signal of taskSignals) {
        try {
          await ctx.convex.mutation(api.signals.markDelivered, { id: signal.id })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          errors.push(`Failed to mark signal ${signal.id} as delivered: ${errorMsg}`)
        }
      }

      notifiedCount += taskSignals.length

      // Log the notification
      await ctx.log({
        projectId: ctx.projectId,
        cycle: ctx.cycle,
        phase: "notify",
        action: "signal_notified",
        taskId: taskId,
        details: {
          signalCount: taskSignals.length,
          signalIds: taskSignals.map((s) => s.id),
        },
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed to process task ${taskId}: ${errorMsg}`)

      await ctx.log({
        projectId: ctx.projectId,
        cycle: ctx.cycle,
        phase: "notify",
        action: "notify_failed",
        taskId: taskId,
        details: { error: errorMsg },
      })
    }
  }

  const durationMs = Date.now() - startTime
  console.log(`[Notify] Completed in ${durationMs}ms, notified ${notifiedCount} signal(s)`)

  return { notifiedCount, errors }
}

// ============================================
// Helpers
// ============================================

/**
 * Group signals by their task ID.
 */
function groupSignalsByTask(signals: Signal[]): Map<string, Signal[]> {
  const grouped = new Map<string, Signal[]>()
  for (const signal of signals) {
    const existing = grouped.get(signal.task_id) ?? []
    existing.push(signal)
    grouped.set(signal.task_id, existing)
  }
  return grouped
}

/**
 * Format a notification message for Discord.
 */
function formatNotificationMessage(taskTitle: string, taskId: string, signals: Signal[]): string {
  const shortId = taskId.slice(0, 8)

  // Extract questions from signal messages
  const questions: string[] = []
  for (const signal of signals) {
    // Split message by newlines and filter out empty lines
    const lines = signal.message
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Add each non-empty line as a question
    for (const line of lines) {
      questions.push(line)
    }
  }

  // Build the message
  let message = `📋 **Issue \`${shortId}\`: ${taskTitle}**\n\n`
  message += "The PM agent has some questions before this can be worked on:\n\n"

  // Number the questions
  questions.forEach((q, idx) => {
    message += `${idx + 1}. ${q}\n`
  })

  message += "\nReply here or in Trap chat to answer."

  return message
}

/**
 * Send a notification message to Discord via the OpenClaw gateway.
 */
async function sendDiscordNotification(message: string): Promise<void> {
  const gateway = getGatewayClient()

  try {
    // Connect to gateway if not already connected
    await gateway.connect()

    // Send message via sessions.send RPC
    await gateway.request(
      "sessions.send",
      {
        sessionKey: DISCORD_SESSION_KEY,
        message: message,
      },
      30000 // 30 second timeout for sending
    )

    console.log(`[Notify] Sent notification to Discord session ${DISCORD_SESSION_KEY}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to send Discord notification: ${errorMsg}`)
  }
}
