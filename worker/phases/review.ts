import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { AgentManager } from "../agent-manager"
import type { WorkLoopConfig } from "../config"
import type { Task } from "../../lib/types"

// ============================================
// Types
// ============================================

type WorkLoopPhase = "cleanup" | "review" | "work" | "idle" | "error"

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
 * 1. Query tasks with status=in_review from Trap API
 * 2. For each task:
 *    a. Derive branch name: fix/<task-id-prefix> (first 8 chars)
 *    b. Check if open PR exists via gh CLI
 *    c. Check if reviewer child already running
 *    d. If PR exists and no reviewer running → spawn reviewer
 * 3. Build reviewer prompt using role template
 * 4. Spawn via ChildManager with role="reviewer", model="sonnet"
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
  const { convex, agents, project } = ctx

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

  // Check if this task was recently reaped as a reviewer — don't re-spawn same role
  if (agents.isRecentlyReaped(task.id, "reviewer")) {
    return {
      spawned: false,
      details: {
        reason: "recently_reaped",
        taskId: task.id,
        role: "reviewer",
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

  // Spawn reviewer via gateway RPC
  // Use actual branch name for worktree path (handles descriptive suffixes)
  const worktreesBase = `${project.local_path}-worktrees`
  const worktreePath = `${worktreesBase}/${branchName}`
  const prompt = buildReviewerPrompt(task, pr, branchName, worktreePath, project)

  try {
    const handle = await agents.spawn({
      taskId: task.id,
      projectId: project.id,
      role: "reviewer",
      message: prompt,
      model: "sonnet",
      timeoutSeconds: 600,
    })

    // Write reviewer agent info to task (same pattern as work phase)
    try {
      await convex.mutation(api.tasks.update, {
        id: task.id,
        session_id: handle.sessionKey,
      })
      await convex.mutation(api.tasks.updateAgentActivity, {
        updates: [{
          task_id: task.id,
          agent_session_key: handle.sessionKey,
          agent_model: "sonnet",
          agent_started_at: handle.spawnedAt,
          agent_last_active_at: handle.spawnedAt,
        }],
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

// ============================================
// Prompt Builder
// ============================================

function buildReviewerPrompt(
  task: Task,
  pr: PRInfo,
  branchName: string,
  worktreePath: string,
  project: ProjectInfo
): string {
  return `# Code Reviewer

## Identity
You are a Code Reviewer responsible for verifying pull requests before merge. You check code quality, correctness, test coverage, and adherence to project standards.

## Responsibilities
- Review PR diffs for correctness and code quality
- Verify TypeScript compiles cleanly (\`pnpm typecheck\`)
- Verify linting passes (\`pnpm lint\`)
- Check for coding standard violations (see AGENTS.md)
- Ensure the PR addresses the ticket requirements
- Merge clean PRs or leave actionable feedback

## Current Task

**Ticket ID:** ${task.id}
**Ticket Title:** ${task.title}

${task.description ? `**Description:**\n${task.description}\n` : ""}

**PR Number:** #${pr.number}
**PR Title:** ${pr.title}
**Branch:** ${branchName}
**Worktree Path:** ${worktreePath}

## Review Steps

1. **Read the ticket description above** — understand what was asked
2. **Review the diff:**\n   \`\`\`bash\n   gh pr diff ${pr.number}\n   \`\`\`
3. **Check types in worktree:**\n   \`\`\`bash\n   cd ${worktreePath} && pnpm typecheck\n   \`\`\`
4. **Check lint in worktree:**\n   \`\`\`bash\n   cd ${worktreePath} && pnpm lint\n   \`\`\`
5. **Verify scope** — changes should match ticket, no unrelated modifications
6. **Check coding standards** — module imports, error handling, no inline imports
7. **You do NOT have browser access.** If UI changes need visual verification, note it in your review comment

## After Review

### If PR is clean (all checks pass):

1. **Check if PR touches Convex files (before merging):**\n   \`\`\`bash\n   gh pr diff ${pr.number} --name-only | grep '^convex/' > /tmp/convex_files_${pr.number}.txt\n   if [ -s /tmp/convex_files_${pr.number}.txt ]; then\n     echo "Convex files will be changed:"\n     cat /tmp/convex_files_${pr.number}.txt\n   fi\n   \`\`\`

2. **Approve and merge:**\n   \`\`\`bash\n   gh pr merge ${pr.number} --squash --delete-branch\n   \`\`\`

3. **Deploy Convex if needed:**\n   Check if the project has a convex/ directory and the PR touched Convex files.\n   \`\`\`bash\n   if [ -d "${project.local_path}/convex" ] && [ -s /tmp/convex_files_${pr.number}.txt ]; then\n     echo "Deploying Convex changes..."\n     cd ${project.local_path} && npx convex deploy --yes 2>&1 | tee /tmp/convex_deploy_${pr.number}.log\n     DEPLOY_EXIT=${'$'}{PIPESTATUS[0]}\n     if [ $DEPLOY_EXIT -ne 0 ]; then\n       echo "ERROR: Convex deploy failed with exit code $DEPLOY_EXIT"\n       # Create high-priority alert ticket for deploy failure\n       curl -X POST http://localhost:3002/api/tasks \\\n         -H 'Content-Type: application/json' \\\n         -d "{\\"project_id\\": \\"${project.id}\\", \\"title\\": \\"URGENT: Convex deploy failed after merging PR #${pr.number}\\", \\"description\\": \\"Convex deployment failed after merging PR #${pr.number} for task ${task.id}.\\n\\nDeploy output:\\n\\"$(cat /tmp/convex_deploy_${pr.number}.log | sed 's/"/\\\\"/g')\\"\\", \\"priority\\": \\"urgent\\", \\"status\\": \\"backlog\\"}"\n       # Still mark original task as done since PR was merged\n     else\n       echo "Convex deploy successful"\n     fi\n   fi\n   \`\`\`

4. **Update ticket status to done:**\n   \`\`\`bash\n   curl -X PATCH http://localhost:3002/api/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status": "done"}'\n   \`\`\`

5. **Clean up worktree:**\n   \`\`\`bash\n   cd ${project.local_path} && git worktree remove ${worktreePath}\n   \`\`\`

### If PR needs changes:
1. **Leave specific, actionable feedback:**\n   \`\`\`bash\n   gh pr comment ${pr.number} --body "Your detailed feedback here..."\n   \`\`\`
2. **Move ticket back to ready:**\n   \`\`\`bash\n   curl -X PATCH http://localhost:3002/api/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status": "ready"}'\n   \`\`\`

## Important Notes

- **DO NOT merge** if any check fails
- Be thorough but constructive in feedback
- If you find architectural concerns or security issues, escalate rather than merging
- If the PR has UI changes that need visual verification, note "needs browser QA" in your review

Start by reading \`\${project.local_path}/AGENTS.md\` to understand project conventions, then proceed with the review.
`
}
