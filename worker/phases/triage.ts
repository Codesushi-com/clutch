/**
 * Triage Phase
 *
 * Automatically triages blocked tasks by sending context to Ada's main session.
 * Implements circuit breaker (max 3 attempts) and rate limiting (max 2 per cycle).
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
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
  escalatedCount: number
  taskIds: string[]
  escalatedIds: string[]
}

interface BlockedTask {
  id: string
  title: string
  description: string | null
  role: string | null
  agent_session_key: string | null
  agent_model: string | null
  agent_retry_count: number | null
  auto_triage_count: number | null
  triage_sent_at: number | null
  escalated: number | null
  updated_at: number
}

// ============================================
// Constants
// ============================================

const MAX_TRIAGE_PER_CYCLE = 2
const MAX_AUTO_TRIAGE_ATTEMPTS = 3

// ============================================
// Main Triage Phase
// ============================================

/**
 * Run the triage phase.
 *
 * Finds blocked tasks that need triage and sends them to Ada:
 * - Tasks with status 'blocked' where triage_sent_at is null OR auto_triage_count < 3
 * - Rate limited to MAX_TRIAGE_PER_CYCLE per run
 * - Circuit breaker escalates after MAX_AUTO_TRIAGE_ATTEMPTS attempts
 */
export async function runTriage(ctx: TriageContext): Promise<TriageResult> {
  const { convex, cycle, project, log } = ctx

  // Get all blocked tasks for this project
  const blockedTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "blocked",
  })

  // Filter to tasks that need triage (not yet sent, or under circuit breaker limit)
  const tasksNeedingTriage = blockedTasks.filter((t: BlockedTask) => {
    // Skip already escalated tasks
    if (t.escalated) return false

    const triageCount = t.auto_triage_count ?? 0
    const hasNeverBeenTriaged = !t.triage_sent_at
    const underCircuitBreaker = triageCount < MAX_AUTO_TRIAGE_ATTEMPTS

    return hasNeverBeenTriaged || underCircuitBreaker
  })

  if (tasksNeedingTriage.length === 0) {
    return { sentCount: 0, escalatedCount: 0, taskIds: [], escalatedIds: [] }
  }

  console.log(`[Triage] Found ${tasksNeedingTriage.length} blocked tasks needing triage for project ${project.slug}`)

  // Sort by oldest first (by updated_at)
  tasksNeedingTriage.sort((a: BlockedTask, b: BlockedTask) => a.updated_at - b.updated_at)

  // Rate limit: only process up to MAX_TRIAGE_PER_CYCLE tasks per cycle
  const tasksToProcess = tasksNeedingTriage.slice(0, MAX_TRIAGE_PER_CYCLE)

  const triagedTaskIds: string[] = []
  const escalatedIds: string[] = []
  const now = Date.now()

  for (const task of tasksToProcess) {
    const triageCount = task.auto_triage_count ?? 0

    // Circuit breaker check: if this would be the 3rd attempt, escalate instead
    if (triageCount >= MAX_AUTO_TRIAGE_ATTEMPTS - 1) {
      await escalateTask(convex, task, cycle, log, "max_auto_triage_reached", project)
      escalatedIds.push(task.id)
      continue
    }

    // Build triage context for Ada
    const triageMessage = await buildTriageMessage(convex, task, project)

    // Send to Ada's main session via HTTP RPC (WS client hangs on sessions.send)
    try {
      console.log(`[Triage] Sending triage for task ${task.id.slice(0, 8)} "${task.title}" to Ada (attempt ${triageCount + 1})`)
      const proxyUrl = process.env.TRAP_URL || "http://127.0.0.1:3002"
      const resp = await fetch(`${proxyUrl}/api/openclaw/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "req",
          id: `triage-${task.id.slice(0, 8)}-${Date.now()}`,
          method: "chat.send",
          params: {
            sessionKey: "main",
            message: triageMessage,
            idempotencyKey: `triage-${task.id.slice(0, 8)}-${Date.now()}`,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      }
      const result = await resp.json()
      if (result.ok === false) {
        throw new Error(result.error?.message ?? "RPC error")
      }
      console.log(`[Triage] Successfully sent triage for task ${task.id.slice(0, 8)}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[Triage] Failed to send triage for task ${task.id.slice(0, 8)}: ${errorMessage}`)
      await log({
        projectId: project.id,
        cycle,
        phase: "triage",
        action: "triage_send_failed",
        taskId: task.id,
        details: { error: errorMessage, triageCount },
      })
      continue
    }

    // Update task: set triage_sent_at and increment auto_triage_count
    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        triage_sent_at: now,
        auto_triage_count: triageCount + 1,
      })

      triagedTaskIds.push(task.id)

      await log({
        projectId: project.id,
        cycle,
        phase: "triage",
        action: "triage_sent",
        taskId: task.id,
        details: { triageCount: triageCount + 1 },
      })

      // Log task_event for triage
      await convex.mutation(api.task_events.create, {
        taskId: task.id,
        eventType: "triage_sent",
        actor: "work-loop",
        data: JSON.stringify({
          triage_count: triageCount + 1,
          max_attempts: MAX_AUTO_TRIAGE_ATTEMPTS,
        }),
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await log({
        projectId: project.id,
        cycle,
        phase: "triage",
        action: "triage_update_failed",
        taskId: task.id,
        details: { error: errorMessage },
      })
    }
  }

  return {
    sentCount: triagedTaskIds.length,
    escalatedCount: escalatedIds.length,
    taskIds: triagedTaskIds,
    escalatedIds,
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Escalate a task after circuit breaker trips
 */
async function escalateTask(
  convex: ConvexHttpClient,
  task: BlockedTask,
  cycle: number,
  log: (params: LogRunParams) => Promise<void>,
  reason: string,
  project: ProjectInfo
): Promise<void> {
  try {
    // Update task: set escalated flag
    await convex.mutation(api.tasks.update, {
      id: task.id,
      escalated: true,
    })

    // Create notification for Dan
    await convex.mutation(api.notifications.create, {
      taskId: task.id,
      projectId: project.id,
      type: "escalation",
      severity: "critical",
      title: `🚨 Escalated: ${task.title}`,
      message: `Auto-triage circuit breaker: ${reason} (3 attempts exhausted)`,
    })

    await log({
      projectId: project.id,
      cycle,
      phase: "triage",
      action: "triage_escalated",
      taskId: task.id,
      details: { reason },
    })

    // Log task_event for escalation
    await convex.mutation(api.task_events.create, {
      taskId: task.id,
      eventType: "triage_escalated",
      actor: "work-loop",
      data: JSON.stringify({ reason }),
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await log({
      projectId: project.id,
      cycle,
      phase: "triage",
      action: "triage_escalate_failed",
      taskId: task.id,
      details: { error: errorMessage, reason },
    })
  }
}

/**
 * Build a comprehensive triage message for Ada
 */
async function buildTriageMessage(
  convex: ConvexHttpClient,
  task: BlockedTask,
  project: ProjectInfo
): Promise<string> {
  // Get the latest comments for this task
  const comments = await convex.query(api.comments.getByTask, {
    taskId: task.id,
    limit: 5,
  })

  // Find the latest blocker comment (agent comment explaining why blocked)
  const agentComments = comments.filter((c: { author_type: string; content: string }) => c.author_type === "agent")
  const lastAgentComment = agentComments[agentComments.length - 1]

  // Build the triage context
  const triageCount = (task.auto_triage_count ?? 0) + 1
  const maxAttempts = MAX_AUTO_TRIAGE_ATTEMPTS

  const sections: string[] = []

  sections.push(`🚨 TRIPWIRE ACTIVATED — Blocked Task Needs Triage`)
  sections.push(``)
  sections.push(`**Task ID:** \`${task.id}\``)
  sections.push(`**Project:** ${project.name}`)
  sections.push(`**Triage Attempt:** ${triageCount} of ${maxAttempts}`)
  sections.push(``)
  sections.push(`---`)
  sections.push(``)
  sections.push(`## Task Details`)
  sections.push(``)
  sections.push(`**Title:** ${task.title}`)

  if (task.description) {
    sections.push(``)
    sections.push(`**Description:**`)
    sections.push(task.description.slice(0, 1000))
  }

  if (task.role) {
    sections.push(``)
    sections.push(`**Role:** ${task.role}`)
  }

  sections.push(``)
  sections.push(`---`)
  sections.push(``)
  sections.push(`## Agent Context`)
  sections.push(``)
  sections.push(`**Session Key:** ${task.agent_session_key ?? "N/A"}`)
  sections.push(`**Model Used:** ${task.agent_model ?? "default"}`)
  sections.push(`**Previous Attempts:** ${task.agent_retry_count ?? 0}`)

  if (lastAgentComment) {
    sections.push(``)
    sections.push(`**Last Agent Comment (Blocker):**`)
    sections.push(`> ${lastAgentComment.content.slice(0, 800)}`)
  } else {
    sections.push(``)
    sections.push(`*No agent comment found — task may have been manually blocked*`)
  }

  sections.push(``)
  sections.push(`---`)
  sections.push(``)
  sections.push(`## Available Actions`)
  sections.push(``)
  sections.push(`You can take action via the Trap API. Here are the available options:`)
  sections.push(``)

  // Build curl examples using regular string concatenation to avoid escaping issues
  const taskId = task.id

  sections.push(`### 1. Unblock and Retry`)
  sections.push(`Move task back to ready status for another attempt:`)
  sections.push("```bash")
  sections.push("curl -X POST http://localhost:3002/api/triage/unblock \\")
  sections.push("  -H 'Content-Type: application/json' \\")
  sections.push(`  -d '{"task_id": "${taskId}", "actor": "ada"}'`)
  sections.push("```")
  sections.push(``)

  sections.push(`### 2. Reassign with Different Role/Model`)
  sections.push(`Change the role or model and retry:`)
  sections.push("```bash")
  sections.push("curl -X POST http://localhost:3002/api/triage/reassign \\")
  sections.push("  -H 'Content-Type: application/json' \\")
  sections.push(`  -d '{"task_id": "${taskId}", "actor": "ada", "role": "dev", "agent_model": "sonnet"}'`)
  sections.push("```")
  sections.push(``)

  sections.push(`### 3. Split into Subtasks`)
  sections.push(`Break the task into smaller pieces:`)
  sections.push("```bash")
  sections.push("curl -X POST http://localhost:3002/api/triage/split \\")
  sections.push("  -H 'Content-Type: application/json' \\")
  sections.push(`  -d '{"task_id": "${taskId}", "actor": "ada", "subtasks": [{"title": "Subtask 1", "role": "dev"}]}'`)
  sections.push("```")
  sections.push(``)

  sections.push(`### 4. Escalate to Dan`)
  sections.push(`If unsure, escalate for human review:`)
  sections.push("```bash")
  sections.push("curl -X POST http://localhost:3002/api/triage/escalate \\")
  sections.push("  -H 'Content-Type: application/json' \\")
  sections.push(`  -d '{"task_id": "${taskId}", "actor": "ada", "reason": "Need clarification on requirements"}'`)
  sections.push("```")
  sections.push(``)

  sections.push(`### 5. Kill (Move to Backlog)`)
  sections.push(`If the task is no longer relevant:`)
  sections.push("```bash")
  sections.push("curl -X POST http://localhost:3002/api/triage/kill \\")
  sections.push("  -H 'Content-Type: application/json' \\")
  sections.push(`  -d '{"task_id": "${taskId}", "actor": "ada", "reason": "Requirements changed"}'`)
  sections.push("```")
  sections.push(``)

  sections.push(`---`)
  sections.push(``)
  sections.push(`## Instructions`)
  sections.push(``)
  sections.push(`1. **Review the blocker comment** to understand what went wrong`)
  sections.push(`2. **Check the agent session** (session key provided above) if you need more context`)
  sections.push(`3. **Choose an action** from the options above`)
  sections.push(`4. **If unsure, escalate** — don't guess when the blocker is unclear`)
  sections.push(``)
  sections.push(`**Note:** This is attempt ${triageCount} of ${maxAttempts}. After ${maxAttempts} attempts, the task will be auto-escalated to Dan.`)

  return sections.join("\n")
}
