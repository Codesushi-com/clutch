import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import * as fs from "fs"
import * as path from "path"

const ROLES_DIR = path.join(process.cwd(), "roles")
// v2 Work Loop roles - aligns with TaskRole type in lib/types/index.ts
const ROLES = ["pm", "dev", "research", "reviewer", "conflict_resolver"]

/**
 * POST /api/prompts/seed
 * Seeds the promptVersions table with v1 of all role templates from disk.
 * Idempotent - skips roles that already have versions.
 */
export async function POST(_request: NextRequest) {
  try {
    const convex = getConvexClient()
    const results: Array<{ role: string; status: string; version?: number; error?: string }> = []

    for (const role of ROLES) {
      try {
        // Check if this role already has versions (idempotency)
        const hasVersions = await convex.query(api.promptVersions.hasVersionsForRole, { role })

        if (hasVersions) {
          results.push({ role, status: "skipped", error: "already has versions" })
          continue
        }

        // Read the role template from disk
        const filePath = path.join(ROLES_DIR, `${role}.md`)

        if (!fs.existsSync(filePath)) {
          results.push({ role, status: "error", error: `file not found: ${filePath}` })
          continue
        }

        const content = fs.readFileSync(filePath, "utf-8")

        if (!content.trim()) {
          results.push({ role, status: "error", error: "file is empty" })
          continue
        }

        // Create v1 in Convex
        const version = await convex.mutation(api.promptVersions.create, {
          role,
          content,
          created_by: "seed",
        })

        results.push({ role, status: "created", version: version.version })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({ role, status: "error", error: message })
      }
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
    console.error("[Prompts Seed API] Error:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to seed prompts", details: message },
      { status: 500 }
    )
  }
}
