/**
 * Work Loop Orchestrator
 *
 * Main entry point for the persistent work loop process.
 * Cycles through phases (cleanup → review → work → analyze) indefinitely,
 * logging all actions to Convex for visibility.
 */

import { ConvexHttpClient } from "convex/browser"
import { loadConfig } from "./config"
import { api } from "../convex/_generated/api"
import { logRun, logCycleComplete } from "./logger"
import { agentManager } from "./agent-manager"
import { runCleanup } from "./phases/cleanup"
import { runReview } from "./phases/review"
import type { Project, WorkLoopPhase } from "../lib/types"
import { runWork } from "./phases/work"
import { runTriage } from "./phases/triage"
import { sessionFileReader } from "./session-file-reader"

// ============================================
// Types
// ============================================

interface PhaseResult {
  success: boolean
  actions: number
  error?: string
}

interface ProjectInfo {
  id: string
  slug: string
  name: string
  work_loop_enabled: boolean
  work_loop_max_agents?: number | null
  local_path?: string | null
  github_repo?: string | null
}

// ============================================
// Globals
// ============================================

let cycle = 0
let running = true
let currentPhase: WorkLoopPhase = "idle"
let loopStarted = false

// ============================================
// Signal Handlers
// ============================================

process.on("SIGTERM", () => {
  console.log("[SIGTERM] Received, initiating graceful shutdown...")
  running = false
})

process.on("SIGINT", () => {
  console.log("[SIGINT] Received, initiating graceful shutdown...")
  running = false
})

// ============================================
// Utilities
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================
// Phase Runner
// ============================================

/**
 * Run a phase with logging and error handling.
 *
 * Wraps the phase function with:
 * - Start/end logging to Convex
 * - Error catching and logging
 * - Duration tracking
 */
async function runPhase(
  convex: ConvexHttpClient,
  projectId: string,
  phaseName: WorkLoopPhase,
  phaseFn: () => Promise<PhaseResult>
): Promise<PhaseResult> {
  currentPhase = phaseName
  const phaseStart = Date.now()

  await logRun(convex, {
    projectId,
    cycle,
    phase: phaseName,
    action: "phase_start",
  })

  try {
    const result = await phaseFn()
    const durationMs = Date.now() - phaseStart

    await logRun(convex, {
      projectId,
      cycle,
      phase: phaseName,
      action: result.success ? "phase_complete" : "phase_failed",
      details: { actions: result.actions, error: result.error },
      durationMs,
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - phaseStart
    const errorMessage = error instanceof Error ? error.message : String(error)

    await logRun(convex, {
      projectId,
      cycle,
      phase: "error",
      action: "phase_error",
      details: { originalPhase: phaseName, error: errorMessage },
      durationMs,
    })

    return { success: false, actions: 0, error: errorMessage }
  }
}

// ============================================
// Project Loop
// ============================================

/**
 * Run one cycle for a single project.
 *
 * Executes cleanup → review → work → analyze phases sequentially.
 * Updates workLoopState in Convex after each cycle.
 */
async function runProjectCycle(
  convex: ConvexHttpClient,
  project: ProjectInfo
): Promise<void> {
  // Validate project configuration before running any phases
  if (!project.local_path) {
    console.error(`[WorkLoop] Project ${project.slug} has no local_path — skipping cycle`)
    return
  }
  if (!project.github_repo) {
    console.warn(`[WorkLoop] Project ${project.slug} has no github_repo — review phase will be skipped`)
  }

  const cycleStart = Date.now()

  // Reap finished agents before doing anything else.
  // Convert staleTaskMinutes from config into milliseconds for the reaper.
  const config = loadConfig()
  const staleMs = config.staleTaskMinutes * 60 * 1000
  const { reaped, activeUpdates } = await agentManager.reapFinished(staleMs)

  // Update active agents' last_active_at timestamps in Convex
  // This ensures the UI sidebar shows accurate "last active" times
  if (activeUpdates.length > 0) {
    try {
      await convex.mutation(api.tasks.updateAgentActivity, {
        updates: activeUpdates.map((u) => ({
          task_id: u.task_id,
          agent_session_key: u.agent_session_key,
          agent_last_active_at: u.agent_last_active_at,
          agent_output_preview: u.agent_output_preview,
          agent_tokens_in: u.agent_tokens_in,
          agent_tokens_out: u.agent_tokens_out,
        })),
      })
    } catch (err) {
      // Non-fatal — log and continue
      console.warn(`[WorkLoop] Failed to update active agent activity: ${err}`)
    }
  }

  if (reaped.length > 0) {
    for (const outcome of reaped) {
      const isStale = outcome.reply === "stale_timeout"
      await logRun(convex, {
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: isStale ? "agent_stale_reaped" : "agent_reaped",
        taskId: outcome.taskId,
        sessionKey: outcome.sessionKey,
        details: {
          reason: outcome.reply,
          error: outcome.error,
          durationMs: outcome.durationMs,
          tokens: outcome.usage?.totalTokens,
        },
      })

      // Log task event for agent completion or reap
      // Calculate cost if we have token usage
      let costInput: number | undefined
      let costOutput: number | undefined
      let costTotal: number | undefined

      if (!isStale && outcome.usage) {
        try {
          // Get the task to find the model used
          const task = await convex.query(api.tasks.getById, { id: outcome.taskId })
          const model = task?.task?.agent_model

          if (model) {
            // Get pricing for this model
            const pricing = await convex.query(api.modelPricing.getModelPricing, { model })

            if (pricing) {
              const tokensIn = outcome.usage.inputTokens ?? 0
              const tokensOut = outcome.usage.outputTokens ?? 0

              costInput = tokensIn * (pricing.input_per_1m / 1_000_000)
              costOutput = tokensOut * (pricing.output_per_1m / 1_000_000)
              costTotal = costInput + costOutput

              console.log(
                `[WorkLoop] Cost calculated for ${outcome.taskId.slice(0, 8)}: ` +
                `model=${model}, tokens=${tokensIn}/${tokensOut}, cost=$${costTotal.toFixed(6)}`
              )
            } else {
              console.warn(
                `[WorkLoop] No pricing found for model ${model} on task ${outcome.taskId.slice(0, 8)}`
              )
            }
          } else {
            console.warn(`[WorkLoop] No model found for task ${outcome.taskId.slice(0, 8)}`)
          }
        } catch (costErr) {
          // Non-fatal — log and continue without cost
          console.warn(`[WorkLoop] Failed to calculate cost: ${costErr}`)
        }
      }

      try {
        if (isStale) {
          await convex.mutation(api.task_events.logAgentReaped, {
            taskId: outcome.taskId,
            sessionKey: outcome.sessionKey,
            reason: "stale",
          })
        } else {
          await convex.mutation(api.task_events.logAgentCompleted, {
            taskId: outcome.taskId,
            sessionKey: outcome.sessionKey,
            tokensIn: outcome.usage?.inputTokens,
            tokensOut: outcome.usage?.outputTokens,
            outputPreview: outcome.reply?.slice(0, 500), // Limit preview
            durationMs: outcome.durationMs,
            costInput,
            costOutput,
            costTotal,
          })
        }
      } catch (logErr) {
        // Non-fatal — log and continue
        console.warn(`[WorkLoop] Failed to log agent event: ${logErr}`)
      }

      // Add cost to task's total cost (accumulates across retries)
      if (costTotal !== undefined && costTotal > 0) {
        try {
          await convex.mutation(api.tasks.addTaskCost, {
            task_id: outcome.taskId,
            cost: costTotal,
          })
        } catch (costErr) {
          // Non-fatal — log and continue
          console.warn(`[WorkLoop] Failed to add task cost: ${costErr}`)
        }
      }

      // For finished agents (not stale), write accurate JSONL-sourced data to Convex
      // before clearing. This captures the real model, token counts, and output preview.
      if (!isStale) {
        const sessionInfo = sessionFileReader.getSessionInfo(outcome.sessionKey)
        if (sessionInfo?.lastAssistantMessage) {
          try {
            const startedAt = Date.now() - outcome.durationMs
            await convex.mutation(api.tasks.updateAgentActivity, {
              updates: [{
                task_id: outcome.taskId,
                agent_session_key: outcome.sessionKey,
                agent_model: sessionInfo.lastAssistantMessage.model,
                agent_started_at: startedAt,
                agent_last_active_at: sessionInfo.fileMtimeMs,
                agent_tokens_in: sessionInfo.lastAssistantMessage.usage.input,
                agent_tokens_out: sessionInfo.lastAssistantMessage.usage.output,
                agent_output_preview: sessionInfo.lastAssistantMessage.textPreview,
              }],
            })
          } catch (err) {
            // Non-fatal — log and continue to clear
            console.warn(`[WorkLoop] Failed to write JSONL data for ${outcome.taskId}: ${err}`)
          }
        }
      }

      // Clear agent fields on the task
      try {
        await convex.mutation(api.tasks.clearAgentActivity, {
          task_id: outcome.taskId,
        })
      } catch {
        // Non-fatal — task may have been deleted
      }

      // Post-reap status verification — simplified block rule:
      // If agent finished but task is still in_progress or in_review, move to blocked
      try {
        const task = await convex.query(api.tasks.getById, { id: outcome.taskId })
        if (!task) continue

        const currentStatus = task.task.status

        // Case 1: Task still in_progress after agent finished → blocked
        if (currentStatus === "in_progress") {
          await convex.mutation(api.tasks.move, {
            id: outcome.taskId,
            status: "blocked",
          })
          await convex.mutation(api.comments.create, {
            taskId: outcome.taskId,
            author: "work-loop",
            authorType: "coordinator",
            content: `Agent finished but task still in_progress. Moving to blocked for triage.`,
            type: "status_change",
          })
          console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to blocked (finished while in_progress)`)
          await logRun(convex, {
            projectId: project.id,
            cycle,
            phase: "cleanup",
            action: "task_blocked",
            taskId: outcome.taskId,
            details: { reason: "finished_in_progress", role: outcome.role },
          })
        }
        // Case 2: Reviewer finished but task still in_review → blocked
        else if (currentStatus === "in_review" && outcome.role === "reviewer") {
          await convex.mutation(api.tasks.move, {
            id: outcome.taskId,
            status: "blocked",
          })
          await convex.mutation(api.comments.create, {
            taskId: outcome.taskId,
            author: "work-loop",
            authorType: "coordinator",
            content: `Reviewer finished without merging. Moving to blocked for triage.`,
            type: "status_change",
          })
          console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to blocked (reviewer didn't merge)`)
          await logRun(convex, {
            projectId: project.id,
            cycle,
            phase: "cleanup",
            action: "task_blocked",
            taskId: outcome.taskId,
            details: { reason: "reviewer_no_merge", role: outcome.role },
          })
        }
        // Case 3: Task already done/blocked → agent signaled correctly, no action
        else {
          console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} status is ${currentStatus} — agent signaled correctly`)
        }
      } catch (err) {
        // Non-fatal — log and continue
        console.warn(`[WorkLoop] Failed to verify task status for ${outcome.taskId}:`, err)
      }
    }
  }

  // Update state to show we're starting a cycle
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "cleanup",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? config.maxAgentsPerProject,
    last_cycle_at: cycleStart,
  })

  // Phase 1: Cleanup
  const cleanupResult = await runPhase(
    convex,
    project.id,
    "cleanup",
    async () => {
      const result = await runCleanup({
        convex,
        agents: agentManager,
        cycle,
        project,
        log: (params) => logRun(convex, params),
      })
      return { success: true, actions: result.actions }
    }
  )

  // Update state to review phase
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "review",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? config.maxAgentsPerProject,
  })

  // Phase 3: Review
  const reviewResult = await runPhase(
    convex,
    project.id,
    "review",
    async () => {
      const result = await runReview({
        convex,
        agents: agentManager,
        config: loadConfig(),
        cycle,
        project,
        log: (params) => logRun(convex, params),
      })
      return { success: true, actions: result.spawnedCount }
    }
  )

  // Update state to work phase
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "work",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? config.maxAgentsPerProject,
  })

  // Phase 4: Work
  const workResult = await runPhase(
    convex,
    project.id,
    "work",
    async () => {
      const result = await runWork({
        convex,
        agents: agentManager,
        config,
        cycle,
        project,
        log: async (params) => {
          await logRun(convex, params)
        },
      })
      return {
        success: true,
        actions: result.claimed ? 1 : 0,
      }
    }
  )

  // Update state to triage phase (runs after work + review)
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "triage",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? config.maxAgentsPerProject,
  })

  // Phase 4: Triage (runs after work + review to process blocked tasks)
  const triageResult = await runTriage({
    convex,
    cycle,
    project,
    log: (params) => logRun(convex, params),
  })

  if (triageResult.sentCount > 0 || triageResult.escalatedCount > 0) {
    await logRun(convex, {
      projectId: project.id,
      cycle,
      phase: "triage",
      action: "triage_complete",
      details: {
        sentCount: triageResult.sentCount,
        escalatedCount: triageResult.escalatedCount,
        taskIds: triageResult.taskIds,
        escalatedIds: triageResult.escalatedIds,
      },
    })
  }

  // Calculate cycle duration and log completion
  const cycleDurationMs = Date.now() - cycleStart
  const totalActions = cleanupResult.actions + reviewResult.actions + workResult.actions + triageResult.sentCount + triageResult.escalatedCount

  await logCycleComplete(convex, {
    projectId: project.id,
    cycle,
    durationMs: cycleDurationMs,
    totalActions,
    phases: {
      cleanup: cleanupResult.success,
      review: reviewResult.success,
      work: workResult.success,
    },
  })

  // Update final state for this cycle
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "idle",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? config.maxAgentsPerProject,
    last_cycle_at: Date.now(),
  })
}

// ============================================
// Main Loop
// ============================================

/**
 * Get all projects with work loop enabled.
 *
 * Queries Convex for projects where work_loop_enabled is true.
 */
async function getEnabledProjects(convex: ConvexHttpClient): Promise<ProjectInfo[]> {
  try {
    // Use the projects query to get all projects, then filter locally
    // This avoids needing a special index just for the work loop
    const projects = await convex.query(api.projects.getAll, {})

    return projects
      .filter((p: Project & { task_count: number }) => p.work_loop_enabled)
      .map((p: Project & { task_count: number }) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        work_loop_enabled: Boolean(p.work_loop_enabled),
        work_loop_max_agents: p.work_loop_max_agents,
        local_path: p.local_path,
        github_repo: p.github_repo,
      }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[getEnabledProjects] Failed to fetch projects: ${message}`)
    return []
  }
}

/**
 * Main work loop.
 *
 * Runs indefinitely until SIGTERM/SIGINT received.
 * Each iteration:
 * 1. Get enabled projects from Convex
 * 2. Run cleanup → review → work → analyze for each project
 * 3. Sleep for configured interval
 */
async function runLoop(): Promise<void> {
  const config = loadConfig()

  console.log("[WorkLoop] Starting with config:", {
    enabled: config.enabled,
    cycleIntervalMs: config.cycleIntervalMs,
    maxAgentsPerProject: config.maxAgentsPerProject,
    maxAgentsGlobal: config.maxAgentsGlobal,
  })

  const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"
  const convex = new ConvexHttpClient(convexUrl)

  // Verify Convex connection
  try {
    await convex.query(api.projects.getAll, {})
    console.log(`[WorkLoop] Connected to Convex at ${convexUrl}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[WorkLoop] Failed to connect to Convex at ${convexUrl}: ${message}`)
    // Don't exit - just return and let the caller handle it
    return
  }

  while (running) {
    cycle++
    const cycleStart = Date.now()

    console.log(`[WorkLoop] Starting cycle ${cycle}`)

    // Get enabled projects
    const projects = await getEnabledProjects(convex)

    if (projects.length === 0) {
      console.log(`[WorkLoop] No enabled projects found, skipping cycle ${cycle}`)
    } else {
      console.log(`[WorkLoop] Running cycle ${cycle} for ${projects.length} project(s):`,
        projects.map((p) => p.slug).join(", "))

      // Run cycle for each project
      for (const project of projects) {
        if (!running) {
          console.log(`[WorkLoop] Shutdown requested, stopping after current project`)
          break
        }

        try {
          await runProjectCycle(convex, project)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[WorkLoop] Error in cycle ${cycle} for project ${project.slug}: ${message}`)

          // Log error to Convex
          await logRun(convex, {
            projectId: project.id,
            cycle,
            phase: "error",
            action: "cycle_error",
            details: { error: message },
          })
        }
      }
    }

    // Always sleep the full interval after a cycle to let things settle
    if (running) {
      const elapsedMs = Date.now() - cycleStart
      console.log(`[WorkLoop] Cycle ${cycle} complete in ${elapsedMs}ms, sleeping ${config.cycleIntervalMs}ms`)
      await sleep(config.cycleIntervalMs)
    }
  }

  console.log("[WorkLoop] Shutting down gracefully...")

  // Update all project states to stopped
  try {
    const projects = await getEnabledProjects(convex)
    for (const project of projects) {
      await convex.mutation(api.workLoop.upsertState, {
        project_id: project.id,
        status: "stopped",
        current_phase: currentPhase,
        current_cycle: cycle,
        active_agents: agentManager.activeCount(project.id),
        max_agents: project.work_loop_max_agents ?? config.maxAgentsPerProject,
        last_cycle_at: Date.now(),
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[WorkLoop] Error updating final states: ${message}`)
  }

  console.log("[WorkLoop] Goodbye.")
}

/**
 * Start the work loop in the background.
 *
 * This function is called from instrumentation.ts on server startup.
 * It runs the work loop in an async context that won't block server startup
 * and won't crash the server if the loop errors.
 *
 * The loop only starts if WORK_LOOP_ENABLED=true env var is set.
 */
export function startWorkLoop(): void {
  // Prevent double-start
  if (loopStarted) {
    console.log("[WorkLoop] Already started, skipping")
    return
  }

  const config = loadConfig()

  if (!config.enabled) {
    console.log("[WorkLoop] Disabled (WORK_LOOP_ENABLED not set to true), skipping startup")
    return
  }

  loopStarted = true
  console.log("[WorkLoop] Starting in background...")

  // Run the loop in an async IIFE that catches all errors
  // This ensures the loop never crashes the Next.js server
  ;(async () => {
    try {
      await runLoop()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[WorkLoop] Fatal error in work loop:", message)
      // Don't re-throw - we don't want to crash the server
    }
  })()
}

/**
 * CLI entry point for running the work loop standalone.
 *
 * This is used when running `npx tsx worker/loop.ts` directly.
 * It exits the process when the loop ends.
 */
async function main(): Promise<void> {
  const config = loadConfig()

  if (!config.enabled) {
    console.log("Work loop disabled globally. Exiting.")
    process.exit(0)
  }

  await runLoop()
  process.exit(0)
}

// ============================================
// Entry Point
// ============================================

// Only run main() if this file is executed directly (not imported)
// Check if we're running as the main module via import.meta.url
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && import.meta.url.endsWith(process.argv[1]))

if (isMainModule) {
  main().catch((error) => {
    console.error("[WorkLoop] Fatal error:", error)
    process.exit(1)
  })
}
