/**
 * Work Loop Orchestrator
 *
 * Main entry point for the persistent work loop process.
 * Cycles through phases (cleanup → review → work → analyze) indefinitely,
 * logging all actions to Convex for visibility.
 */

import { execFileSync } from "node:child_process"
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
import { handleSelfDeploy } from "./phases/self-deploy"
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
// GitHub PR Helpers (for auto-merge fallback)
// ============================================

interface PRStatus {
  mergeable: string
  reviewDecision: string
  state: string
}

interface PRExpandedStatus {
  mergeable: string
  reviewDecision: string
  state: string
  statusCheckRollup: Array<{
    state: string
    context?: string
  }>
  reviews: Array<{
    state: string
    author: {
      login: string
    }
  }>
}

/**
 * Check if a PR is approved and mergeable.
 * Returns PR status or null on error.
 */
function getPRStatus(prNumber: number, project: ProjectInfo): PRStatus | null {
  try {
    const result = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "mergeable,reviewDecision,state"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!,
      }
    )
    return JSON.parse(result) as PRStatus
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[WorkLoop] Failed to check PR #${prNumber} status: ${message}`)
    return null
  }
}

/**
 * Get expanded PR status including CI checks and review details.
 * Returns PR status or null on error.
 */
function getPRExpandedStatus(prNumber: number, project: ProjectInfo): PRExpandedStatus | null {
  try {
    const result = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "mergeable,reviewDecision,state,statusCheckRollup,reviews"],
      {
        encoding: "utf-8",
        timeout: 15_000,
        cwd: project.local_path!,
      }
    )
    return JSON.parse(result) as PRExpandedStatus
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[WorkLoop] Failed to check PR #${prNumber} expanded status: ${message}`)
    return null
  }
}

/**
 * Auto-merge a PR using squash strategy.
 * Returns true on success, false on failure.
 */
function autoMergePR(prNumber: number, project: ProjectInfo): boolean {
  try {
    execFileSync(
      "gh",
      ["pr", "merge", String(prNumber), "--squash", "--delete-branch"],
      {
        encoding: "utf-8",
        timeout: 30_000,
        cwd: project.local_path!,
      }
    )
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[WorkLoop] Auto-merge failed for PR #${prNumber}: ${message}`)
    return false
  }
}

/**
 * Positive signals indicating reviewer approves but forgot to merge
 */
const POSITIVE_REVIEW_SIGNALS = [
  /lgmt/i,
  /looks good/i,
  /looks great/i,
  /approved/i,
  /approving/i,
  /merging/i,
  /no issues/i,
  /no problems/i,
  /ship it/i,
  /\blgtm\b/i,
  /ready to merge/i,
  /good to merge/i,
  /merge this/i,
  /clean merge/i,
  /well done/i,
  /nice work/i,
  /great job/i,
]

/**
 * Negative signals indicating reviewer wants changes
 */
const NEGATIVE_REVIEW_SIGNALS = [
  /request changes/i,
  /changes requested/i,
  /needs work/i,
  /needs fixing/i,
  /needs to be fixed/i,
  /should fix/i,
  /must fix/i,
  /blocking/i,
  /reject/i,
  /not ready/i,
  /don't merge/i,
  /do not merge/i,
  /issues found/i,
  /problems found/i,
  /concerns/i,
  /problematic/i,
  /broken/i,
  /fails/i,
  /failing/i,
  /error in/i,
  /bug in/i,
  /needs refactor/i,
  /should refactor/i,
]

/**
 * Analyze reviewer output to determine sentiment.
 * Returns: 'positive' | 'negative' | 'neutral'
 */
function analyzeReviewerOutput(output: string): 'positive' | 'negative' | 'neutral' {
  const lowerOutput = output.toLowerCase()

  // Check for negative signals first (more specific/important)
  for (const pattern of NEGATIVE_REVIEW_SIGNALS) {
    if (pattern.test(lowerOutput)) {
      return 'negative'
    }
  }

  // Check for positive signals
  for (const pattern of POSITIVE_REVIEW_SIGNALS) {
    if (pattern.test(lowerOutput)) {
      return 'positive'
    }
  }

  return 'neutral'
}

/**
 * Check if CI checks pass (or no required checks).
 * Returns true if safe to auto-merge from CI perspective.
 */
function checksPass(status: PRExpandedStatus): boolean {
  if (!status.statusCheckRollup || status.statusCheckRollup.length === 0) {
    return true // No checks configured
  }

  // All checks must be SUCCESS or NEUTRAL (not FAILURE or PENDING)
  for (const check of status.statusCheckRollup) {
    const state = (check.state ?? "").toUpperCase()
    if (state === 'FAILURE' || state === 'ERROR' || state === 'TIMED_OUT') {
      return false
    }
    // PENDING, EXPECTED, or STARTED means checks are still running
    if (state === 'PENDING' || state === 'EXPECTED' || state === 'STARTED') {
      return false
    }
  }

  return true
}

/**
 * Check if PR has any changes_requested reviews.
 * Returns true if no changes requested (safe to auto-merge).
 */
function noChangesRequested(status: PRExpandedStatus): boolean {
  if (!status.reviews || status.reviews.length === 0) {
    return true
  }

  for (const review of status.reviews) {
    if ((review.state ?? "").toUpperCase() === 'CHANGES_REQUESTED') {
      return false
    }
  }

  return true
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
  const config = loadConfig()
  const staleMs = config.staleTaskMinutes * 60 * 1000
  const staleReviewMs = config.staleReviewMinutes * 60 * 1000
  const { reaped } = await agentManager.reapFinished(staleMs, staleReviewMs)

  // Drain completed queue — catches outcomes from fire-and-forget _runAgent
  // promises that resolved/rejected between cycles (e.g. gateway errors).
  // Without this, failed spawns silently disappear from the agents map and
  // the ghost detector is the only thing that catches them (after 2min delay).
  const asyncCompleted = agentManager.drainCompleted()
  if (asyncCompleted.length > 0) {
    console.log(
      `[WorkLoop] Drained ${asyncCompleted.length} async outcome(s): ` +
      asyncCompleted.map((o) => `${o.sessionKey} (${o.error ? 'error: ' + o.error.slice(0, 100) : o.reply})`).join(", "),
    )
  }

  // Merge both sources — reaped (from JSONL inspection) + async (from gateway RPC results)
  // Deduplicate by taskId since both paths could theoretically produce an outcome for the same task
  const allOutcomes: typeof reaped = [...reaped]
  const seenTaskIds = new Set(reaped.map((r) => r.taskId))
  for (const outcome of asyncCompleted) {
    if (!seenTaskIds.has(outcome.taskId)) {
      allOutcomes.push(outcome)
      seenTaskIds.add(outcome.taskId)
    }
  }

  // Note: Active agent activity is now tracked via sessions table, not tasks

  if (allOutcomes.length > 0) {
    for (const outcome of allOutcomes) {
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
          // Get the model from session info (more reliable than task fields)
          const sessionInfo = sessionFileReader.getSessionInfo(outcome.sessionKey)
          const model = sessionInfo?.lastAssistantMessage?.model

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

      // Note: Agent session data is now tracked in sessions table, not tasks
      // We clear agent_session_key when tasks move to done so that queries
      // filtering by agent_session_key != null only return active tasks.
      // The sessions table and task_events provide the audit trail.

      // Post-reap status verification — simplified block rule:
      // If agent finished but task is still in_progress or in_review, move to blocked
      try {
        const task = await convex.query(api.tasks.getById, { id: outcome.taskId })
        if (!task) continue

        const currentStatus = task.task.status

        // Case 1: Dev agent finished while task still in_progress
        if (currentStatus === "in_progress") {
          const hasPR = !!task.task.pr_number

          if (hasPR) {
            // Dev created a PR — move to in_review for autonomous review
            await convex.mutation(api.tasks.move, {
              id: outcome.taskId,
              status: "in_review",
            })
            console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to in_review (dev finished with PR #${task.task.pr_number})`)
            await logRun(convex, {
              projectId: project.id,
              cycle,
              phase: "cleanup",
              action: "task_to_review",
              taskId: outcome.taskId,
              details: { reason: "dev_finished_with_pr", prNumber: task.task.pr_number, role: outcome.role },
            })
          } else {
            // No PR — something went wrong, block for triage
            await convex.mutation(api.tasks.move, {
              id: outcome.taskId,
              status: "blocked",
            })
            const agentOutput = outcome.reply?.slice(0, 500)
            const blockReason = agentOutput
              ? `Agent finished without creating a PR. Moving to blocked for triage.\n\n**Agent's last output:**\n> ${agentOutput}`
              : `Agent finished without creating a PR (no output captured). Moving to blocked for triage.`
            await convex.mutation(api.comments.create, {
              taskId: outcome.taskId,
              author: "work-loop",
              authorType: "coordinator",
              content: blockReason,
              type: "status_change",
            })
            console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to blocked (finished without PR)`)
            await logRun(convex, {
              projectId: project.id,
              cycle,
              phase: "cleanup",
              action: "task_blocked",
              taskId: outcome.taskId,
              details: { reason: "finished_without_pr", role: outcome.role },
            })
          }
        }
        // Case 2: Reviewer finished but task still in_review → try auto-merge fallback, then retry/block
        else if (currentStatus === "in_review" && outcome.role === "reviewer") {
          const prNumber = task.task.pr_number
          let autoMerged = false
          const reviewerOutput = outcome.reply ?? ""
          const reviewerSentiment = analyzeReviewerOutput(reviewerOutput)
          const retryCount = task.task.agent_retry_count ?? 0
          const maxReviewerRetries = 2 // Max 2 reviewer attempts before blocking

          // Step 1: Try expanded auto-merge criteria (even without explicit GitHub approval)
          if (prNumber && project.local_path) {
            const prStatus = getPRExpandedStatus(prNumber, project)

            if (prStatus?.state === "OPEN" && prStatus?.mergeable === "MERGEABLE") {
              // Standard auto-merge: explicitly approved
              const isExplicitlyApproved = prStatus?.reviewDecision === "APPROVED"
              // Expanded auto-merge: no changes requested + CI passes + positive/neutral reviewer sentiment
              const noChangesReq = noChangesRequested(prStatus)
              const ciPasses = checksPass(prStatus)
              const sentimentAllows = reviewerSentiment !== 'negative'

              if (isExplicitlyApproved) {
                // Original behavior: PR was explicitly approved via gh pr review
                console.log(`[WorkLoop] PR #${prNumber} is approved and mergeable — attempting auto-merge`)
                const mergeSuccess = autoMergePR(prNumber, project)
                if (mergeSuccess) {
                  await convex.mutation(api.tasks.move, {
                    id: outcome.taskId,
                    status: "done",
                    reason: `Auto-merged approved PR #${prNumber} (reviewer finished without merging)`
                  })
                  // Clear agent fields since task is done
                  await convex.mutation(api.tasks.update, {
                    id: outcome.taskId,
                    agent_session_key: undefined,
                    agent_spawned_at: undefined,
                  })
                  await convex.mutation(api.comments.create, {
                    taskId: outcome.taskId,
                    author: "work-loop",
                    authorType: "coordinator",
                    content: `Reviewer finished without merging, but PR #${prNumber} was approved and mergeable — auto-merged successfully.`,
                    type: "status_change",
                  })
                  await convex.mutation(api.task_events.logPRMerged, {
                    taskId: outcome.taskId,
                    prNumber: prNumber,
                    mergedBy: "work-loop (auto-merge fallback)",
                  })
                  console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} auto-merged PR #${prNumber} and marked done`)
                  await logRun(convex, {
                    projectId: project.id,
                    cycle,
                    phase: "cleanup",
                    action: "task_auto_merged",
                    taskId: outcome.taskId,
                    details: { reason: "reviewer_no_merge_but_approved", prNumber, role: outcome.role },
                  })
                  // Self-deploy: pull + rebuild + restart if clutch project
                  // MUST be last — restarts the loop process
                  await handleSelfDeploy(project, prNumber)
                  autoMerged = true
                } else {
                  console.log(`[WorkLoop] Auto-merge failed for PR #${prNumber} — will check for retry eligibility`)
                }
              } else if (noChangesReq && ciPasses && sentimentAllows) {
                // Expanded auto-merge: reviewer said LGTM but forgot to approve/merge
                console.log(`[WorkLoop] PR #${prNumber} eligible for expanded auto-merge: no_changes_requested=${noChangesReq}, ci_passes=${ciPasses}, sentiment=${reviewerSentiment}`)
                const mergeSuccess = autoMergePR(prNumber, project)
                if (mergeSuccess) {
                  await convex.mutation(api.tasks.move, {
                    id: outcome.taskId,
                    status: "done",
                    reason: `Auto-merged PR #${prNumber} via expanded criteria (positive review, CI passing)`
                  })
                  // Clear agent fields since task is done
                  await convex.mutation(api.tasks.update, {
                    id: outcome.taskId,
                    agent_session_key: undefined,
                    agent_spawned_at: undefined,
                  })
                  await convex.mutation(api.comments.create, {
                    taskId: outcome.taskId,
                    author: "work-loop",
                    authorType: "coordinator",
                    content: `Reviewer finished without merging, but their review was positive (no issues found, CI passing). Auto-merged PR #${prNumber}.`,
                    type: "status_change",
                  })
                  await convex.mutation(api.task_events.logPRMerged, {
                    taskId: outcome.taskId,
                    prNumber: prNumber,
                    mergedBy: "work-loop (expanded auto-merge)",
                  })
                  console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} auto-merged PR #${prNumber} via expanded criteria and marked done`)
                  await logRun(convex, {
                    projectId: project.id,
                    cycle,
                    phase: "cleanup",
                    action: "task_auto_merged",
                    taskId: outcome.taskId,
                    details: { reason: "reviewer_positive_but_forgot_merge", prNumber, role: outcome.role, sentiment: reviewerSentiment },
                  })
                  // Self-deploy: pull + rebuild + restart if clutch project
                  // MUST be last — restarts the loop process
                  await handleSelfDeploy(project, prNumber)
                  autoMerged = true
                } else {
                  console.log(`[WorkLoop] Expanded auto-merge failed for PR #${prNumber} — will check for retry eligibility`)
                }
              } else {
                console.log(`[WorkLoop] PR #${prNumber} not eligible for auto-merge: approved=${isExplicitlyApproved}, no_changes=${noChangesReq}, ci_passes=${ciPasses}, sentiment=${reviewerSentiment}`)
              }
            } else {
              console.log(`[WorkLoop] PR #${prNumber} not eligible for auto-merge: state=${prStatus?.state}, mergeable=${prStatus?.mergeable}`)
            }
          }

          // Step 2: If auto-merge didn't happen, decide between retry vs block
          if (!autoMerged) {
            if (reviewerSentiment === 'negative') {
              // Reviewer found issues — block for triage (correct behavior)
              await convex.mutation(api.tasks.move, {
                id: outcome.taskId,
                status: "blocked",
              })
              const reviewerOutputPreview = reviewerOutput.slice(0, 500)
              const reviewBlockReason = reviewerOutputPreview
                ? `Reviewer finished with concerns. Moving to blocked for triage.\n\n**Reviewer's last output:**\n> ${reviewerOutputPreview}`
                : `Reviewer finished with concerns (no output captured). Moving to blocked for triage.`
              await convex.mutation(api.comments.create, {
                taskId: outcome.taskId,
                author: "work-loop",
                authorType: "coordinator",
                content: reviewBlockReason,
                type: "status_change",
              })
              console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to blocked (reviewer found issues)`)
              await logRun(convex, {
                projectId: project.id,
                cycle,
                phase: "cleanup",
                action: "task_blocked",
                taskId: outcome.taskId,
                details: { reason: "reviewer_negative_feedback", role: outcome.role, sentiment: reviewerSentiment },
              })
            } else if (retryCount < maxReviewerRetries) {
              // Positive/neutral sentiment and retries remaining — re-queue for another review
              const newRetryCount = retryCount + 1
              console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} reviewer sentiment=${reviewerSentiment}, retry ${newRetryCount}/${maxReviewerRetries} — re-queueing for another review`)

              await convex.mutation(api.tasks.update, {
                id: outcome.taskId,
                agent_retry_count: newRetryCount,
              })

              await convex.mutation(api.comments.create, {
                taskId: outcome.taskId,
                author: "work-loop",
                authorType: "coordinator",
                content: `Reviewer finished without merging (sentiment: ${reviewerSentiment}). Re-queueing for review attempt ${newRetryCount}/${maxReviewerRetries}.`,
                type: "status_change",
              })

              await logRun(convex, {
                projectId: project.id,
                cycle,
                phase: "cleanup",
                action: "task_requeued_for_review",
                taskId: outcome.taskId,
                details: { reason: "reviewer_no_merge", role: outcome.role, sentiment: reviewerSentiment, retryCount: newRetryCount, maxRetries: maxReviewerRetries },
              })
            } else {
              // Max retries exceeded — block for triage
              await convex.mutation(api.tasks.move, {
                id: outcome.taskId,
                status: "blocked",
              })
              const reviewerOutputPreview = reviewerOutput.slice(0, 500)
              const reviewBlockReason = reviewerOutputPreview
                ? `Reviewer finished without merging after ${maxReviewerRetries} attempts. Moving to blocked for triage.\n\n**Reviewer's last output:**\n> ${reviewerOutputPreview}`
                : `Reviewer finished without merging after ${maxReviewerRetries} attempts (no output captured). Moving to blocked for triage.`
              await convex.mutation(api.comments.create, {
                taskId: outcome.taskId,
                author: "work-loop",
                authorType: "coordinator",
                content: reviewBlockReason,
                type: "status_change",
              })
              console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to blocked (reviewer didn't merge after ${maxReviewerRetries} attempts)`)
              await logRun(convex, {
                projectId: project.id,
                cycle,
                phase: "cleanup",
                action: "task_blocked",
                taskId: outcome.taskId,
                details: { reason: "reviewer_no_merge_max_retries", role: outcome.role, retryCount, maxRetries: maxReviewerRetries },
              })
            }
          }
        }
        // Case 3: Non-reviewer agent finished while task is in_review → block (security guard)
        // Only reviewers should be able to move tasks from in_review to done.
        // If conflict_resolver, pm, or other non-dev roles finish here, something went wrong.
        // Dev finishing in in_review is the happy path (created PR, moved to in_review, done).
        else if (currentStatus === "in_review" && outcome.role !== "dev") {
          await convex.mutation(api.tasks.move, {
            id: outcome.taskId,
            status: "blocked",
          })
          const guardReason = `Agent with role '${outcome.role}' finished while task was in_review. ` +
            `Only reviewer agents can transition tasks from in_review. Moving to blocked for triage.`
          await convex.mutation(api.comments.create, {
            taskId: outcome.taskId,
            author: "work-loop",
            authorType: "coordinator",
            content: guardReason,
            type: "status_change",
          })
          console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} moved to blocked (non-reviewer '${outcome.role}' finished in in_review)`)
          await logRun(convex, {
            projectId: project.id,
            cycle,
            phase: "cleanup",
            action: "task_blocked",
            taskId: outcome.taskId,
            details: { reason: "non_reviewer_finished_in_review", role: outcome.role },
          })
        }
        // Case 4: Task already done/blocked → agent signaled correctly, no action
        else if (currentStatus === "done") {
          console.log(`[WorkLoop] Task ${outcome.taskId.slice(0, 8)} status is done — agent signaled correctly`)
          // Reviewer merged the PR and marked done. Trigger self-deploy if clutch project.
          const donePrNumber = task.task.pr_number
          if (donePrNumber) {
            await handleSelfDeploy(project, donePrNumber)
          }
        } else {
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
