import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import * as fs from "fs"
import * as path from "path"

/**
 * POST /api/prompts/migrate-dev-v2
 * 
 * Migration script for Phase 3: Migrate dev role prompt from TypeScript to DB template.
 * 
 * Creates dev v2 prompt version with Handlebars template containing:
 * - SOUL template content (identity, responsibilities, quality bar)
 * - Task context with template variables ({{taskId}}, {{taskTitle}}, etc.)
 * - Worktree setup instructions
 * - Pre-commit rules
 * - PR workflow steps
 * 
 * This version uses Handlebars syntax for variable substitution, enabling
 * the prompt to be fully driven from the database without hardcoded TypeScript.
 * 
 * Feature flag: PROMPT_TEMPLATE_ENGINE env var controls whether to use templates
 */
export async function POST(_request: NextRequest) {
  try {
    const convex = getConvexClient()

    // Read the v2 template from disk
    const templatePath = path.join(process.cwd(), "roles", "dev-v2-template.md")
    
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "Template file not found", path: templatePath },
        { status: 404 }
      )
    }

    const content = fs.readFileSync(templatePath, "utf-8")

    if (!content.trim()) {
      return NextResponse.json(
        { error: "Template file is empty", path: templatePath },
        { status: 400 }
      )
    }

    // Validate the template before saving
    const validation = await convex.query(api.promptVersions.validate, {
      role: "dev",
      content,
    })

    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: "Template validation failed", 
          validation,
          path: templatePath 
        },
        { status: 400 }
      )
    }

    // Check if v2 already exists
    const existingVersions = await convex.query(api.promptVersions.listByRole, {
      role: "dev",
    })

    const existingV2 = existingVersions.find(v => v.version === 2)
    if (existingV2) {
      return NextResponse.json({
        success: true,
        status: "skipped",
        message: "Dev v2 already exists",
        version: existingV2,
      })
    }

    // Get the v1 version to use as parent
    const v1 = existingVersions.find(v => v.version === 1)

    // Create v2 in Convex (automatically becomes active)
    const version = await convex.mutation(api.promptVersions.create, {
      role: "dev",
      content,
      created_by: "migration-phase-3",
      change_summary: "Phase 3: Migrated dev role from hardcoded TypeScript to Handlebars DB template. Includes SOUL content + task context with variable substitution.",
      parent_version_id: v1?.id,
    })

    return NextResponse.json({
      success: true,
      status: "created",
      message: "Dev v2 template created and activated",
      version: {
        id: version.id,
        role: version.role,
        version: version.version,
        active: version.active,
        created_at: version.created_at,
      },
      validation: {
        valid: validation.valid,
        undefinedVariables: validation.undefinedVariables,
      },
    })
  } catch (error) {
    console.error("[Migrate Dev V2 API] Error:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to migrate dev v2", details: message },
      { status: 500 }
    )
  }
}
