import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { AgentManager } from "../agent-manager"
import type { WorkLoopConfig } from "../config"
import type { Task } from "../../lib/types"
import { buildPromptAsync } from "../prompts"
import { handlePostMergeDeploy } from "./convex-deploy"

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
  agents: AgentManager
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
  const { convex, agents, config, cycle, project } = ctx

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

  for (const task of tasks) {
    const result = await processTask(ctx, task)

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

    // Check reviewer role limit
    const reviewerCount = agents.activeCountByRole("reviewer")
    if (reviewerCount >= config.maxReviewerAgents) {
      await ctx.log({
        projectId: project.id,
        cycle,
        phase: "review",
        action: "limit_reached",
        details: { reason: "reviewer_limit", reviewerCount, limit: config.maxReviewerAgents },
      })
      break
    }

    // Check global limits after each spawn
    const globalActive = agents.activeCount()
    if (globalActive >= config.maxAgentsGlobal) {
      await ctx.log({
        projectId: project.id,
        cycle,
        phase: "review",
        action: "limit_reached",
        details: { reason: "global_max_agents", limit: config.maxAgentsGlobal },
      })
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

async function processTask(ctx: ReviewContext, task: Task): Promise<TaskProcessResult> {
  const { convex, agents, project, config } = ctx

  // Use recorded branch name if available, otherwise derive from task ID
  const branchName = task.branch ?? `fix/${task.id.slice(0, 8)}`

  // Check if agent already running for this task
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

  // Check for open PR - use PR number if recorded, otherwise search by branch
  const pr = task.pr_number
    ? await getPRByNumber(task.pr_number, project)
    : findOpenPR(branchName, project)

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
          })
          console.log(`[ReviewPhase] Auto-closed task ${task.id.slice(0, 8)} — PR #${task.pr_number} already merged`)

          // Trigger Convex deploy if PR touched convex/ directory
          await handlePostMergeDeploy(convex, task.pr_number, project, task.id)
          // Log status change event (in_review -> done) for auto-merged PR
          await convex.mutation(api.task_events.logStatusChange, {
            taskId: task.id,
            from: 'in_review',
            to: 'done',
            actor: 'work-loop',
            reason: 'pr_already_merged',
          })
          // Log PR merged event
          await convex.mutation(api.task_events.logPRMerged, {
            taskId: task.id,
            prNumber: task.pr_number,
            mergedBy: 'work-loop',
          })
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

  // Check if PR has merge conflicts — spawn conflict resolver or escalate
  const mergeableStatus = getPRMergeableStatus(pr.number, project)

  if (mergeableStatus === "CONFLICTING" || mergeableStatus === "DIRTY") {
    const retryCount = task.agent_retry_count ?? 0
    const maxRetries = 2  // Max 2 attempts before escalating

    // Check conflict resolver limit
    const conflictResolverCount = agents.activeCountByRole("conflict_resolver")
    if (conflictResolverCount >= config.maxConflictResolverAgents) {
      console.log(`[ReviewPhase] Skipping task ${task.id.slice(0, 8)} — conflict resolver limit reached`)
      return {
        spawned: false,
        details: {
          reason: "conflict_resolver_limit_reached",
          taskId: task.id,
          prNumber: pr.number,
          limit: config.maxConflictResolverAgents,
        },
      }
    }

    if (retryCount >= maxRetries) {
      // Max retries exceeded — move to blocked with triage comment
      console.log(`[ReviewPhase] Task ${task.id.slice(0, 8)} exceeded max conflict resolution attempts (${maxRetries}) — moving to blocked`)

      try {
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: `PR #${pr.number} has merge conflicts and automated resolution failed after ${retryCount} attempts. Requires manual triage to resolve complex conflicts.`,
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
        },
      }
    }

    // Spawn conflict resolver agent
    console.log(`[ReviewPhase] Spawning conflict resolver for task ${task.id.slice(0, 8)} — PR #${pr.number} has merge conflicts (attempt ${retryCount + 1}/${maxRetries})`)

    const worktreesBase = `${project.local_path}-worktrees`
    const worktreePath = `${worktreesBase}/${branchName}`

    // Fetch task comments for context
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

    // Build prompt using centralized prompt builder (fetches from Convex)
    let prompt: string
    try {
      prompt = await buildPromptAsync({
        role: "conflict_resolver",
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description ?? "",
        projectId: project.id,
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
        details: {
          reason: "prompt_build_failed",
          taskId: task.id,
          prNumber: pr.number,
          error: message,
        },
      }
    }

    try {
      const handle = await agents.spawn({
        taskId: task.id,
        projectId: project.id,
        role: "conflict_resolver",
        message: prompt,
        model: "kimi",  // Use Kimi for reliable execution
        timeoutSeconds: 600,
      })

      // Update agent tracking with retry count increment
      try {
        await convex.mutation(api.tasks.update, {
          id: task.id,
          session_id: handle.sessionKey,
          agent_session_key: handle.sessionKey,
        })
        // Note: Agent activity is now tracked in sessions table
        // Log agent assignment event
        await convex.mutation(api.task_events.logAgentAssigned, {
          taskId: task.id,
          sessionKey: handle.sessionKey,
          model: "kimi",
          role: "conflict_resolver",
        })
        // Log conflict resolution attempt
        await convex.mutation(api.comments.create, {
          taskId: task.id,
          author: "work-loop",
          authorType: "coordinator",
          content: `Attempting automated conflict resolution for PR #${pr.number} (attempt ${retryCount + 1}/${maxRetries})`,
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
          sessionKey: handle.sessionKey,
          role: "conflict_resolver",
          attempt: retryCount + 1,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        spawned: false,
        details: {
          reason: "conflict_resolver_spawn_failed",
          taskId: task.id,
          prNumber: pr.number,
          error: message,
        },
      }
    }
  }

  // UNKNOWN is treated as reviewable (GitHub sometimes returns this briefly)
  // MERGEABLE is obviously fine to review

  // Spawn reviewer via gateway RPC
  // Use actual branch name for worktree path (handles descriptive suffixes)
  const worktreesBase = `${project.local_path}-worktrees`
  const worktreePath = `${worktreesBase}/${branchName}`

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
    const handle = await agents.spawn({
      taskId: task.id,
      projectId: project.id,
      role: "reviewer",
      message: prompt,
      model: "gpt",
      timeoutSeconds: 600,
    })

    // Write reviewer agent info to task (same pattern as work phase)
    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        session_id: handle.sessionKey,
        agent_session_key: handle.sessionKey,
      })
      // Note: Agent activity is now tracked in sessions table
      // Log agent assignment event
      await convex.mutation(api.task_events.logAgentAssigned, {
        taskId: task.id,
        sessionKey: handle.sessionKey,
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
        sessionKey: handle.sessionKey,
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

/**
 * Check if a PR has merge conflicts.
 * Returns "CONFLICTING" | "MERGEABLE" | "UNKNOWN" | null (on error)
 */
function getPRMergeableStatus(prNumber: number, project: ProjectInfo): string | null {
  try {
    const result = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "mergeable"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!,
      }
    )

    const pr = JSON.parse(result) as { mergeable: string }
    return pr.mergeable
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Failed to check mergeable status for PR #${prNumber}: ${message}`)
    return null
  }
}
