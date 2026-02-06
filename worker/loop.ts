/**
 * Work Loop Orchestrator
 *
 * Main entry point for the persistent work loop process.
 * Cycles through phases (cleanup → review → work) indefinitely,
 * logging all actions to Convex for visibility.
 */

import { ConvexHttpClient } from "convex/browser"
import { loadConfig } from "./config"
import { api } from "../convex/_generated/api"
import { logRun, logCycleComplete } from "./logger"
import type { Project } from "../lib/types"
import { runWork } from "./phases/work"
import { childManager } from "./children"

// ============================================
// Types
// ============================================

type WorkLoopPhase = "cleanup" | "review" | "work" | "idle" | "error"

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
 * Executes cleanup → review → work phases sequentially.
 * Updates workLoopState in Convex after each cycle.
 */
async function runProjectCycle(
  convex: ConvexHttpClient,
  project: ProjectInfo
): Promise<void> {
  const cycleStart = Date.now()

  // Update state to show we're starting a cycle
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "cleanup",
    current_cycle: cycle,
    active_agents: childManager.activeCount(project.id),
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
    active_agents: childManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? 2,
  })

  // Phase 2: Review
  const reviewResult = await runPhase(
    convex,
    project.id,
    "review",
    async () => {
      // TODO: Implement in ticket 6
      return { success: true, actions: 0 }
    }
  )

  // Update state to work phase
  await convex.mutation(api.workLoop.upsertState, {
    project_id: project.id,
    status: "running",
    current_phase: "work",
    current_cycle: cycle,
    active_agents: childManager.activeCount(project.id),
    max_agents: project.work_loop_max_agents ?? 2,
  })

  // Phase 3: Work
  const config = loadConfig()
  const workResult = await runPhase(
    convex,
    project.id,
    "work",
    async () => {
      const result = await runWork({
        convex,
        children: childManager,
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

  // Calculate cycle duration and log completion
  const cycleDurationMs = Date.now() - cycleStart
  const totalActions = cleanupResult.actions + reviewResult.actions + workResult.actions

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
    active_agents: childManager.activeCount(project.id),
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
 * 2. Run cleanup → review → work for each project
 * 3. Sleep for configured interval
 */
async function main(): Promise<void> {
  const config = loadConfig()

  if (!config.enabled) {
    console.log("Work loop disabled globally. Exiting.")
    process.exit(0)
  }

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
    process.exit(1)
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
        active_agents: childManager.activeCount(project.id),
        max_agents: project.work_loop_max_agents ?? 2,
        last_cycle_at: Date.now(),
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[WorkLoop] Error updating final states: ${message}`)
  }

  console.log("[WorkLoop] Goodbye.")
  process.exit(0)
}

// ============================================
// Entry Point
// ============================================

main().catch((error) => {
  console.error("[WorkLoop] Fatal error:", error)
  process.exit(1)
})
