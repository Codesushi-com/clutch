/**
 * Cleanup Phase
 *
 * Runs at the start of each work loop cycle to keep state clean.
 * Handles the items that agent reaping (in loop.ts) doesn't cover:
 *
 * 1. Ghost agent fields — tasks in in_progress or in_review with no active
 *    agent handle but still have agent_* fields set. Happens after loop
 *    restarts when AgentManager loses its in-memory map. Clear them and
 *    move in_progress ghosts back to ready for re-assignment.
 * 2. Stale agent fields — tasks in done/ready that still have agent_*
 *    fields set. Clear them.
 * 3. Orphan worktrees — worktrees for tasks that are done. Remove them.
 * 4. Stale browser tabs — close agent-opened browser tabs to prevent memory leaks.
 *
 * Agent reaping (finished/stale sessions) is handled earlier in
 * runProjectCycle, before this phase runs. Tasks with issues are moved to
 * blocked for triage rather than being auto-recovered here.
 */

import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { AgentManager } from "../agent-manager"
import type { Task } from "../../lib/types"

// ============================================
// Types
// ============================================

import type { WorkLoopPhase } from "../../lib/types"

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

interface ProjectInfo {
  id: string
  slug: string
  name: string
  work_loop_enabled: boolean
  work_loop_max_agents?: number | null
  local_path?: string | null
  github_repo?: string | null
}

interface CleanupContext {
  convex: ConvexHttpClient
  agents: AgentManager
  cycle: number
  project: ProjectInfo
  log: (params: LogRunParams) => Promise<void>
}

interface CleanupResult {
  actions: number
}

// ============================================
// Main Cleanup Function
// ============================================

export async function runCleanup(ctx: CleanupContext): Promise<CleanupResult> {
  const {
    convex,
    agents,
    cycle,
    project,
    log,
  } = ctx

  let actions = 0

  // Derive paths from project configuration
  const repoPath = project.local_path!
  const worktreesPath = `${repoPath}-worktrees/fix`

  // Fetch task lists from Convex
  const inProgressTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "in_progress",
  })
  const doneTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "done",
  })
  const readyTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "ready",
  })

  // ------------------------------------------------------------------
  // 1. Handle ghost tasks — tasks in in_progress / in_review with no
  //    active agent handle in the current loop run.
  //
  //    After a loop restart, the AgentManager starts with an empty map.
  //    Tasks that had agents in the previous loop instance may have
  //    stale agent state. We do NOT clear agent_session_key - it should
  //    persist so users can see which agent last worked on the task.
  //    The UI distinguishes running vs completed agents via sessions table.
  //
  //    For in_progress ghosts: move to ready so the loop can re-assign.
  //    For in_review ghosts: leave them alone - reviewer will pick up.
  // ------------------------------------------------------------------
  const inReviewTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "in_review",
  })

  const ghostTasks = [...inProgressTasks, ...inReviewTasks].filter(
    (task) => task.agent_session_key && !agents.has(task.id),
  )

  for (const task of ghostTasks) {
    // For in_progress ghosts, move back to ready so the loop re-assigns
    // We do NOT clear agent_session_key - it provides visibility into
    // which agent was working on this task before it became a ghost.
    if (task.status === "in_progress") {
      try {
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "ready",
        })
      } catch {
        // Non-fatal — task may have been moved already
      }

      await log({
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: "ghost_task_reset_to_ready",
        taskId: task.id,
        details: {
          status: task.status,
          agentSessionKey: task.agent_session_key,
        },
      })
      actions++
    } else {
      // in_review ghost - just log it, don't clear session key
      await log({
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: "ghost_task_in_review",
        taskId: task.id,
        details: {
          status: task.status,
          agentSessionKey: task.agent_session_key,
        },
      })
    }
  }

  // ------------------------------------------------------------------
  // 2. (REMOVED) Stale agent field cleanup
  //
  //    Previously we cleared agent_session_key on done/ready tasks.
  //    Now we preserve it so users can always see which agent last
  //    worked on a task. The agent_session_key is only cleared on
  //    explicit task retry/reset, not on normal completion.
  // ------------------------------------------------------------------

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
    inReviewTasks,
    projectId: project.id,
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
    projectId: project.id,
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
    // Format: {repoPath}-worktrees/fix/<task-id-prefix>
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
