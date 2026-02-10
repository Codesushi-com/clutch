/**
 * Self-Deploy for OpenClutch
 *
 * After a PR merges to the clutch project, pull latest code,
 * rebuild, and restart services. This keeps the running server
 * in sync with main without manual intervention.
 *
 * Only runs for the clutch project (self-referential deploy).
 * Other projects don't need a server rebuild.
 */

import { execFileSync } from "node:child_process"

// The clutch project slug — only this project triggers a self-deploy
const SELF_PROJECT_SLUG = "clutch"

// Use process.cwd() — the worker always runs from the repo root
const CLUTCH_REPO = process.cwd()

interface ProjectInfo {
  id: string
  slug: string
  local_path?: string | null
}

export interface SelfDeployResult {
  triggered: boolean
  success: boolean
  steps: string[]
  error?: string
}

/**
 * Pull latest main, rebuild, and restart OpenClutch services.
 *
 * Only triggers for the clutch project. No-ops for other projects.
 * Runs: git pull --ff-only → pnpm install → pnpm build → systemctl restart
 *
 * The work loop process itself gets restarted as part of this,
 * so this should be the LAST thing called in the post-merge flow.
 */
export async function handleSelfDeploy(
  project: ProjectInfo,
  prNumber: number,
): Promise<SelfDeployResult> {
  if (project.slug !== SELF_PROJECT_SLUG) {
    return { triggered: false, success: true, steps: [] }
  }

  console.log(`[SelfDeploy] PR #${prNumber} merged to ${project.slug} — starting self-deploy`)

  const steps: string[] = []

  try {
    // Step 1: Pull latest from origin/main
    console.log("[SelfDeploy] Pulling latest...")
    execFileSync("git", ["pull", "--ff-only", "origin", "main"], {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: CLUTCH_REPO,
    })
    steps.push("git pull ✓")

    // Step 2: Install deps (in case lockfile changed)
    console.log("[SelfDeploy] Installing dependencies...")
    execFileSync("pnpm", ["install", "--frozen-lockfile"], {
      encoding: "utf-8",
      timeout: 120_000,
      cwd: CLUTCH_REPO,
    })
    steps.push("pnpm install ✓")

    // Step 3: Build
    console.log("[SelfDeploy] Building...")
    execFileSync("pnpm", ["build"], {
      encoding: "utf-8",
      timeout: 120_000,
      cwd: CLUTCH_REPO,
    })
    steps.push("pnpm build ✓")

    // Step 4: Restart all services
    // Note: this restarts the loop process too, so the current cycle ends here.
    console.log("[SelfDeploy] Restarting services...")
    execFileSync("systemctl", [
      "--user", "restart",
      "clutch-server",
      "clutch-loop",
      "clutch-bridge",
      "clutch-session-watcher",
    ], {
      encoding: "utf-8",
      timeout: 30_000,
    })
    steps.push("services restarted ✓")

    console.log(`[SelfDeploy] Self-deploy complete for PR #${prNumber}`)
    return { triggered: true, success: true, steps }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[SelfDeploy] Failed: ${message}`)
    steps.push(`FAILED: ${message.slice(0, 200)}`)
    return { triggered: true, success: false, steps, error: message }
  }
}
