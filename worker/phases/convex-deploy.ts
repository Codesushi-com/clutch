/**
 * Convex Deployment Utilities
 *
 * Handles automatic deployment of Convex schema/functions after PR merges.
 */

import { execFileSync } from "node:child_process"
import type { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"

// ============================================
// Types
// ============================================

export interface DeployResult {
  success: boolean
  touchedConvex: boolean
  output?: string
  error?: string
}

interface ProjectInfo {
  id: string
  slug: string
  local_path?: string | null
  github_repo?: string | null
}

// ============================================
// PR Diff Analysis
// ============================================

/**
 * Check if a PR touches files in the convex/ directory.
 *
 * Uses `gh pr diff` to get the diff and checks for paths starting with "convex/".
 */
export function prTouchesConvex(
  prNumber: number,
  project: ProjectInfo
): boolean {
  if (!project.local_path) {
    console.warn(`[ConvexDeploy] Project ${project.slug} has no local_path`)
    return false
  }

  try {
    // Get the PR diff
    const diffOutput = execFileSync(
      "gh",
      ["pr", "diff", String(prNumber)],
      {
        encoding: "utf-8",
        timeout: 30_000,
        cwd: project.local_path,
      }
    )

    // Check if any line starts with "diff --git" and contains "convex/"
    // or check for "+++ b/convex/" or "--- a/convex/"
    const lines = diffOutput.split("\n")
    for (const line of lines) {
      // Match diff headers that touch convex/ directory
      if (
        line.startsWith("diff --git") &&
        (line.includes("/convex/") || line.includes(" b/convex/"))
      ) {
        return true
      }
      // Also match the +++ and --- lines for file changes
      if (
        (line.startsWith("+++ b/convex/") || line.startsWith("--- a/convex/"))
      ) {
        return true
      }
    }

    return false
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[ConvexDeploy] Failed to check PR diff for #${prNumber}: ${message}`
    )
    return false
  }
}

/**
 * Check if files in convex/ directory were modified between two commits.
 *
 * Used when we know the before/after state (e.g., in worktree context).
 */
export function commitsTouchConvex(
  baseRef: string,
  headRef: string,
  project: ProjectInfo
): boolean {
  if (!project.local_path) {
    return false
  }

  try {
    const diffOutput = execFileSync(
      "git",
      ["diff", "--name-only", `${baseRef}...${headRef}`],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path,
      }
    )

    const files = diffOutput.split("\n").filter((f) => f.trim().length > 0)
    return files.some((file) => file.startsWith("convex/"))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[ConvexDeploy] Failed to check commits ${baseRef}..${headRef}: ${message}`
    )
    return false
  }
}

// ============================================
// Deployment
// ============================================

/**
 * Run `npx convex deploy --yes` in the project directory.
 *
 * This deploys schema and function changes to the Convex backend.
 */
export function runConvexDeploy(project: ProjectInfo): {
  success: boolean
  output: string
} {
  if (!project.local_path) {
    return {
      success: false,
      output: "Project has no local_path configured",
    }
  }

  console.log(`[ConvexDeploy] Running 'npx convex deploy --yes' for ${project.slug}`)

  try {
    const output = execFileSync(
      "npx",
      ["convex", "deploy", "--yes"],
      {
        encoding: "utf-8",
        timeout: 120_000, // 2 minutes should be plenty for deploy
        cwd: project.local_path,
        env: {
          ...process.env,
          // Ensure we have access to any needed env vars
          CONVEX_URL: process.env.CONVEX_URL,
        },
      }
    )

    console.log(`[ConvexDeploy] Deploy succeeded for ${project.slug}`)
    return { success: true, output }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ConvexDeploy] Deploy failed for ${project.slug}: ${message}`)
    return { success: false, output: message }
  }
}

// ============================================
// Post-Merge Handler
// ============================================

/**
 * Handle post-merge Convex deployment.
 *
 * This is the main entry point called when a PR merge is detected.
 * It:
 * 1. Checks if the PR touched convex/ directory
 * 2. If yes, runs `npx convex deploy --yes`
 * 3. Logs the result
 * 4. If deploy fails, creates a high-priority alert ticket
 */
export async function handlePostMergeDeploy(
  convex: ConvexHttpClient,
  prNumber: number,
  project: ProjectInfo,
  taskId?: string
): Promise<DeployResult> {
  console.log(
    `[ConvexDeploy] Checking PR #${prNumber} for convex/ changes in ${project.slug}`
  )

  // Step 1: Check if PR touches convex/
  const touchedConvex = prTouchesConvex(prNumber, project)

  if (!touchedConvex) {
    console.log(
      `[ConvexDeploy] PR #${prNumber} does not touch convex/, skipping deploy`
    )
    return { success: true, touchedConvex: false }
  }

  console.log(
    `[ConvexDeploy] PR #${prNumber} touches convex/, running deploy`
  )

  // Step 2: Run the deploy
  const deployResult = runConvexDeploy(project)

  // Step 3: Log the result to work loop runs
  await convex.mutation(api.workLoop.logRun, {
    project_id: project.id,
    cycle: 0, // Will be set by caller if available
    phase: "review",
    action: deployResult.success ? "convex_deploy_success" : "convex_deploy_failure",
    task_id: taskId,
    details: JSON.stringify({
      pr_number: prNumber,
      touched_convex: true,
      output: deployResult.output.slice(0, 1000), // Truncate if needed
    }),
  })

  // Step 4: If deploy failed, create a high-priority ticket
  if (!deployResult.success) {
    await createDeployFailureTicket(
      convex,
      prNumber,
      project,
      deployResult.output,
      taskId
    )
  }

  return {
    success: deployResult.success,
    touchedConvex: true,
    output: deployResult.output,
  }
}

/**
 * Create a high-priority ticket when Convex deployment fails.
 *
 * This ensures deploy failures are not silently ignored.
 */
async function createDeployFailureTicket(
  convex: ConvexHttpClient,
  prNumber: number,
  project: ProjectInfo,
  errorOutput: string,
  relatedTaskId?: string
): Promise<void> {
  const title = `URGENT: Convex deploy failed after PR #${prNumber} merge`

  const description = `## Auto-Generated Alert

Convex deployment failed after merging PR #${prNumber} in project **${project.slug}**.

### Error Output
\`\`\`
${errorOutput.slice(0, 2000)}
\`\`\`

### Related Task
${relatedTaskId ? `Task ID: ${relatedTaskId}` : "No related task recorded"}

### Required Action
1. Check the Convex deployment logs
2. Fix any schema or function errors
3. Run \`npx convex deploy --yes\` manually
4. Verify the web UI loads correctly

### Why This Matters
The web UI may crash because the client expects schema/functions that don't exist on the backend yet.
`

  try {
    await convex.mutation(api.tasks.create, {
      project_id: project.id,
      title,
      description,
      priority: "urgent",
      role: "dev",
      tags: "convex-deploy-failure,auto-generated",
    })

    console.log(
      `[ConvexDeploy] Created urgent ticket for deploy failure (PR #${prNumber})`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[ConvexDeploy] Failed to create failure ticket: ${message}`
    )
    // Non-fatal — we've already logged the deploy failure
  }
}
