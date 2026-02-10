// Enhanced cleanup functions for the work-loop cleanup phase
// These functions address the gaps identified in the stale branch cleanup:
// 1. Local branches fully merged into main that aren't associated with any known task
// 2. Remote branches for merged PRs that may have been missed
// 3. Stale tracking refs

import { execFileSync } from "node:child_process"

interface LogRunParams {
  projectId: string
  cycle: number
  phase: "cleanup"
  action: string
  taskId?: string
  details?: Record<string, unknown>
}

interface MergedBranchCleanupContext {
  repoPath: string
  projectId: string
  cycle: number
  log: (params: LogRunParams) => Promise<void>
}

interface MergedBranchCleanupResult {
  actions: number
  branchesCleaned: string[]
}

/**
 * Clean local branches that are fully merged into main but not associated
 * with any active task in Clutch.
 *
 * This handles:
 * 1. Branches from completed tasks that somehow weren't cleaned up
 * 2. Branches created before the work-loop system existed
 * 3. Orphan branches left after manual merges
 *
 * SAFETY: Only deletes branches that are:
 * - Fully merged into main
 * - NOT in the active task list (in_progress, in_review, ready)
 * - NOT the currently checked out branch
 */
export async function cleanMergedLocalBranches(
  ctx: MergedBranchCleanupContext,
  activeTaskBranches: Set<string>
): Promise<MergedBranchCleanupResult> {
  const { repoPath, projectId, cycle, log } = ctx
  let actions = 0
  const branchesCleaned: string[] = []

  try {
    // Get all local branches fully merged into main
    const mergedBranchesOutput = execFileSync(
      "git",
      ["branch", "--merged", "main", "--format=%(refname:short)"],
      { encoding: "utf-8", timeout: 30_000, cwd: repoPath }
    )

    const mergedBranches = mergedBranchesOutput
      .trim()
      .split("\n")
      .filter(b => b && b !== "main" && !b.startsWith("*"))

    if (mergedBranches.length === 0) {
      return { actions: 0, branchesCleaned: [] }
    }

    console.log(`[cleanup] Found ${mergedBranches.length} branches merged into main`)

    // Get current branch to avoid deleting it
    const currentBranchOutput = execFileSync(
      "git",
      ["branch", "--show-current"],
      { encoding: "utf-8", timeout: 10_000, cwd: repoPath }
    ).trim()

    for (const branch of mergedBranches) {
      // Skip main branch (shouldn't happen due to filter above, but be safe)
      if (branch === "main") continue

      // Skip currently checked out branch
      if (branch === currentBranchOutput) {
        console.log(`[cleanup] Skipping current branch: ${branch}`)
        continue
      }

      // Skip branches associated with active tasks
      if (activeTaskBranches.has(branch)) {
        console.log(`[cleanup] Skipping active task branch: ${branch}`)
        continue
      }

      // Skip protected branches
      if (isProtectedBranch(branch)) {
        console.log(`[cleanup] Skipping protected branch: ${branch}`)
        continue
      }

      // Delete the branch
      try {
        execFileSync(
          "git",
          ["branch", "-D", branch],
          { encoding: "utf-8", timeout: 15_000, cwd: repoPath }
        )

        await log({
          projectId,
          cycle,
          phase: "cleanup",
          action: "merged_local_branch_deleted",
          details: { branch, reason: "fully_merged_to_main" },
        })

        branchesCleaned.push(branch)
        actions++
        console.log(`[cleanup] Deleted merged local branch: ${branch}`)
      } catch (deleteErr) {
        const msg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr)
        console.warn(`[cleanup] Failed to delete branch ${branch}: ${msg}`)

        await log({
          projectId,
          cycle,
          phase: "cleanup",
          action: "merged_local_branch_delete_failed",
          details: { branch, error: msg },
        })
      }
    }

    if (actions > 0) {
      console.log(`[cleanup] Cleaned ${actions} merged local branch(es)`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cleanup] Error in cleanMergedLocalBranches: ${msg}`)

    await log({
      projectId,
      cycle,
      phase: "cleanup",
      action: "merged_local_branch_cleanup_error",
      details: { error: msg },
    })
  }

  return { actions, branchesCleaned }
}

/**
 * Check if a branch should be protected from automatic cleanup
 */
function isProtectedBranch(branch: string): boolean {
  const protectedPatterns = [
    /^main$/,
    /^master$/,
    /^release\//,
    /^hotfix\//,
    /^production$/,
    /^staging$/,
    /^develop$/,
    /^dev$/,
  ]

  return protectedPatterns.some(pattern => pattern.test(branch))
}

/**
 * Prune stale remote-tracking references.
 *
 * This cleans up refs like origin/fix/xxx that no longer exist on the remote.
 * Usually happens when PRs are merged and branches deleted on GitHub.
 */
export async function pruneStaleRemoteRefs(
  ctx: MergedBranchCleanupContext
): Promise<number> {
  const { repoPath, projectId, cycle, log } = ctx

  try {
    // Get list of stale refs before pruning
    const staleRefsOutput = execFileSync(
      "git",
      ["remote", "prune", "origin", "--dry-run"],
      { encoding: "utf-8", timeout: 30_000, cwd: repoPath }
    )

    const staleCount = (staleRefsOutput.match(/would prune/g) || []).length

    if (staleCount === 0) {
      return 0
    }

    console.log(`[cleanup] Found ${staleCount} stale remote refs to prune`)

    // Actually prune
    execFileSync(
      "git",
      ["remote", "prune", "origin"],
      { encoding: "utf-8", timeout: 30_000, cwd: repoPath }
    )

    await log({
      projectId,
      cycle,
      phase: "cleanup",
      action: "remote_refs_pruned",
      details: { staleCount },
    })

    console.log(`[cleanup] Pruned ${staleCount} stale remote refs`)
    return staleCount
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[cleanup] Failed to prune remote refs: ${msg}`)

    await log({
      projectId,
      cycle,
      phase: "cleanup",
      action: "remote_refs_prune_failed",
      details: { error: msg },
    })

    return 0
  }
}

/**
 * Clean worktrees that don't have an associated active task.
 *
 * This handles worktrees for:
 * 1. Done tasks (already handled by cleanOrphanWorktrees)
 * 2. Tasks that were deleted/abandoned
 * 3. Branches created outside the work-loop system
 *
 * SAFETY: Only removes worktrees for branches that are:
 * - Fully merged into main
 * - Have no uncommitted changes
 * - Not associated with active tasks
 */
export async function cleanStaleWorktrees(
  ctx: MergedBranchCleanupContext & { _worktreesPath: string },
  activeTaskBranches: Set<string>
): Promise<{ actions: number; worktreesRemoved: string[] }> {
  const { repoPath, _worktreesPath, projectId, cycle, log } = ctx
  let actions = 0
  const worktreesRemoved: string[] = []

  try {
    // Get list of all worktrees with their branches
    const worktreeListOutput = execFileSync(
      "git",
      ["worktree", "list", "--porcelain"],
      { encoding: "utf-8", timeout: 10_000, cwd: repoPath }
    )

    // Parse worktree list to get path and branch for each
    const worktrees: Array<{ path: string; branch: string | null }> = []
    let currentWorktree: { path: string; branch: string | null } = { path: "", branch: null }

    for (const line of worktreeListOutput.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (currentWorktree.path) {
          worktrees.push({ ...currentWorktree })
        }
        currentWorktree = { path: line.slice(9), branch: null }
      } else if (line.startsWith("branch ")) {
        const fullRef = line.slice(7)
        // Extract short branch name from refs/heads/xxx
        currentWorktree.branch = fullRef.replace(/^refs\/heads\//, "")
      }
    }

    // Push the last one
    if (currentWorktree.path) {
      worktrees.push(currentWorktree)
    }

    // Get current branch to avoid removing its worktree
    const currentBranch = execFileSync(
      "git",
      ["branch", "--show-current"],
      { encoding: "utf-8", timeout: 10_000, cwd: repoPath }
    ).trim()

    // Get list of merged branches
    const mergedBranchesOutput = execFileSync(
      "git",
      ["branch", "--merged", "main", "--format=%(refname:short)"],
      { encoding: "utf-8", timeout: 30_000, cwd: repoPath }
    )
    const mergedBranches = new Set(mergedBranchesOutput.trim().split("\n").filter(Boolean))

    for (const worktree of worktrees) {
      // Skip if no branch (detached HEAD)
      if (!worktree.branch) continue

      // Skip main branch worktree
      if (worktree.branch === "main") continue

      // Skip currently checked out branch
      if (worktree.branch === currentBranch) {
        console.log(`[cleanup] Skipping worktree for current branch: ${worktree.branch}`)
        continue
      }
      
      // Skip active task branches
      if (activeTaskBranches.has(worktree.branch)) {
        console.log(`[cleanup] Skipping worktree for active task: ${worktree.branch}`)
        continue
      }

      // Only consider worktrees for branches that are fully merged
      if (!mergedBranches.has(worktree.branch)) {
        console.log(`[cleanup] Skipping worktree for unmerged branch: ${worktree.branch}`)
        continue
      }

      // Check for uncommitted changes
      const isDirty = hasUncommittedChanges(worktree.path)
      if (isDirty) {
        console.warn(`[cleanup] Worktree ${worktree.path} has uncommitted changes, skipping`)
        await log({
          projectId,
          cycle,
          phase: "cleanup",
          action: "stale_worktree_dirty_skip",
          details: { path: worktree.path, branch: worktree.branch },
        })
        continue
      }

      // Remove the worktree
      try {
        execFileSync(
          "git",
          ["worktree", "remove", worktree.path, "--force"],
          { encoding: "utf-8", timeout: 30_000, cwd: repoPath }
        )

        await log({
          projectId,
          cycle,
          phase: "cleanup",
          action: "stale_worktree_removed",
          details: { path: worktree.path, branch: worktree.branch },
        })

        worktreesRemoved.push(worktree.branch)
        actions++
        console.log(`[cleanup] Removed stale worktree: ${worktree.path} (${worktree.branch})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[cleanup] Failed to remove worktree ${worktree.path}: ${msg}`)
      }
    }

    if (actions > 0) {
      console.log(`[cleanup] Removed ${actions} stale worktree(s)`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cleanup] Error in cleanStaleWorktrees: ${msg}`)
  }

  return { actions, worktreesRemoved }
}

function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const status = execFileSync(
      "git",
      ["-C", worktreePath, "status", "--porcelain"],
      { encoding: "utf-8", timeout: 10_000 }
    )
    return status.trim().length > 0
  } catch {
    return true // Conservative: assume dirty on error
  }
}
