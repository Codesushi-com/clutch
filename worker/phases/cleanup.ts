/**
 * Cleanup Phase
 *
 * Runs at the start of each work loop cycle to keep state clean.
 * Handles the items that agent reaping (in loop.ts) doesn't cover:
 *
 * 1. Orphaned in_progress tasks — tasks stuck in_progress with no active
 *    agent AND stale agent_last_active_at. Reset to ready.
 * 2. Stale agent fields — tasks in done/ready that still have agent_*
 *    fields set. Clear them.
 * 3. Orphan worktrees — worktrees for tasks that are done. Remove them.
 *
 * Agent reaping (finished/stale sessions) is handled earlier in
 * runProjectCycle, before this phase runs.
 */

import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { AgentManager } from "../agent-manager"
import type { Task } from "../../lib/types"

// ============================================
// Types
// ============================================

type WorkLoopPhase = "cleanup" | "review" | "work" | "analyze" | "idle" | "error"

interface LogRunParams {
  projectId: string
  cycle: number
  phase: WorkLoopPhase
  action: string
  taskId?: string
  sessionKey?: string
  details?: Record<string, unknown>
  durationMs?: number
}

interface CleanupContext {
  convex: ConvexHttpClient
  agents: AgentManager
  cycle: number
  projectId: string
  repoPath: string
  worktreesPath: string
  staleTaskMinutes: number
  log: (params: LogRunParams) => Promise<void>
}

interface CleanupResult {
  actions: number
}

// ============================================
// Constants
// ============================================

const MS_PER_MINUTE = 60 * 1000
const DEFAULT_STALE_MINUTES = 15

// ============================================
// Main Cleanup Function
// ============================================

export async function runCleanup(ctx: CleanupContext): Promise<CleanupResult> {
  const {
    convex,
    agents,
    cycle,
    projectId,
    repoPath,
    worktreesPath,
    staleTaskMinutes,
    log,
  } = ctx

  let actions = 0

  const now = Date.now()
  const staleMs = (staleTaskMinutes || DEFAULT_STALE_MINUTES) * MS_PER_MINUTE

  // Fetch task lists from Convex
  const inProgressTasks = await convex.query(api.tasks.getByProject, {
    projectId,
    status: "in_progress",
  })
  const doneTasks = await convex.query(api.tasks.getByProject, {
    projectId,
    status: "done",
  })
  const readyTasks = await convex.query(api.tasks.getByProject, {
    projectId,
    status: "ready",
  })

  // ------------------------------------------------------------------
  // 1. Detect orphaned in_progress tasks
  //
  //    A task is orphaned if:
  //    - Status is in_progress
  //    - No active agent handle in AgentManager
  //    - agent_last_active_at is >staleMinutes old (or absent)
  // ------------------------------------------------------------------
  for (const task of inProgressTasks) {
    const hasAgent = agents.has(task.id)
    if (hasAgent) continue

    // No agent handle — check staleness via agent_last_active_at
    const lastActive = task.agent_last_active_at ?? task.updated_at
    const idleMs = now - lastActive

    if (idleMs >= staleMs) {
      // Reset to ready
      try {
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "ready",
        })
      } catch (moveErr) {
        // May fail if dependencies block the transition — log and skip
        const msg = moveErr instanceof Error ? moveErr.message : String(moveErr)
        console.warn(`[cleanup] Failed to reset orphaned task ${task.id}: ${msg}`)
        continue
      }

      // Clear agent fields
      try {
        await convex.mutation(api.tasks.clearAgentActivity, {
          task_id: task.id,
        })
      } catch {
        // Non-fatal
      }

      await log({
        projectId,
        cycle,
        phase: "cleanup",
        action: "reset_orphaned_in_progress",
        taskId: task.id,
        details: {
          idleMinutes: Math.round(idleMs / MS_PER_MINUTE),
          agentSessionKey: task.agent_session_key,
        },
      })
      actions++
    }
  }

  // ------------------------------------------------------------------
  // 2. Clear stale agent fields on done/ready tasks
  //
  //    Tasks that finished or were reset may still carry agent_* fields.
  //    This happens when a task moves to done/ready outside the normal
  //    agent completion path (e.g., manual moves, PR auto-merge).
  // ------------------------------------------------------------------
  const tasksNeedingFieldClear = [...doneTasks, ...readyTasks].filter(
    (task) => task.agent_session_key !== null,
  )

  for (const task of tasksNeedingFieldClear) {
    try {
      await convex.mutation(api.tasks.clearAgentActivity, {
        task_id: task.id,
      })
    } catch {
      // Non-fatal
      continue
    }

    await log({
      projectId,
      cycle,
      phase: "cleanup",
      action: "clear_stale_agent_fields",
      taskId: task.id,
      details: {
        status: task.status,
        agentSessionKey: task.agent_session_key,
      },
    })
    actions++
  }

  // ------------------------------------------------------------------
  // 3. Clean orphan worktrees
  //
  //    List directories in worktreesPath. For each, extract the task ID
  //    prefix. If the corresponding task is done, remove the worktree.
  //    Skip worktrees with uncommitted changes.
  // ------------------------------------------------------------------
  const worktreeActions = await cleanOrphanWorktrees({
    repoPath,
    worktreesPath,
    doneTasks,
    inProgressTasks,
    inReviewTasks: await convex.query(api.tasks.getByProject, {
      projectId,
      status: "in_review",
    }),
    projectId,
    cycle,
    log,
  })
  actions += worktreeActions

  // ------------------------------------------------------------------
  // 4. Close stale browser tabs
  //
  //    Agents open browser tabs for QA/review and often forget to close
  //    them. Each Chromium tab leaks 100-500MB of memory, eventually
  //    crashing the server. Close any tabs older than 10 minutes that
  //    aren't the about:blank or extension pages.
  // ------------------------------------------------------------------
  const tabActions = await cleanStaleBrowserTabs({
    projectId,
    cycle,
    log,
  })
  actions += tabActions

  return { actions }
}

// ============================================
// Browser Tab Cleanup
// ============================================

interface BrowserCleanupContext {
  projectId: string
  cycle: number
  log: (params: LogRunParams) => Promise<void>
}

async function cleanStaleBrowserTabs(ctx: BrowserCleanupContext): Promise<number> {
  const { projectId, cycle, log } = ctx
  let actions = 0

  try {
    // Query the browser control server for open tabs
    const response = await fetch("http://127.0.0.1:18791/api/tabs", {
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) return 0

    const data = await response.json() as {
      tabs?: Array<{ targetId: string; url: string; title: string }>
    }

    const tabs = data.tabs ?? []

    // Close tabs that look like agent-opened pages (localhost:3002, trap URLs)
    // Keep about:blank, chrome://, extension pages, and non-trap URLs
    const stalePatterns = [
      /localhost:3002/,
      /192\.168\.7\.200:3002/,
      /127\.0\.0\.1:3002/,
    ]

    for (const tab of tabs) {
      const isAgentTab = stalePatterns.some(p => p.test(tab.url))
      if (!isAgentTab) continue

      try {
        await fetch(`http://127.0.0.1:18791/api/close?targetId=${encodeURIComponent(tab.targetId)}`, {
          method: "POST",
          signal: AbortSignal.timeout(3_000),
        })

        await log({
          projectId,
          cycle,
          phase: "cleanup",
          action: "browser_tab_closed",
          details: { url: tab.url, title: tab.title?.slice(0, 60) },
        })
        actions++
      } catch {
        // Non-fatal — tab may have already closed
      }
    }

    if (actions > 0) {
      console.log(`[cleanup] Closed ${actions} stale browser tab(s)`)
    }
  } catch {
    // Browser control server may not be running — that's fine
  }

  return actions
}

// ============================================
// Worktree Cleanup
// ============================================

interface WorktreeCleanupContext {
  repoPath: string
  worktreesPath: string
  doneTasks: Task[]
  inProgressTasks: Task[]
  inReviewTasks: Task[]
  projectId: string
  cycle: number
  log: (params: LogRunParams) => Promise<void>
}

async function cleanOrphanWorktrees(ctx: WorktreeCleanupContext): Promise<number> {
  const {
    repoPath,
    worktreesPath,
    doneTasks,
    inProgressTasks,
    inReviewTasks,
    projectId,
    cycle,
    log,
  } = ctx

  let actions = 0

  // Build sets of task ID prefixes for active tasks (in_progress + in_review + ready)
  // Worktree dirs are named by first 8 chars of task ID
  const activeTaskPrefixes = new Set<string>()
  for (const task of [...inProgressTasks, ...inReviewTasks]) {
    activeTaskPrefixes.add(task.id.slice(0, 8))
  }

  const doneTaskPrefixes = new Set<string>()
  for (const task of doneTasks) {
    doneTaskPrefixes.add(task.id.slice(0, 8))
  }

  // List worktree directories
  let worktreeDirs: string[]
  try {
    const result = execFileSync("find", [
      worktreesPath,
      "-mindepth", "2",
      "-maxdepth", "2",
      "-type", "d",
    ], {
      encoding: "utf-8",
      timeout: 10_000,
    })
    worktreeDirs = result.trim().split("\n").filter(Boolean)
  } catch {
    // Directory may not exist yet — that's fine
    return 0
  }

  for (const dir of worktreeDirs) {
    // Extract the task ID prefix from the directory name
    // Format: /home/dan/src/trap-worktrees/fix/<task-id-prefix>
    const dirName = dir.split("/").pop()
    if (!dirName) continue

    // The dir name IS the task ID prefix (e.g., "cacccd02")
    const prefix = dirName

    // Skip if this task is still active
    if (activeTaskPrefixes.has(prefix)) continue

    // Only clean if the task is done (not unknown/missing tasks — be conservative)
    if (!doneTaskPrefixes.has(prefix)) continue

    // Check for uncommitted changes
    const isDirty = hasUncommittedChanges(dir)
    if (isDirty) {
      console.warn(`[cleanup] Worktree ${dir} has uncommitted changes, skipping`)
      await log({
        projectId,
        cycle,
        phase: "cleanup",
        action: "worktree_dirty_skip",
        details: { path: dir },
      })
      continue
    }

    // Remove the worktree
    try {
      execFileSync("git", ["-C", repoPath, "worktree", "remove", dir, "--force"], {
        timeout: 30_000,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[cleanup] Failed to remove worktree ${dir}: ${msg}`)
      continue
    }

    await log({
      projectId,
      cycle,
      phase: "cleanup",
      action: "worktree_removed",
      details: { path: dir, taskPrefix: prefix },
    })
    actions++
  }

  return actions
}

// ============================================
// Helpers
// ============================================

function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const status = execFileSync("git", ["-C", worktreePath, "status", "--porcelain"], {
      encoding: "utf-8",
      timeout: 10_000,
    })
    return status.trim().length > 0
  } catch {
    // If git status fails, assume dirty (conservative)
    return true
  }
}
