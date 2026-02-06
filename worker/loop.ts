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
import { sessionsPoller } from "./sessions"
import { runReview } from "./phases/review"
import type { Project } from "../lib/types"
import { runWork } from "./phases/work"
import { runAnalyze } from "./phases/analyze"

// ============================================
// Types
// ============================================

type WorkLoopPhase = "cleanup" | "review" | "work" | "analyze" | "idle" | "error"

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
  const cycleStart = Date.now()

  // Reap finished agents before doing anything else.
  // Convert staleTaskMinutes from config into milliseconds for the reaper.
  const config = loadConfig()
  const staleMs = config.staleTaskMinutes * 60 * 1000
  const reaped = await agentManager.reapFinished(staleMs)
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

      // Clear agent fields on the task
      try {
        await convex.mutation(api.tasks.clearAgentActivity, {
          task_id: outcome.taskId,
        })
      } catch {
        // Non-fatal — task may have been deleted
      }

      // If the agent was stale (stuck), move the task back to ready so
      // it can be retried on the next cycle.
      if (isStale) {
        try {
          await convex.mutation(api.tasks.move, {
            id: outcome.taskId,
            status: "ready",
          })
          console.log(`[WorkLoop] Moved stale task ${outcome.taskId} back to ready`)
        } catch {
          // Non-fatal — task may already be in a different state
        }
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
    max_agents: project.work_loop_max_agents ?? 2,
    last_cycle_at: cycleStart,
  })

  // Phase 1: Cleanup
  const cleanupResult = await runPhase(
    convex,
    project.id,
    "cleanup",
    async () => {
      // TODO: Implement in ticket 5
      return { success: true, actions: 0 }
    }
  )

  // Update state to review phase
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "review",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? 2,
  })

  // Phase 2: Review
  const reviewResult = await runPhase(
    convex,
    project.id,
    "review",
    async () => {
      const result = await runReview({
        convex,
        agents: agentManager,
        sessions: sessionsPoller,
        config: loadConfig(),
        cycle,
        projectId: project.id,
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
    max_agents: project.work_loop_max_agents ?? 2,
  })

  // Phase 3: Work
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
        projectId: project.id,
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

  // Update state to analyze phase
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "analyze",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? 2,
  })

  // Phase 4: Analyze
  const analyzeResult = await runPhase(
    convex,
    project.id,
    "analyze",
    async () => {
      const result = await runAnalyze({
        convex,
        agents: agentManager,
        config,
        cycle,
        projectId: project.id,
        log: async (params) => {
          await logRun(convex, params)
        },
      })
      return {
        success: true,
        actions: result.spawnedCount,
      }
    }
  )

  // Calculate cycle duration and log completion
  const cycleDurationMs = Date.now() - cycleStart
  const totalActions = cleanupResult.actions + reviewResult.actions + workResult.actions + analyzeResult.actions

  await logCycleComplete(convex, {
    projectId: project.id,
    cycle,
    durationMs: cycleDurationMs,
    totalActions,
    phases: {
      cleanup: cleanupResult.success,
      review: reviewResult.success,
      work: workResult.success,
      analyze: analyzeResult.success,
    },
  })

  // Update final state for this cycle
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "idle",
    current_cycle: cycle,
    active_agents: agentManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? 2,
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

    // Only sleep if we're still running
    if (running) {
      const elapsedMs = Date.now() - cycleStart
      const sleepMs = Math.max(0, config.cycleIntervalMs - elapsedMs)

      console.log(`[WorkLoop] Cycle ${cycle} complete in ${elapsedMs}ms, sleeping ${sleepMs}ms`)
      await sleep(sleepMs)
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
        max_agents: project.work_loop_max_agents ?? 2,
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
