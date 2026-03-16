/**
 * Shared GitHub PR utilities for work loop phases
 *
 * This module contains functions for interacting with GitHub PRs
 * that are used by multiple phases (review, cleanup, etc.)
 */

import { execFileSync } from "node:child_process"

// ============================================
// GitHub CLI Command
// ============================================

/**
 * The gh CLI command to use for all GitHub operations.
 * Uses gh-as-ada (GitHub App auth) when available, falls back to bare gh.
 */
export const GH_CMD = process.env.GH_CMD ?? "gh-as-ada"

// ============================================
// Types
// ============================================

export interface ProjectInfo {
  id: string
  slug: string
  name: string
  work_loop_enabled: boolean
  work_loop_max_agents?: number | null
  local_path?: string | null
  github_repo?: string | null
  role_model_overrides?: Record<string, string> | null
}

export interface PRInfo {
  number: number
  title: string
}

// ============================================
// PR Status Checks
// ============================================

/**
 * Check if a PR has been merged (not just closed).
 * Used to auto-close tasks whose PR was merged but task status wasn't updated.
 *
 * A PR is considered merged if and only if mergedAt is not null.
 * This correctly distinguishes between:
 * - Merged PRs: state="MERGED", mergedAt="timestamp" 
 * - Closed without merge: state="CLOSED", mergedAt=null
 *
 * @param prNumber - The PR number to check
 * @param project - The project containing the repo
 * @returns true if the PR is merged, false otherwise
 */
export function isPRMerged(prNumber: number, project: ProjectInfo): boolean {
  try {
    const result = execFileSync(
      GH_CMD,
      ["pr", "view", String(prNumber), "--json", "state,mergedAt"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!,
      }
    )

    const pr = JSON.parse(result) as { state: string; mergedAt: string | null }
    // A PR is merged if and only if mergedAt is not null
    return pr.mergedAt !== null
  } catch {
    return false
  }
}

/**
 * Check if multiple PRs are merged in a batch.
 * More efficient than calling isPRMerged multiple times when
 * checking many PRs in sequence.
 *
 * @param prNumbers - Array of PR numbers to check
 * @param project - The project containing the repo
 * @returns Map of PR number to merge status
 */
export function checkPRsMergedBatch(
  prNumbers: number[],
  project: ProjectInfo
): Map<number, boolean> {
  const results = new Map<number, boolean>()

  for (const prNumber of prNumbers) {
    const isMerged = isPRMerged(prNumber, project)
    results.set(prNumber, isMerged)
  }

  return results
}

// ============================================
// PR Lookup
// ============================================

/**
 * Find an open PR by branch name.
 * Matches by exact name or prefix (e.g. fix/abcd1234 matches fix/abcd1234-some-description)
 *
 * @param branchName - The branch name to search for
 * @param project - The project containing the repo
 * @returns PR info if found, null otherwise
 */
export function findOpenPR(branchName: string, project: ProjectInfo): PRInfo | null {
  try {
    // Use --json with all open PRs and filter by prefix, since dev agents
    // may append descriptive suffixes to branch names
    const result = execFileSync(
      GH_CMD,
      ["pr", "list", "--state", "open", "--json", "number,title,headRefName"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        cwd: project.local_path!,
      }
    )

    const prs = JSON.parse(result) as (PRInfo & { headRefName: string })[]

    // Match by exact name or prefix
    const match = prs.find(
      (pr) => pr.headRefName === branchName || pr.headRefName.startsWith(branchName)
    )

    if (!match) {
      return null
    }

    return match
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[GitHubUtils] Failed to check PR for branch ${branchName}: ${message}`)
    return null
  }
}

/**
 * Get PR info by PR number (direct lookup)
 *
 * @param prNumber - The PR number to look up
 * @param project - The project containing the repo
 * @returns PR info if found and open, null otherwise
 */
export function getPRByNumber(prNumber: number, project: ProjectInfo): PRInfo | null {
  try {
    const result = execFileSync(
      GH_CMD,
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
    console.warn(`[GitHubUtils] Failed to get PR #${prNumber}: ${message}`)
    return null
  }
}

/**
 * Get full PR details including merge status.
 *
 * @param prNumber - The PR number to look up
 * @param project - The project containing the repo
 * @returns PR details including state and mergedAt
 */
export function getPRDetails(
  prNumber: number,
  project: ProjectInfo
): { state: string; mergedAt: string | null } | null {
  try {
    const result = execFileSync(
      GH_CMD,
      ["pr", "view", String(prNumber), "--json", "state,mergedAt"],
      { encoding: "utf-8", timeout: 10_000, cwd: project.local_path! }
    )
    return JSON.parse(result) as { state: string; mergedAt: string | null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[GitHubUtils] Failed to get PR #${prNumber} details: ${message}`)
    return null
  }
}

/**
 * Check if a PR was closed without merging.
 * Used to identify tasks that should be moved back to ready instead of done.
 *
 * @param prNumber - The PR number to check
 * @param project - The project containing the repo
 * @returns true if the PR is closed but not merged, false otherwise
 */
export function isPRClosedWithoutMerge(prNumber: number, project: ProjectInfo): boolean {
  const prDetails = getPRDetails(prNumber, project)
  if (!prDetails) {
    return false
  }
  
  // PR is closed without merge if state is CLOSED and mergedAt is null
  return prDetails.state === "CLOSED" && prDetails.mergedAt === null
}
