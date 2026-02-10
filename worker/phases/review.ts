import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import { agentManager } from "../agent-manager"
import type { WorkLoopConfig } from "../config"
import type { Task } from "../../lib/types"
import { buildPromptAsync } from "../prompts"
import { handlePostMergeDeploy } from "./convex-deploy"
import { handleSelfDeploy } from "./self-deploy"

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

interface ReviewContext {
  convex: ConvexHttpClient
  config: WorkLoopConfig
  cycle: number
  project: ProjectInfo
  log: (params: LogRunParams) => Promise<void>
}

interface ReviewResult {
  spawnedCount: number
  skippedCount: number
}

interface PRInfo {
  number: number
  title: string
}

interface RecoveryResult {
  success: boolean
  pr: PRInfo | null
  action: string
  details?: Record<string, unknown>
}

// ============================================
// Review Phase
// ============================================

/**
 * Run the review phase of the work loop.
 *
 * Finds tasks with status=in_review that have open PRs and spawns
 * reviewer sub-agents to review them.
 *
 * Logic:
 * 1. Query tasks with status=in_review from OpenClutch API
 * 2. For each task:
 *    a. Derive branch name: fix/<task-id-prefix> (first 8 chars)
 *    b. Check if open PR exists via gh CLI
 *    c. Check if reviewer child already running
 *    d. If PR exists and no reviewer running → spawn reviewer
 * 3. Build reviewer prompt using role template from Convex
 * 4. Spawn via ChildManager with role="reviewer", model="gpt"
 */
export async function runReview(ctx: ReviewContext): Promise<ReviewResult> {
  const { convex, config, cycle, project } = ctx

  let spawnedCount = 0
  let skippedCount = 0

  // Get tasks in review status for this project
  const tasks = await getInReviewTasks(convex, project.id)

  await ctx.log({
    projectId: project.id,
    cycle,
    phase: "review",
    action: "tasks_found",
    details: { count: tasks.length },
  })

  // Query active agents from Convex (source of truth, survives restarts)
  const allActiveTasks = await convex.query(api.tasks.getAllActiveAgentTasks, {})

  // Enforce: max 1 reviewer per project.
  // Sequential reviews prevent merge conflict cascades — each PR merges
  // before the next gets reviewed, so branches don't diverge.
  const projectActiveTasks = allActiveTasks.filter((t) => t.project_id === project.id)
  const projectReviewerCount = projectActiveTasks.filter((t) => t.role === "reviewer").length
  const projectConflictCount = projectActiveTasks.filter((t) => t.role === "conflict_resolver").length
  if (projectReviewerCount > 0 || projectConflictCount > 0) {
    const role = projectReviewerCount > 0 ? "reviewer" : "conflict_resolver"
    console.log(`[ReviewPhase] ${project.slug}: already has active ${role} — skipping ${tasks.length} in_review tasks (1 reviewer per project)`)
    await ctx.log({
      projectId: project.id,
      cycle,
      phase: "review",
      action: "limit_reached",
      details: { reason: "one_reviewer_per_project", activeRole: role, skippedCount: tasks.length },
    })
    return { spawnedCount: 0, skippedCount: tasks.length }
  }

  for (const task of tasks) {
    // Check global limits before each attempt
    const globalActive = allActiveTasks.length
    if (globalActive >= config.maxAgentsGlobal) {
      const remaining = tasks.length - tasks.indexOf(task)
      console.log(`[ReviewPhase] Global agent limit reached (${globalActive}/${config.maxAgentsGlobal}) — skipping ${remaining} review tasks`)
      await ctx.log({
        projectId: project.id,
        cycle,
        phase: "review",
        action: "limit_reached",
        details: { reason: "global_max_agents", limit: config.maxAgentsGlobal, skippedRemaining: remaining },
      })
      break
    }

    const result = await processTask(ctx, task, allActiveTasks)

    if (result.spawned) {
      spawnedCount++
    } else {
      skippedCount++
    }

    // Log individual task result
    await ctx.log({
      projectId: project.id,
      cycle,
      phase: "review",
      action: result.spawned ? "reviewer_spawned" : "reviewer_skipped",
      taskId: task.id,
      details: result.details,
    })

    // If we spawned anything (reviewer or conflict_resolver), stop — 1 per project
    if (result.spawned) {
      const remaining = tasks.length - tasks.indexOf(task) - 1
      if (remaining > 0) {
        console.log(`[ReviewPhase] ${project.slug}: spawned ${result.details.role ?? "reviewer"} for ${task.id.slice(0, 8)} — deferring ${remaining} remaining tasks`)
      }
      break
    }
  }

  return { spawnedCount, skippedCount }
}

// ============================================
// Task Processing
// ============================================

interface TaskProcessResult {
  spawned: boolean
  details: Record<string, unknown>
}

async function processTask(
  ctx: ReviewContext,
  task: Task,
  allActiveTasks: Task[]
): Promise<TaskProcessResult> {
  const { convex, project } = ctx

  // Use recorded branch name if available, otherwise derive from task ID
  const branchName = task.branch ?? `fix/${task.id.slice(0, 8)}`

  // ── Early merged-PR check ──────────────────────────────────────────
  // Before checking agent status, see if the PR was already merged.
  // This prevents stale agent_session_key from blocking task completion
  // when a reviewer merged the PR but the task wasn't moved to done.
  if (task.pr_number) {
    const alreadyMerged = isPRMerged(task.pr_number, project)
    if (alreadyMerged) {
      try {
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "done",
          reason: 'pr_already_merged',
        })
        await convex.mutation(api.tasks.update, {
          id: task.id,
          agent_session_key: undefined,
          agent_spawned_at: undefined,
        })
        console.log(`[ReviewPhase] Auto-closed task ${task.id.slice(0, 8)} — PR #${task.pr_number} already merged (early check)`)

        await handlePostMergeDeploy(convex, task.pr_number, project, task.id)
        await convex.mutation(api.task_events.logPRMerged, {
          taskId: task.id,
          prNumber: task.pr_number,
          mergedBy: 'work-loop',
        })
        await handleSelfDeploy(project, task.pr_number)
      } catch (err) {
        console.error(`[ReviewPhase] Failed to auto-close merged task ${task.id.slice(0, 8)}:`, err)
      }
      return {
        spawned: false,
        details: {
          reason: "pr_already_merged_early",
          taskId: task.id,
          prNumber: task.pr_number,
        },
      }
    }
  }

  // Check if agent already running for this task (in-memory check)
  if (agents.has(task.id)) {
    const existing = agents.get(task.id)
    return {
      spawned: false,
      details: {
        reason: "reviewer_already_running",
        taskId: task.id,
        sessionKey: existing?.sessionKey,
      },
    }
  }

  // Check if task already has an active agent session recorded (database check)
  // This prevents duplicate agent_assigned events when review phase runs multiple times
  if (task.agent_session_key) {
    return {
      spawned: false,
      details: {
        reason: "agent_session_already_active",
        taskId: task.id,
        sessionKey: task.agent_session_key,
      },
    }
  }

  // ── Recovery Pipeline ─────────────────────────────────────────────
  // Before checking for PR, attempt to recover unpushed work or missing PR.
  // This handles cases where the dev agent committed but didn't push,
  // or pushed but PR creation failed.
  const recovery = await runRecoveryPipeline(ctx, task, branchName)

  if (!recovery.success) {
    // Recovery failed — task is truly orphaned (no worktree, no remote branch, no PR)
    // Reset to ready for retry
    const newRetryCount = (task.agent_retry_count ?? 0) + 1
    console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} recovery failed — moving back to ready for retry (attempt ${newRetryCount})`)

    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        agent_retry_count: newRetryCount,
      })
      await convex.mutation(api.tasks.move, {
        id: task.id,
        status: "ready",
        reason: 'recovery_failed_orphaned',
      })
      await convex.mutation(api.comments.create, {
        taskId: task.id,
        author: "work-loop",
        authorType: "coordinator",
        content: `Recovery failed: no worktree, no remote branch, and no PR found. Moving back to ready for retry (attempt ${newRetryCount}).`,
        type: "status_change",
      })
    } catch (err) {
      console.error(`[ReviewPhase] Failed to move task back to ready:`, err)
    }

    return {
      spawned: false,
      details: {
        reason: "recovery_failed_orphaned",
        taskId: task.id,
        branch: branchName,
        retryCount: newRetryCount,
        ...recovery.details,
      },
    }
  }

  // If recovery found/created a PR, use it; otherwise check normally
  let pr = recovery.pr

  if (!pr) {
    // Check for open PR - use PR number if recorded, otherwise search by branch
    pr = task.pr_number
      ? await getPRByNumber(task.pr_number, project)
      : findOpenPR(branchName, project)
  }

  if (!pr) {
    // If the task has a recorded PR number, check if it was already merged.
    // Reviewers sometimes merge the PR but fail to update the task status.
    if (task.pr_number) {
      const merged = isPRMerged(task.pr_number, project)
      if (merged) {
        try {
          await convex.mutation(api.tasks.move, {
            id: task.id,
            status: "done",
            reason: 'pr_already_merged',
          })
          // Clear agent_session_key since task is done
          await convex.mutation(api.tasks.update, {
            id: task.id,
            agent_session_key: undefined,
          })
          console.log(`[ReviewPhase] Auto-closed task ${task.id.slice(0, 8)} — PR #${task.pr_number} already merged`)

          // Trigger Convex deploy if PR touched convex/ directory
          await handlePostMergeDeploy(convex, task.pr_number, project, task.id)
          // Log PR merged event (status change is already logged by tasks.move)
          await convex.mutation(api.task_events.logPRMerged, {
            taskId: task.id,
            prNumber: task.pr_number,
            mergedBy: 'work-loop',
          })
          // Self-deploy: pull + rebuild + restart if this is the clutch project
          // MUST be last — restarts the loop process, nothing after this runs
          await handleSelfDeploy(project, task.pr_number)
        } catch {
          // Non-fatal
        }
        return {
          spawned: false,
          details: {
            reason: "pr_already_merged",
            taskId: task.id,
            prNumber: task.pr_number,
          },
        }
      }
    }

    // Check if task has been in review for > 60 seconds with no PR
    // This catches agents that signaled review but never opened a PR
    const now = Date.now()
    const timeInReviewMs = now - task.updated_at
    const sixtySecondsMs = 60 * 1000

    if (timeInReviewMs > sixtySecondsMs) {
      const newRetryCount = (task.agent_retry_count ?? 0) + 1
      console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} has no PR after ${Math.round(timeInReviewMs / 1000)}s in review — moving back to ready for retry (attempt ${newRetryCount})`)

      try {
        // Update retry count first
        await convex.mutation(api.tasks.update, {
          id: task.id,
          agent_retry_count: newRetryCount,
        })

        // Move task back to ready (status change event logged by tasks.move)
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "ready",
          reason: 'no_pr_after_timeout',
        })

        // Add comment explaining the recovery
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: `Task was in review for ${Math.round(timeInReviewMs / 1000)}s with no PR found. Moving back to ready for retry (attempt ${newRetryCount}).`,
          type: "status_change",
        })
      } catch (err) {
        console.error(`[ReviewPhase] Failed to move task back to ready:`, err)
      }

      return {
        spawned: false,
        details: {
          reason: "no_pr_timeout_recovered",
          taskId: task.id,
          branch: branchName,
          timeInReviewMs,
          retryCount: newRetryCount,
        },
      }
    }

    return {
      spawned: false,
      details: {
        reason: "no_open_pr",
        taskId: task.id,
        branch: branchName,
        pr_number: task.pr_number,
      },
    }
  }

  // ── Pre-spawn rebase ──────────────────────────────────────────────
  // Before spawning a reviewer, rebase the branch onto origin/main.
  // This is a cheap shell exec (not an agent session). If rebase
  // succeeds, the PR is guaranteed conflict-free → spawn reviewer.
  // If rebase fails → spawn conflict_resolver (or block after max retries).
  const worktreesBase = `${project.local_path}-worktrees`
  const worktreePath = `${worktreesBase}/${branchName}`
  const rebaseResult = rebaseBranch(branchName, project)

  if (!rebaseResult.success) {
    // Rebase failed — conflicts detected
    const retryCount = task.agent_retry_count ?? 0
    const maxRetries = 2

    if (retryCount >= maxRetries) {
      console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} exceeded max conflict resolution attempts (${maxRetries}) — moving to blocked`)
      try {
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: `PR #${pr.number} has merge conflicts and automated resolution failed after ${retryCount} attempts. Conflicts: ${rebaseResult.error?.slice(0, 200) ?? "unknown"}`,
          type: "status_change",
        })
        await convex.mutation(api.tasks.move, {
          id: task.id,
          status: "blocked",
        })
      } catch (err) {
        console.error(`[ReviewPhase] Failed to move task to blocked:`, err)
      }
      return {
        spawned: false,
        details: {
          reason: "max_conflict_retries_exceeded",
          taskId: task.id,
          prNumber: pr.number,
          retryCount,
          maxRetries,
          rebaseError: rebaseResult.error,
        },
      }
    }

    // Spawn conflict resolver
    console.log(`[ReviewPhase] Rebase failed for task ${task.id.slice(0, 8)} PR #${pr.number} — spawning conflict_resolver (attempt ${retryCount + 1}/${maxRetries})`)

    let comments: Array<{ author: string; content: string; timestamp: string }> | undefined
    try {
      const taskComments = await convex.query(api.comments.getByTask, { taskId: task.id })
      comments = taskComments
        .filter((c) => c.type !== "status_change")
        .map((c) => ({
          author: c.author,
          content: c.content,
          timestamp: new Date(c.created_at).toISOString(),
        }))
    } catch {
      comments = undefined
    }

    let prompt: string
    try {
      prompt = await buildPromptAsync({
        role: "conflict_resolver",
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description ?? "",
        projectId: project.id,
        projectSlug: project.slug,
        repoDir: project.local_path!,
        worktreeDir: worktreePath,
        prNumber: pr.number,
        branch: branchName,
        comments,
      }, { convex })
    } catch (promptError) {
      const message = promptError instanceof Error ? promptError.message : String(promptError)
      console.error(`[ReviewPhase] Failed to build conflict_resolver prompt: ${message}`)
      return {
        spawned: false,
        details: { reason: "prompt_build_failed", taskId: task.id, prNumber: pr.number, error: message },
      }
    }

    try {
      const { sessionKey } = await agentManager.spawn({
        taskId: task.id,
        projectId: project.id,
        projectSlug: project.slug,
        role: "conflict_resolver",
        message: prompt,
        model: "kimi",
        timeoutSeconds: 600,
        retryCount: task.agent_retry_count ?? 0,
      })

      try {
        await convex.mutation(api.tasks.update, {
          id: task.id,
          session_id: sessionKey,
          agent_session_key: sessionKey,
          agent_spawned_at: Date.now(),
          agent_retry_count: (task.agent_retry_count ?? 0) + 1,
        })
        await convex.mutation(api.task_events.logAgentAssigned, {
          taskId: task.id,
          sessionKey,
          model: "kimi",
          role: "conflict_resolver",
        })
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: `Rebase onto main failed — spawning conflict resolver for PR #${pr.number} (attempt ${retryCount + 1}/${maxRetries})`,
          type: "status_change",
        })
      } catch (updateError) {
        console.error(`[ReviewPhase] Failed to update task agent info:`, updateError)
      }

      return {
        spawned: true,
        details: {
          taskId: task.id,
          prNumber: pr.number,
          prTitle: pr.title,
          branch: branchName,
          sessionKey,
          role: "conflict_resolver",
          attempt: retryCount + 1,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        spawned: false,
        details: { reason: "conflict_resolver_spawn_failed", taskId: task.id, prNumber: pr.number, error: message },
      }
    }
  }

  // Rebase succeeded — branch is clean against main. Spawn reviewer.

  // Fetch task comments for context (filter out automated status-change noise)
  let comments: Array<{ author: string; content: string; timestamp: string }> | undefined
  try {
    const taskComments = await convex.query(api.comments.getByTask, { taskId: task.id })
    comments = taskComments
      .filter((c) => c.type !== "status_change")  // Skip automated noise
      .map((c) => ({
        author: c.author,
        content: c.content,
        timestamp: new Date(c.created_at).toISOString(),
      }))
  } catch {
    // Non-fatal — proceed without comment context
    comments = undefined
  }

  // Build prompt using centralized prompt builder (fetches from Convex)
  let prompt: string
  try {
    prompt = await buildPromptAsync({
      role: "reviewer",
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description ?? "",
      projectId: project.id,
      projectSlug: project.slug,
      repoDir: project.local_path!,
      worktreeDir: worktreePath,
      prNumber: pr.number,
      comments,
    }, { convex })
  } catch (promptError) {
    const message = promptError instanceof Error ? promptError.message : String(promptError)
    console.error(`[ReviewPhase] Failed to build reviewer prompt: ${message}`)
    return {
      spawned: false,
      details: {
        reason: "prompt_build_failed",
        taskId: task.id,
        prNumber: pr.number,
        error: message,
      },
    }
  }

  try {
    const { sessionKey } = await agentManager.spawn({
      taskId: task.id,
      projectId: project.id,
      projectSlug: project.slug,
      role: "reviewer",
      message: prompt,
      model: "gpt",
      timeoutSeconds: 600,
      retryCount: task.review_count ?? 0,
    })

    // Write reviewer agent info to task and increment review_count
    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        session_id: sessionKey,
        agent_session_key: sessionKey,
        agent_spawned_at: Date.now(),
        review_count: (task.review_count ?? 0) + 1,
      })
      // Note: Agent activity is now tracked in sessions table
      // Log agent assignment event
      await convex.mutation(api.task_events.logAgentAssigned, {
        taskId: task.id,
        sessionKey,
        model: "gpt",
        role: "reviewer",
      })
    } catch (updateError) {
      console.error(`[ReviewPhase] Failed to update task agent info:`, updateError)
    }

    return {
      spawned: true,
      details: {
        taskId: task.id,
        prNumber: pr.number,
        prTitle: pr.title,
        branch: branchName,
        sessionKey,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      spawned: false,
      details: {
        reason: "spawn_failed",
        taskId: task.id,
        error: message,
      },
    }
  }
}

// ============================================
// Recovery Pipeline
// ============================================

/**
 * Run the recovery pipeline to find or create a PR for a task.
 *
 * This handles cases where:
 * - The dev agent committed but didn't push
 * - The dev agent pushed but PR creation failed
 * - The recorded PR number is stale/invalid
 *
 * Steps:
 * 1. Check for worktree existence
 * 2. Check for unpushed commits → push them
 * 3. Check for PR on GitHub
 * 4. If no PR but branch exists on remote → create PR
 * 5. Update task.pr_number if PR was found/created
 *
 * Returns:
 * - success: true if a PR was found or created
 * - pr: the PR info if found/created
 * - action: description of what was done
 */
async function runRecoveryPipeline(
  ctx: ReviewContext,
  task: Task,
  branchName: string
): Promise<RecoveryResult> {
  const { convex, project } = ctx
  const repoDir = project.local_path!
  const worktreesBase = `${repoDir}-worktrees`
  const worktreePath = `${worktreesBase}/${branchName}`

  // Step 1: Check for worktree existence
  const worktreeExists = checkWorktreeExists(worktreePath)

  if (worktreeExists) {
    // Step 2: Check for unpushed commits and push them
    const unpushedCommits = getUnpushedCommits(branchName, worktreePath)

    if (unpushedCommits > 0) {
      console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} has ${unpushedCommits} unpushed commits — pushing`)
      const pushResult = pushBranch(branchName, worktreePath)

      if (!pushResult.success) {
        console.warn(`[ReviewPhase] Failed to push branch ${branchName}: ${pushResult.error}`)
        // Continue anyway — maybe the branch is already on remote
      } else {
        console.log(`[ReviewPhase] Successfully pushed ${unpushedCommits} commits to ${branchName}`)
      }
    }
  }

  // Step 3: Check for PR on GitHub (by recorded number or branch name)
  let pr: PRInfo | null = null

  if (task.pr_number) {
    pr = await getPRByNumber(task.pr_number, project)
    if (pr) {
      return {
        success: true,
        pr,
        action: "found_by_recorded_number",
        details: { prNumber: pr.number },
      }
    }
    // Recorded PR number is stale — will try to find by branch or create new
    console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} recorded PR #${task.pr_number} not found — will search by branch`)
  }

  // Try to find by branch name
  pr = findOpenPR(branchName, project)
  if (pr) {
    // Found by branch but number didn't match — update the task
    if (task.pr_number !== pr.number) {
      console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} PR number corrected: #${task.pr_number} → #${pr.number}`)
      try {
        await convex.mutation(api.tasks.update, {
          id: task.id,
          pr_number: pr.number,
        })
      } catch (err) {
        console.error(`[ReviewPhase] Failed to update task PR number:`, err)
      }
    }
    return {
      success: true,
      pr,
      action: "found_by_branch",
      details: { prNumber: pr.number, corrected: task.pr_number !== pr.number },
    }
  }

  // Step 4: No PR found — check if branch exists on remote
  const branchOnRemote = checkBranchOnRemote(branchName, repoDir)

  if (branchOnRemote) {
    // Branch exists on remote but no PR — create one
    console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} branch ${branchName} exists on remote but no PR — creating PR`)

    const newPr = createPR(branchName, task, project)

    if (newPr) {
      // Update task with new PR number
      try {
        await convex.mutation(api.tasks.update, {
          id: task.id,
          pr_number: newPr.number,
        })
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: `Auto-created PR #${newPr.number} for branch ${branchName}.`,
          type: "status_change",
        })
      } catch (err) {
        console.error(`[ReviewPhase] Failed to update task with new PR number:`, err)
      }

      return {
        success: true,
        pr: newPr,
        action: "created_pr",
        details: { prNumber: newPr.number },
      }
    }

    // PR creation failed
    console.warn(`[ReviewPhase] Failed to create PR for ${branchName}`)
    return {
      success: false,
      pr: null,
      action: "pr_creation_failed",
      details: { branch: branchName, hasWorktree: worktreeExists, hasRemoteBranch: branchOnRemote },
    }
  }

  // Step 5: No worktree, no remote branch, no PR — truly orphaned
  if (!worktreeExists) {
    console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} is orphaned — no worktree, no remote branch, no PR`)
    return {
      success: false,
      pr: null,
      action: "orphaned_no_worktree",
      details: { branch: branchName },
    }
  }

  // Worktree exists but no remote branch and no PR
  console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} has worktree but no remote branch or PR`)
  return {
    success: false,
    pr: null,
    action: "orphaned_no_remote_branch",
    details: { branch: branchName, worktreePath },
  }
}

/**
 * Check if a worktree exists at the given path.
 */
function checkWorktreeExists(worktreePath: string): boolean {
  try {
    execFileSync(
      "test",
      ["-d", worktreePath],
      { encoding: "utf-8", timeout: 5_000 }
    )
    return true
  } catch {
    return false
  }
}

/**
 * Get the number of unpushed commits on a branch.
 * Returns 0 if no unpushed commits or on error.
 */
function getUnpushedCommits(branchName: string, worktreePath: string): number {
  try {
    const result = execFileSync(
      "git",
      ["log", `origin/${branchName}..${branchName}`, "--oneline"],
      { encoding: "utf-8", timeout: 10_000, cwd: worktreePath }
    )
    // Count non-empty lines
    return result.trim().split("\n").filter(line => line.length > 0).length
  } catch {
    // If the command fails (e.g., no upstream), assume there are commits to push
    // Check if there are any commits at all
    try {
      const result = execFileSync(
        "git",
        ["log", "--oneline", "-1"],
        { encoding: "utf-8", timeout: 10_000, cwd: worktreePath }
      )
      return result.trim().length > 0 ? 1 : 0
    } catch {
      return 0
    }
  }
}

/**
 * Push a branch to origin.
 */
function pushBranch(branchName: string, worktreePath: string): { success: boolean; error?: string } {
  try {
    execFileSync(
      "git",
      ["push", "-u", "origin", branchName],
      { encoding: "utf-8", timeout: 30_000, cwd: worktreePath, stdio: "pipe" }
    )
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Check if a branch exists on the remote.
 */
function checkBranchOnRemote(branchName: string, repoDir: string): boolean {
  try {
    execFileSync(
      "git",
      ["fetch", "origin", branchName, "--quiet"],
      { encoding: "utf-8", timeout: 15_000, cwd: repoDir }
    )
    // If fetch succeeds, check if the branch exists
    const result = execFileSync(
      "git",
      ["ls-remote", "--heads", "origin", branchName],
      { encoding: "utf-8", timeout: 10_000, cwd: repoDir }
    )
    return result.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Create a PR for a branch.
 */
function createPR(branchName: string, task: Task, project: ProjectInfo): PRInfo | null {
  try {
    const result = execFileSync(
      "gh",
      [
        "pr", "create",
        "--head", branchName,
        "--title", task.title,
        "--body", `Ticket: ${task.id}`,
      ],
      { encoding: "utf-8", timeout: 15_000, cwd: project.local_path! }
    )

    // Parse PR URL from output (e.g., "https://github.com/owner/repo/pull/123")
    const urlMatch = result.trim().match(/\/pull\/(\d+)$/)
    if (urlMatch) {
      const prNumber = parseInt(urlMatch[1], 10)
      return { number: prNumber, title: task.title }
    }

    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Failed to create PR for ${branchName}: ${message}`)
    return null
  }
}

// ============================================
// Convex Queries
// ============================================

async function getInReviewTasks(convex: ConvexHttpClient, projectId: string): Promise<Task[]> {
  try {
    const tasks = await convex.query(api.tasks.getByProject, {
      projectId,
      status: "in_review",
    })
    return tasks
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ReviewPhase] Failed to fetch in_review tasks: ${message}`)
    return []
  }
}

// ============================================
// GitHub PR Lookup
// ============================================

function findOpenPR(branchName: string, project: ProjectInfo): PRInfo | null {
  try {
    // Use --json with all open PRs and filter by prefix, since dev agents
    // may append descriptive suffixes to branch names (e.g. fix/058806db-chat-sidebar-agent-status)
    const result = execFileSync(
      "gh",
      ["pr", "list", "--state", "open", "--json", "number,title,headRefName"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!, // Run from main repo
      }
    )

    const prs = JSON.parse(result) as (PRInfo & { headRefName: string })[]

    // Match by exact name or prefix (fix/abcd1234 matches fix/abcd1234-some-description)
    const match = prs.find(pr => pr.headRefName === branchName || pr.headRefName.startsWith(branchName))

    if (!match) {
      return null
    }

    return match
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Failed to check PR for branch ${branchName}: ${message}`)
    return null
  }
}

/**
 * Check if a PR has been merged (not just closed).
 * Used to auto-close tasks whose PR was merged but task status wasn't updated.
 */
function isPRMerged(prNumber: number, project: ProjectInfo): boolean {
  try {
    const result = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "state"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!,
      }
    )

    const pr = JSON.parse(result) as { state: string }
    return pr.state === "MERGED"
  } catch {
    return false
  }
}

/**
 * Get PR info by PR number (direct lookup)
 */
function getPRByNumber(prNumber: number, project: ProjectInfo): PRInfo | null {
  try {
    const result = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "number,title,state"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!,
      }
    )

    const pr = JSON.parse(result) as PRInfo & { state: string }

    // Only return if PR is open
    if (pr.state !== "OPEN") {
      return null
    }

    return { number: pr.number, title: pr.title }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Failed to get PR #${prNumber}: ${message}`)
    return null
  }
}

// ============================================
// Pre-Spawn Rebase
// ============================================

interface RebaseResult {
  success: boolean
  error?: string
}

/**
 * Rebase a PR branch onto origin/main before spawning a reviewer.
 *
 * This is a cheap shell operation (not an agent session). Steps:
 * 1. git fetch origin main (ensure we have latest)
 * 2. git fetch origin <branch> (ensure branch is up-to-date)
 * 3. Create or reuse a worktree for the branch
 * 4. git rebase origin/main
 * 5. If success → git push --force-with-lease → return success
 * 6. If fail → git rebase --abort → return failure
 *
 * On success, the PR is guaranteed conflict-free and ready for review.
 */
function rebaseBranch(branchName: string, project: ProjectInfo): RebaseResult {
  const repoDir = project.local_path!
  const worktreesBase = `${repoDir}-worktrees`
  const worktreePath = `${worktreesBase}/${branchName}`

  try {
    // Fetch latest main and the PR branch
    execFileSync("git", ["fetch", "origin", "main", "--quiet"], {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: repoDir,
    })
    execFileSync("git", ["fetch", "origin", branchName, "--quiet"], {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: repoDir,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Failed to fetch for rebase of ${branchName}: ${message}`)
    // If fetch fails, treat as success (let the reviewer deal with it)
    return { success: true }
  }

  // Ensure worktree exists
  try {
    execFileSync("git", ["worktree", "add", worktreePath, branchName], {
      encoding: "utf-8",
      timeout: 15_000,
      cwd: repoDir,
      stdio: "pipe",
    })
  } catch {
    // Worktree may already exist — that's fine
  }

  // Check if branch is already up-to-date with main
  try {
    const mergeBase = execFileSync(
      "git", ["merge-base", "origin/main", `origin/${branchName}`],
      { encoding: "utf-8", timeout: 10_000, cwd: worktreePath }
    ).trim()
    const mainHead = execFileSync(
      "git", ["rev-parse", "origin/main"],
      { encoding: "utf-8", timeout: 10_000, cwd: worktreePath }
    ).trim()

    if (mergeBase === mainHead) {
      console.log(`[ReviewPhase] Branch ${branchName} already up-to-date with main`)
      return { success: true }
    }
  } catch {
    // If merge-base check fails, proceed with rebase anyway
  }

  // Attempt rebase
  try {
    execFileSync("git", ["rebase", "origin/main"], {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: worktreePath,
      stdio: "pipe",
    })
  } catch (error) {
    // Rebase failed — conflicts
    const message = error instanceof Error ? error.message : String(error)
    console.log(`[ReviewPhase] Rebase failed for ${branchName}: ${message.slice(0, 200)}`)

    // Abort the rebase to leave worktree clean
    try {
      execFileSync("git", ["rebase", "--abort"], {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: worktreePath,
        stdio: "pipe",
      })
    } catch {
      // If abort fails, try to clean up the worktree entirely
      try {
        execFileSync("git", ["worktree", "remove", worktreePath, "--force"], {
          encoding: "utf-8",
          timeout: 10_000,
          cwd: repoDir,
          stdio: "pipe",
        })
      } catch {
        // Best-effort cleanup
      }
    }

    return { success: false, error: message.slice(0, 500) }
  }

  // Rebase succeeded — force push
  try {
    execFileSync("git", ["push", "--force-with-lease", "origin", branchName], {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: worktreePath,
      stdio: "pipe",
    })
    console.log(`[ReviewPhase] Rebased and pushed ${branchName} successfully`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Rebase succeeded but push failed for ${branchName}: ${message}`)
    // Push failure isn't fatal — reviewer can still work with it
  }

  return { success: true }
}