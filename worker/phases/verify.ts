/**
 * Verify Phase
 *
 * Handles post-merge verification for tasks that have post_merge_steps defined.
 * Runs after a PR is merged but before the task is marked as done.
 *
 * Logic:
 * 1. Query tasks with status=in_review that have post_merge_steps defined
 * 2. Check if the PR has been merged
 * 3. If merged and verification hasn't run yet, spawn a verify agent
 * 4. The verify agent runs the post_merge_steps and reports success/failure
 * 5. Only move task to done if verification succeeds
 */

import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import { agentManager } from "../agent-manager"
import type { WorkLoopConfig } from "../config"
import type { Task } from "../../lib/types"
import { buildPromptAsync } from "../prompts"
import { isPRMerged, type ProjectInfo } from "./github"
import { getModelForRole } from "./work"

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

interface VerifyContext {
  convex: ConvexHttpClient
  config: WorkLoopConfig
  cycle: number
  project: ProjectInfo
  log: (params: LogRunParams) => Promise<void>
}

interface VerifyResult {
  verifiedCount: number
  spawnedCount: number
  skippedCount: number
}

// ============================================
// Verify Phase
// ============================================

/**
 * Run the verify phase of the work loop.
 *
 * Finds tasks with status=in_review that have post_merge_steps defined
 * and their PR has been merged. Spawns verify agents to run the steps.
 *
 * Logic:
 * 1. Query tasks with status=in_review and post_merge_steps != null
 * 2. For each task, check if PR is merged
 * 3. If merged and no verification running, spawn verify agent
 * 4. Verification agent runs steps and updates task status
 */
export async function runVerify(ctx: VerifyContext): Promise<VerifyResult> {
  const { convex, cycle, project } = ctx

  let verifiedCount = 0
  let spawnedCount = 0
  let skippedCount = 0

  // Get tasks in review with post_merge_steps for this project
  const tasks = await getTasksNeedingVerification(convex, project.id)

  await ctx.log({
    projectId: project.id,
    cycle,
    phase: "verify",
    action: "tasks_found",
    details: { count: tasks.length },
  })

  for (const task of tasks) {
    const result = await processTask(ctx, task)

    if (result.verified) {
      verifiedCount++
    } else if (result.spawned) {
      spawnedCount++
    } else {
      skippedCount++
    }

    // Log individual task result
    await ctx.log({
      projectId: project.id,
      cycle,
      phase: "verify",
      action: result.action,
      taskId: task.id,
      details: result.details,
    })

    // Only process one task per cycle to avoid overwhelming the system
    if (result.spawned) {
      break
    }
  }

  return { verifiedCount, spawnedCount, skippedCount }
}

// ============================================
// Task Processing
// ============================================

interface TaskProcessResult {
  verified: boolean
  spawned: boolean
  action: string
  details: Record<string, unknown>
}

async function processTask(
  ctx: VerifyContext,
  task: Task
): Promise<TaskProcessResult> {
  const { convex, project } = ctx

  // Check if task already has an active agent session
  if (task.agent_session_key) {
    return {
      verified: false,
      spawned: false,
      action: "verify_skipped_agent_active",
      details: {
        reason: "verification_agent_already_running",
        taskId: task.id,
        sessionKey: task.agent_session_key,
      },
    }
  }

  // Check if PR has been merged
  if (!task.pr_number) {
    return {
      verified: false,
      spawned: false,
      action: "verify_skipped_no_pr",
      details: {
        reason: "no_pr_number",
        taskId: task.id,
      },
    }
  }

  const merged = isPRMerged(task.pr_number, project)

  if (!merged) {
    return {
      verified: false,
      spawned: false,
      action: "verify_skipped_pr_not_merged",
      details: {
        reason: "pr_not_merged_yet",
        taskId: task.id,
        prNumber: task.pr_number,
      },
    }
  }

  // PR is merged - check verification status
  const verificationStatus = task.verification_status ?? "pending"

  if (verificationStatus === "success") {
    // Verification already succeeded - move to done
    try {
      await convex.mutation(api.tasks.move, {
        id: task.id,
        status: "done",
        reason: "post_merge_verification_succeeded",
      })
      await convex.mutation(api.tasks.update, {
        id: task.id,
        agent_session_key: undefined,
        agent_spawned_at: undefined,
      })
      console.log(`[VerifyPhase] Task ${task.id.slice(0, 8)} verification already succeeded — moved to done`)
      return {
        verified: true,
        spawned: false,
        action: "task_moved_to_done",
        details: {
          reason: "verification_previously_succeeded",
          taskId: task.id,
          prNumber: task.pr_number,
        },
      }
    } catch (err) {
      console.error(`[VerifyPhase] Failed to move task ${task.id.slice(0, 8)} to done:`, err)
      return {
        verified: false,
        spawned: false,
        action: "verify_failed_move_to_done",
        details: {
          error: String(err),
          taskId: task.id,
        },
      }
    }
  }

  if (verificationStatus === "failed") {
    // Verification failed - block for human triage
    try {
      await convex.mutation(api.tasks.move, {
        id: task.id,
        status: "blocked",
        reason: "post_merge_verification_failed",
      })
      await convex.mutation(api.tasks.update, {
        id: task.id,
        agent_session_key: undefined,
        agent_spawned_at: undefined,
      })
      await convex.mutation(api.comments.create, {
        taskId: task.id,
        author: "work-loop",
        authorType: "coordinator",
        content: `Post-merge verification failed. Check the verification output for details.`,
        type: "status_change",
      })
      console.log(`[VerifyPhase] Task ${task.id.slice(0, 8)} verification failed — moved to blocked`)
      return {
        verified: false,
        spawned: false,
        action: "task_moved_to_blocked",
        details: {
          reason: "verification_failed",
          taskId: task.id,
          prNumber: task.pr_number,
        },
      }
    } catch (err) {
      console.error(`[VerifyPhase] Failed to move task ${task.id.slice(0, 8)} to blocked:`, err)
      return {
        verified: false,
        spawned: false,
        action: "verify_failed_move_to_blocked",
        details: {
          error: String(err),
          taskId: task.id,
        },
      }
    }
  }

  if (verificationStatus === "running") {
    // Verification is running - this shouldn't happen without agent_session_key
    // but handle it just in case
    return {
      verified: false,
      spawned: false,
      action: "verify_skipped_already_running",
      details: {
        reason: "verification_marked_as_running",
        taskId: task.id,
      },
    }
  }

  // verificationStatus is "pending" - spawn verify agent
  return await spawnVerifyAgent(ctx, task)
}

// ============================================
// Verify Agent Spawning
// ============================================

async function spawnVerifyAgent(
  ctx: VerifyContext,
  task: Task
): Promise<TaskProcessResult> {
  const { convex, cycle, project } = ctx

  const branchName = task.branch ?? `fix/${task.id.slice(0, 8)}`
  const worktreesBase = `${project.local_path!}-worktrees`
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

  // Build prompt using centralized prompt builder
  let prompt: string
  try {
    prompt = await buildPromptAsync({
      role: "verify",
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description ?? "",
      projectId: project.id,
      projectSlug: project.slug,
      repoDir: project.local_path!,
      worktreeDir: worktreePath,
      prNumber: task.pr_number!,
      branch: branchName,
      comments,
      postMergeSteps: task.post_merge_steps ?? undefined,
    }, { convex })
  } catch (promptError) {
    const message = promptError instanceof Error ? promptError.message : String(promptError)
    console.error(`[VerifyPhase] Failed to build verify prompt: ${message}`)
    return {
      verified: false,
      spawned: false,
      action: "verify_prompt_failed",
      details: {
        reason: "prompt_build_failed",
        taskId: task.id,
        error: message,
      },
    }
  }

  const verifyModel = getModelForRole("verify", project)

  try {
    // Update task to show verification is running
    await convex.mutation(api.tasks.update, {
      id: task.id,
      verification_status: "running",
    })

    const { sessionKey } = await agentManager.spawn({
      taskId: task.id,
      projectId: project.id,
      projectSlug: project.slug,
      role: "verify",
      message: prompt,
      model: verifyModel,
      timeoutSeconds: 1800, // 30 minutes for verification
      retryCount: 0,
    })

    // Write verify agent info to task
    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        session_id: sessionKey,
        agent_session_key: sessionKey,
        agent_spawned_at: Date.now(),
      })
      await convex.mutation(api.task_events.logAgentAssigned, {
        taskId: task.id,
        sessionKey,
        model: verifyModel,
        role: "verify",
      })
    } catch (updateError) {
      console.error(`[VerifyPhase] Failed to update task agent info:`, updateError)
    }

    return {
      verified: false,
      spawned: true,
      action: "verify_agent_spawned",
      details: {
        taskId: task.id,
        prNumber: task.pr_number,
        branch: branchName,
        sessionKey,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Reset verification status on spawn failure
    await convex.mutation(api.tasks.update, {
      id: task.id,
      verification_status: "pending",
    })
    return {
      verified: false,
      spawned: false,
      action: "verify_spawn_failed",
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

async function getTasksNeedingVerification(
  convex: ConvexHttpClient,
  projectId: string
): Promise<Task[]> {
  try {
    const tasks = await convex.query(api.tasks.getByProject, {
      projectId,
      status: "in_review",
    })
    // Filter to only tasks with post_merge_steps defined
    return tasks.filter((t) => t.post_merge_steps !== null && t.post_merge_steps !== undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[VerifyPhase] Failed to fetch tasks needing verification: ${message}`)
    return []
  }
}
