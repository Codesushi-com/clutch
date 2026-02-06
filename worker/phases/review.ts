import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"
import type { ChildManager } from "../children"
import type { SessionsPoller } from "../sessions"
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

interface ReviewContext {
  convex: ConvexHttpClient
  children: ChildManager
  sessions: SessionsPoller
  config: WorkLoopConfig
  cycle: number
  projectId: string
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
  const { convex, children, config, cycle, projectId } = ctx

  // Log phase start
  await ctx.log({
    projectId,
    cycle,
    phase: "review",
    action: "phase_start",
  })

  let spawnedCount = 0
  let skippedCount = 0

  // Get tasks in review status for this project
  const tasks = await getInReviewTasks(convex, projectId)

  await ctx.log({
    projectId,
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
      projectId,
      cycle,
      phase: "review",
      action: result.spawned ? "reviewer_spawned" : "reviewer_skipped",
      taskId: task.id,
      details: result.details,
    })

    // Check global limits after each spawn
    const globalActive = children.activeCount()
    if (globalActive >= config.maxAgentsGlobal) {
      await ctx.log({
        projectId,
        cycle,
        phase: "review",
        action: "limit_reached",
        details: { reason: "global_max_agents", limit: config.maxAgentsGlobal },
      })
      break
    }

    // Check project limits
    const projectActive = children.activeCount(projectId)
    if (projectActive >= config.maxAgentsPerProject) {
      await ctx.log({
        projectId,
        cycle,
        phase: "review",
        action: "limit_reached",
        details: { reason: "project_max_agents", limit: config.maxAgentsPerProject },
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
  const { children, projectId } = ctx

  // Derive branch name from task ID (first 8 chars)
  const branchName = `fix/${task.id.slice(0, 8)}`

  // Check if reviewer already running for this task
  const existingChild = children.get(task.id)
  if (existingChild && existingChild.exitCode === null) {
    return {
      spawned: false,
      details: {
        reason: "reviewer_already_running",
        taskId: task.id,
        sessionKey: existingChild.sessionKey,
      },
    }
  }

  // Check for open PR on this branch
  const pr = findOpenPR(branchName)

  if (!pr) {
    return {
      spawned: false,
      details: {
        reason: "no_open_pr",
        taskId: task.id,
        branch: branchName,
      },
    }
  }

  // Spawn reviewer
  const worktreePath = `/home/dan/src/trap-worktrees/${branchName}`
  const prompt = buildReviewerPrompt(task, pr, branchName, worktreePath)

  const child = children.spawn({
    taskId: task.id,
    projectId,
    role: "reviewer",
    message: prompt,
    model: "sonnet",
    label: `reviewer:${task.id.slice(0, 8)}`,
  })

  return {
    spawned: true,
    details: {
      taskId: task.id,
      prNumber: pr.number,
      prTitle: pr.title,
      branch: branchName,
      sessionKey: child.sessionKey,
    },
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

function findOpenPR(branchName: string): PRInfo | null {
  try {
    const result = execFileSync(
      "gh",
      ["pr", "list", "--state", "open", "--head", branchName, "--json", "number,title"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: "/home/dan/src/trap", // Run from main repo
      }
    )

    const prs = JSON.parse(result) as PRInfo[]

    if (prs.length === 0) {
      return null
    }

    return prs[0] // Return first matching PR
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[ReviewPhase] Failed to check PR for branch ${branchName}: ${message}`)
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
  worktreePath: string
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
7. **Browser QA for UI changes** — If this is a UI change, you MUST:\n   - Start the dev server if needed (or use an existing one)\n   - Open the relevant page in a browser\n   - Take a screenshot to verify the feature works\n   - Include the screenshot in your review

## After Review

### If PR is clean (all checks pass):
1. **Approve and merge:**\n   \`\`\`bash\n   gh pr merge ${pr.number} --squash --delete-branch\n   \`\`\`
2. **Update ticket status to done:**\n   \`\`\`bash\n   curl -X PATCH http://localhost:3002/api/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status": "done"}'\n   \`\`\`
3. **Clean up worktree:**\n   \`\`\`bash\n   cd /home/dan/src/trap && git worktree remove ${worktreePath}\n   \`\`\`

### If PR needs changes:
1. **Leave specific, actionable feedback:**\n   \`\`\`bash\n   gh pr comment ${pr.number} --body "Your detailed feedback here..."\n   \`\`\`
2. **Move ticket back to ready:**\n   \`\`\`bash\n   curl -X PATCH http://localhost:3002/api/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status": "ready"}'\n   \`\`\`

## Important Notes

- **DO NOT merge** if any check fails
- **DO NOT mark done** based only on code compilation — browser test required for UI changes
- Be thorough but constructive in feedback
- If you find architectural concerns or security issues, escalate rather than merging

Start by reading \`/home/dan/src/trap/AGENTS.md\` to understand project conventions, then proceed with the review.
`
}
