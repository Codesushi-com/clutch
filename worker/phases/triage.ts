/**
 * Triage Phase
 *
 * Sends batched triage messages to Ada's main session when tasks are blocked.
 * This is the core escalation mechanism for Work Loop v2.
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import { getGatewayClient } from "../gateway-client"
import type { LogRunParams } from "../logger"

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

interface TriageContext {
  convex: ConvexHttpClient
  cycle: number
  project: ProjectInfo
  log: (params: LogRunParams) => Promise<void>
}

export interface TriageResult {
  sentCount: number
  taskIds: string[]
}

// ============================================
// Main Triage Phase
// ============================================

/**
 * Run the triage phase.
 *
 * Finds tasks that:
 * - Are in 'blocked' status
 * - Have not been triaged yet (triage_sent_at is undefined)
 *
 * Sends a single batched message to Ada's main session with all
 * untriaged blocked tasks, then marks them as triaged.
 */
export async function runTriage(ctx: TriageContext): Promise<TriageResult> {
  const { convex, cycle, project, log } = ctx

  // Get all blocked tasks for this project
  const blockedTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "blocked",
  })

  // Filter to only untriaged tasks
  const untriaged = blockedTasks.filter((t) => !t.triage_sent_at)

  if (untriaged.length === 0) {
    return { sentCount: 0, taskIds: [] }
  }

  // Build the batched triage message
  const sections: string[] = []

  for (const task of untriaged) {
    // Get the last 3 comments for this task
    const comments = await convex.query(api.comments.getByTask, {
      taskId: task.id,
      limit: 3,
    })

    // Find the last agent comment
    const agentComments = comments.filter((c) => c.author_type === "agent")
    const lastAgentComment = agentComments[agentComments.length - 1]

    const commentContent = lastAgentComment
      ? lastAgentComment.content.slice(0, 500)
      : "No comment left"

    sections.push(
      `**${task.title}** [\`${task.id.slice(0, 8)}\`]\n` +
        `Project: ${project.name} | Role: ${task.role ?? "dev"} | Attempts: ${task.agent_retry_count ?? 0}\n` +
        `Agent comment:\n> ${commentContent}`
    )
  }

  const message = `📋 Triage needed — ${untriaged.length} blocked task(s):\n\n---\n${sections.join("\n\n---\n")}\n\n---\nReview each task. Options: update description + move to ready, change role, escalate to Dan, or move to backlog.\nTask API: PATCH http://localhost:3002/api/tasks/{id}`

  // Send to Ada's main session
  const gw = getGatewayClient()
  await gw.connect()

  try {
    await gw.sendToSession("main", message)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await log({
      projectId: project.id,
      cycle,
      phase: "work",
      action: "triage_send_failed",
      details: { error: errorMessage, taskCount: untriaged.length },
    })
    return { sentCount: 0, taskIds: [] }
  }

  // Mark each task as triaged
  const now = Date.now()
  const triagedTaskIds: string[] = []

  for (const task of untriaged) {
    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        triage_sent_at: now,
      })
      triagedTaskIds.push(task.id)
    } catch (err) {
      // Log but continue — other tasks should still be marked
      const errorMessage = err instanceof Error ? err.message : String(err)
      await log({
        projectId: project.id,
        cycle,
        phase: "work",
        action: "triage_mark_failed",
        taskId: task.id,
        details: { error: errorMessage },
      })
    }
  }

  await log({
    projectId: project.id,
    cycle,
    phase: "work",
    action: "triage_sent",
    details: { taskCount: triagedTaskIds.length, totalBlocked: blockedTasks.length },
  })

  return { sentCount: triagedTaskIds.length, taskIds: triagedTaskIds }
}
