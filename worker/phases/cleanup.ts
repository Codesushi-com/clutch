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
 * 2. Merged PR sweep — check non-done tasks (blocked, in_progress) with
 *    pr_number to see if their PR was merged. If so, mark them as done.
 *    This handles cases where a PR is force-merged outside the review phase.
 * 3. Orphan worktrees — worktrees for tasks that are done. Remove them.
 * 4. Dead remote branches — for done tasks with PR numbers, delete the
 *    remote branch if the PR was merged or closed.
 * 5. Stale browser tabs — close agent-opened browser tabs to prevent memory leaks.
 *
 * Agent reaping (finished/stale sessions) is handled earlier in
 * runProjectCycle, before this phase runs. Tasks with issues are moved to
 * blocked for triage rather than being auto-recovered here.
 */

import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { Task } from "../../lib/types"
import { isPRMerged, type ProjectInfo } from "./github"

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

interface CleanupContext {
  convex: ConvexHttpClient
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

  // ------------------------------------------------------------------
  // 1. Handle ghost tasks — tasks in in_progress / in_review with no
  //    active session in the sessions table.
  //
  //    We use the sessions table as the source of truth for agent liveness,
  //    not the AgentManager in-memory map (which is empty after restarts).
  //
  //    A task is NOT a ghost if:
  //      - it has agent_session_key AND
  //      - sessions row exists with status active or idle
  //
  //    A task IS a ghost if:
  //      - it has agent_session_key AND
  //      - no session row exists, OR session is completed/stale
  //
  //    For in_progress ghosts:
  //      - If session completed → move to blocked for triage
  //      - If session stale → move to blocked for triage
  //      - If no session row AND in_progress > 2min → reset to ready
  //
  //    For in_review ghosts:
  //      - Leave them alone - reviewer session may still be active
  // ------------------------------------------------------------------
  const inReviewTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "in_review",
  })

  // Check each task with agent_session_key for session liveness
  const tasksWithAgents = [...inProgressTasks, ...inReviewTasks].filter(
    (task) => task.agent_session_key,
  )

  for (const task of tasksWithAgents) {
    // Check session status from the sessions table (source of truth)
    const sessionStatus = await convex.query(api.sessions.getLiveStatus, {
      sessionKey: task.agent_session_key!,
    })

    const now = Date.now()
    const inProgressDurationMs = now - task.updated_at
    const GHOST_GRACE_PERIOD_MS = 2 * 60 * 1000 // 2 minutes grace period

    // Determine if this is a ghost task
    let isGhost = false
    let ghostReason: string | null = null

    if (!sessionStatus.exists) {
      // No session row yet - only a ghost if grace period exceeded
      if (inProgressDurationMs > GHOST_GRACE_PERIOD_MS) {
        isGhost = true
        ghostReason = "no_session_record"
      }
    } else if (sessionStatus.status === "completed") {
      isGhost = true
      ghostReason = "session_completed"
    } else if (sessionStatus.status === "stale") {
      isGhost = true
      ghostReason = "session_stale"
    }
    // active/idle sessions are NOT ghosts - agent is still running

    if (!isGhost) {
      // Session is live (active/idle) or within grace period - not a ghost
      continue
    }

    // Handle ghost task based on status
    if (task.status === "in_progress") {
      // Move to blocked for triage - the agent finished/stopped but task
      // wasn't properly transitioned
      try {
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "blocked",
        })
        // Clear agent_session_key since the session is done
        await convex.mutation(api.tasks.update, {
          id: task.id,
          agent_session_key: undefined,
          // Reset retry count since this is a new triage cycle
          agent_retry_count: 0,
        })
      } catch {
        // Non-fatal — task may have been moved already
      }

      // Add a comment explaining why it was blocked
      const blockReason = ghostReason === "session_completed"
        ? "Agent session completed but task was not properly transitioned. Moving to blocked for triage."
        : ghostReason === "session_stale"
          ? "Agent session became stale (unresponsive). Moving to blocked for triage."
          : "No active session found for this task after grace period. Moving to blocked for triage."

      try {
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: blockReason,
          type: "status_change",
        })
      } catch {
        // Non-fatal — comment creation is optional
      }

      await log({
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: "ghost_task_blocked",
        taskId: task.id,
        details: {
          status: task.status,
          ghostReason,
          agentSessionKey: task.agent_session_key,
          inProgressDurationMs,
        },
      })
      actions++
    } else {
      // in_review ghost - just log it, don't clear session key
      // The reviewer may still be working, or the review phase will handle it
      await log({
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: "ghost_task_in_review",
        taskId: task.id,
        details: {
          status: task.status,
          ghostReason,
          agentSessionKey: task.agent_session_key,
          sessionStatus: sessionStatus.status,
        },
      })
    }
  }

  // ------------------------------------------------------------------
  // 2. (REMOVED) Stale agent field cleanup
  //
  //    We now clear agent_session_key when tasks move to done (in loop.ts
  //    reap handler) and when ghost tasks are reset to ready (above).
  //    This ensures queries filtering by agent_session_key != null only
  //    return tasks with live agents. The sessions table and task_events
  //    provide the audit trail for which agents worked on tasks.
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // 2.5. Check for merged PRs on non-done tasks
  //
  //    If a PR is force-merged while a task is blocked or in_progress,
  //    the task stays stuck forever since merged-PR detection only runs
  //    in the review phase. This sweep finds non-done tasks with pr_number,
  //    batch-checks merge status, and marks them as done.
  // ------------------------------------------------------------------
  const blockedTasks = await convex.query(api.tasks.getByProject, {
    projectId: project.id,
    status: "blocked",
  })
  const mergedPRActions = await checkMergedPRsOnNonDoneTasks({
    convex,
    project,
    blockedTasks,
    inProgressTasks,
    cycle,
    log,
  })
  actions += mergedPRActions
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
  // 3.5. Clean merged remote branches
  //
  //    For done tasks with PR numbers, check if the PR was merged and
  //    delete the remote branch if it exists. This handles cases where
  //    tasks went blocked→done and bypassed the review phase cleanup.
  // ------------------------------------------------------------------
  const branchActions = await cleanMergedRemoteBranches({
    repoPath,
    doneTasks,
    projectId: project.id,
    cycle,
    log,
  })
  actions += branchActions

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

    // Close tabs that look like agent-opened pages (localhost:3002, clutch URLs)
    // Keep about:blank, chrome://, extension pages, and non-clutch URLs
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
// Remote Branch Cleanup
// ============================================

interface BranchCleanupContext {
  repoPath: string
  doneTasks: Task[]
  projectId: string
  cycle: number
  log: (params: LogRunParams) => Promise<void>
}

async function cleanMergedRemoteBranches(ctx: BranchCleanupContext): Promise<number> {
  const {
    repoPath,
    doneTasks,
    projectId,
    cycle,
    log,
  } = ctx

  let actions = 0

  // Find done tasks with PR numbers that might have merged PRs
  const tasksWithPRs = doneTasks.filter(task => task.pr_number && task.branch)

  if (tasksWithPRs.length === 0) {
    return 0
  }

  // Batch-fetch all remote branch names in one call (much faster than per-branch ls-remote)
  let remoteBranches: Set<string>
  try {
    const lsAll = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin"],
      { encoding: "utf-8", timeout: 30_000, cwd: repoPath }
    )
    remoteBranches = new Set(
      lsAll.trim().split("\n")
        .filter(Boolean)
        .map(line => line.replace(/^.*refs\/heads\//, ""))
    )
  } catch (lsErr) {
    console.warn(`[cleanup] Failed to list remote branches, skipping branch cleanup: ${lsErr instanceof Error ? lsErr.message : String(lsErr)}`)
    return 0
  }

  // Filter to only tasks whose branches still exist on remote
  const tasksWithRemoteBranches = tasksWithPRs.filter(task => remoteBranches.has(task.branch!))

  if (tasksWithRemoteBranches.length === 0) {
    return 0
  }

  console.log(`[cleanup] Checking ${tasksWithRemoteBranches.length} branches (${tasksWithPRs.length - tasksWithRemoteBranches.length} already cleaned)`)

  for (const task of tasksWithRemoteBranches) {
    const branchName = task.branch!
    const prNumber = task.pr_number!

    try {
      // Check if PR was merged
      const prResult = execFileSync(
        "gh",
        ["pr", "view", String(prNumber), "--json", "state,mergedAt"],
        { encoding: "utf-8", timeout: 10_000, cwd: repoPath }
      )
      const prData = JSON.parse(prResult) as { state: string; mergedAt: string | null }

      // Delete branch if PR is merged OR closed (dead PRs leave dead branches)
      if (prData.state === "MERGED" || prData.state === "CLOSED") {
        const reason = prData.state === "MERGED" ? "merged_pr" : "closed_pr"
        // Branch existence already verified by batch ls-remote above
        try {
          execFileSync(
            "git",
            ["push", "origin", "--delete", branchName],
            { encoding: "utf-8", timeout: 15_000, cwd: repoPath }
          )

          await log({
            projectId,
            cycle,
            phase: "cleanup",
            action: "remote_branch_deleted",
            taskId: task.id,
            details: { branch: branchName, prNumber, reason },
          })
          actions++
          console.log(`[cleanup] Deleted remote branch: ${branchName} (PR #${prNumber}, ${prData.state.toLowerCase()})`)
        } catch (deleteErr) {
          const deleteMsg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr)
          console.warn(`[cleanup] Failed to delete remote branch ${branchName}: ${deleteMsg}`)
          await log({
            projectId,
            cycle,
            phase: "cleanup",
            action: "remote_branch_delete_failed",
            taskId: task.id,
            details: { branch: branchName, prNumber, error: deleteMsg },
          })
        }
      } else {
        console.log(`[cleanup] PR #${prNumber} still open (state: ${prData.state}), keeping branch ${branchName}`)
      }
    } catch (prCheckErr) {
      const prMsg = prCheckErr instanceof Error ? prCheckErr.message : String(prCheckErr)
      console.warn(`[cleanup] Failed to check PR #${prNumber} status: ${prMsg}`)
      await log({
        projectId,
        cycle,
        phase: "cleanup",
        action: "pr_check_failed",
        taskId: task.id,
        details: { prNumber, error: prMsg },
      })
    }
  }

  return actions
}

// ============================================
// Merged PR Sweep
// ============================================

interface MergedPRSweepContext {
  convex: ConvexHttpClient
  project: ProjectInfo
  blockedTasks: Task[]
  inProgressTasks: Task[]
  cycle: number
  log: (params: LogRunParams) => Promise<void>
}

/**
 * Check for merged PRs on non-done tasks (blocked, in_progress).
 *
 * If a PR is force-merged while a task is blocked or in_progress, the task
 * stays stuck forever since merged-PR detection only runs in the review phase.
 * This sweep finds non-done tasks with pr_number, batch-checks merge status,
 * marks them as done, and logs lifecycle events.
 *
 * @returns Number of tasks auto-completed
 */
async function checkMergedPRsOnNonDoneTasks(ctx: MergedPRSweepContext): Promise<number> {
  const { convex, project, blockedTasks, inProgressTasks, cycle, log } = ctx

  // Combine non-done tasks that have PR numbers
  const nonDoneTasksWithPRs = [...blockedTasks, ...inProgressTasks].filter(
    (task) => task.pr_number
  )

  if (nonDoneTasksWithPRs.length === 0) {
    return 0
  }

  console.log(`[cleanup] Checking ${nonDoneTasksWithPRs.length} non-done tasks for merged PRs`)

  let completedCount = 0

  for (const task of nonDoneTasksWithPRs) {
    const prNumber = task.pr_number!

    // Check if PR is merged
    const merged = isPRMerged(prNumber, project)

    if (!merged) {
      continue
    }

    // PR is merged - auto-complete the task
    console.log(`[cleanup] Auto-completing task ${task.id.slice(0, 8)} — PR #${prNumber} is merged`)

    try {
      // Move task to done
      await convex.mutation(api.tasks.move, {
        id: task.id,
        status: "done",
        reason: "pr_already_merged",
      })

      // Clear agent fields since task is done
      await convex.mutation(api.tasks.update, {
        id: task.id,
        agent_session_key: undefined,
        agent_spawned_at: undefined,
      })

      // Add comment explaining the auto-completion
      await convex.mutation(api.comments.create, {
        taskId: task.id,
        author: "work-loop",
        authorType: "coordinator",
        content: `PR #${prNumber} was merged while task was ${task.status}. Auto-completing task.`,
        type: "status_change",
      })

      // Log PR merged event
      await convex.mutation(api.task_events.logPRMerged, {
        taskId: task.id,
        prNumber: prNumber,
        mergedBy: "work-loop",
      })

      // Log cleanup action
      await log({
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: "task_auto_completed_merged_pr",
        taskId: task.id,
        details: {
          prNumber,
          previousStatus: task.status,
        },
      })

      completedCount++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cleanup] Failed to auto-complete task ${task.id.slice(0, 8)}:`, msg)
      await log({
        projectId: project.id,
        cycle,
        phase: "cleanup",
        action: "task_auto_complete_failed",
        taskId: task.id,
        details: { prNumber, error: msg },
      })
    }
  }

  if (completedCount > 0) {
    console.log(`[cleanup] Auto-completed ${completedCount} task(s) with merged PRs`)
  }

  return completedCount
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
