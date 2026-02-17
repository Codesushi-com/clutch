import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import * as fs from "fs"
import * as path from "path"

const ROLES_DIR = path.join(process.cwd(), "roles")

/**
 * POST /api/prompts/migrate-reviewer-conflict
 * 
 * Phase 4b Migration: Migrate Reviewer and ConflictResolver roles to Handlebars DB templates.
 * 
 * Creates v2 for reviewer and conflict_resolver roles with Handlebars template support.
 * Idempotent - skips if v2 already exists.
 */
export async function POST(_request: NextRequest) {
  try {
    const convex = getConvexClient()
    const results: Array<{
      role: string
      status: string
      version?: number
      previousVersion?: number
      error?: string
    }> = []

    // Migration for reviewer role
    try {
      // Check current version
      const latestReviewer = await convex.query(api.promptVersions.getLatest, { role: "reviewer" })
      const previousReviewerVersion = latestReviewer?.version ?? 0

      if (latestReviewer && latestReviewer.version >= 2) {
        results.push({
          role: "reviewer",
          status: "skipped",
          previousVersion: previousReviewerVersion,
          error: "v2 or higher already exists",
        })
      } else {
        // Read v2 template
        const reviewerV2Path = path.join(ROLES_DIR, "reviewer-v2-template.md")
        if (!fs.existsSync(reviewerV2Path)) {
          results.push({
            role: "reviewer",
            status: "error",
            previousVersion: previousReviewerVersion,
            error: `v2 template file not found: ${reviewerV2Path}`,
          })
        } else {
          const reviewerContent = fs.readFileSync(reviewerV2Path, "utf-8")
          
          if (!reviewerContent.trim()) {
            results.push({
              role: "reviewer",
              status: "error",
              previousVersion: previousReviewerVersion,
              error: "v2 template file is empty",
            })
          } else {
            // Create v2 in Convex
            const reviewerVersion = await convex.mutation(api.promptVersions.create, {
              role: "reviewer",
              content: reviewerContent,
              created_by: "migration-phase-4b",
              change_summary: "Phase 4b: Migrated to Handlebars template with variables (taskId, taskTitle, taskDescription, projectSlug, repoDir, worktreeDir, prNumber, comments, branchName)",
            })

            results.push({
              role: "reviewer",
              status: "created",
              version: reviewerVersion.version,
              previousVersion: previousReviewerVersion,
            })
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ role: "reviewer", status: "error", error: message })
    }

    // Migration for conflict_resolver role
    try {
      // Check current version
      const latestConflictResolver = await convex.query(api.promptVersions.getLatest, { role: "conflict_resolver" })
      const previousConflictResolverVersion = latestConflictResolver?.version ?? 0

      if (latestConflictResolver && latestConflictResolver.version >= 2) {
        results.push({
          role: "conflict_resolver",
          status: "skipped",
          previousVersion: previousConflictResolverVersion,
          error: "v2 or higher already exists",
        })
      } else {
        // Read v2 template
        const conflictResolverV2Path = path.join(ROLES_DIR, "conflict_resolver-v2-template.md")
        if (!fs.existsSync(conflictResolverV2Path)) {
          results.push({
            role: "conflict_resolver",
            status: "error",
            previousVersion: previousConflictResolverVersion,
            error: `v2 template file not found: ${conflictResolverV2Path}`,
          })
        } else {
          const conflictResolverContent = fs.readFileSync(conflictResolverV2Path, "utf-8")
          
          if (!conflictResolverContent.trim()) {
            results.push({
              role: "conflict_resolver",
              status: "error",
              previousVersion: previousConflictResolverVersion,
              error: "v2 template file is empty",
            })
          } else {
            // Create v2 in Convex
            const conflictResolverVersion = await convex.mutation(api.promptVersions.create, {
              role: "conflict_resolver",
              content: conflictResolverContent,
              created_by: "migration-phase-4b",
              change_summary: "Phase 4b: Migrated to Handlebars template with variables (taskId, taskTitle, taskDescription, projectSlug, repoDir, worktreeDir, prNumber, branchName, comments)",
            })

            results.push({
              role: "conflict_resolver",
              status: "created",
              version: conflictResolverVersion.version,
              previousVersion: previousConflictResolverVersion,
            })
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ role: "conflict_resolver", status: "error", error: message })
    }

    const created = results.filter((r) => r.status === "created").length
    const skipped = results.filter((r) => r.status === "skipped").length
    const errors = results.filter((r) => r.status === "error").length

    return NextResponse.json({
      success: errors === 0,
      summary: { created, skipped, errors },
      results,
    })
  } catch (error) {
    console.error("[Prompts Migration Phase 4b API] Error:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to migrate reviewer/conflict_resolver prompts", details: message },
      { status: 500 }
    )
  }
}
