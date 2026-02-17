import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import * as fs from "fs"
import * as path from "path"

/**
 * POST /api/prompts/migrate-pm-research-v2
 * 
 * Migration script for Phase 4a: Migrate PM and Research role prompts from TypeScript to DB templates.
 * 
 * Creates v2 prompt versions for both roles with Handlebars templates containing:
 * - SOUL template content (identity, responsibilities, quality bar)
 * - Task context with template variables ({{taskId}}, {{taskTitle}}, etc.)
 * - Conditional sections for images, signal responses, and comments
 * 
 * This version uses Handlebars syntax for variable substitution, enabling
 * the prompt to be fully driven from the database without hardcoded TypeScript.
 * 
 * Feature flag: PROMPT_TEMPLATE_ENGINE env var controls whether to use templates
 */
export async function POST(_request: NextRequest) {
  try {
    const convex = getConvexClient()
    const results: Array<{ role: string; status: string; version?: number; error?: string }> = []

    // Migrate PM role
    try {
      const pmTemplatePath = path.join(process.cwd(), "roles", "pm-v2-template.md")
      
      if (!fs.existsSync(pmTemplatePath)) {
        results.push({ role: "pm", status: "error", error: "Template file not found" })
      } else {
        const pmContent = fs.readFileSync(pmTemplatePath, "utf-8")

        if (!pmContent.trim()) {
          results.push({ role: "pm", status: "error", error: "Template file is empty" })
        } else {
          // Validate the template
          const pmValidation = await convex.query(api.promptVersions.validate, {
            role: "pm",
            content: pmContent,
          })

          if (!pmValidation.valid) {
            results.push({ 
              role: "pm", 
              status: "error", 
              error: `Validation failed: ${pmValidation.syntaxErrors.join(", ")} ${pmValidation.undefinedVariables.join(", ")}` 
            })
          } else {
            // Check if v2 already exists
            const existingPmVersions = await convex.query(api.promptVersions.listByRole, {
              role: "pm",
            })

            const existingPmV2 = existingPmVersions.find((v: { version: number }) => v.version === 2)
            if (existingPmV2) {
              results.push({ role: "pm", status: "skipped", version: 2 })
            } else {
              // Get v1 for parent reference
              const pmV1 = existingPmVersions.find((v: { version: number }) => v.version === 1)

              // Create v2
              const pmVersion = await convex.mutation(api.promptVersions.create, {
                role: "pm",
                content: pmContent,
                created_by: "migration-phase-4a",
                change_summary: "Phase 4a: Migrated PM role from hardcoded TypeScript to Handlebars DB template. Includes SOUL content + task context with variable substitution, conditional images and signal responses.",
                parent_version_id: pmV1?.id,
              })

              results.push({ role: "pm", status: "created", version: pmVersion.version })
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ role: "pm", status: "error", error: message })
    }

    // Migrate Research role
    try {
      const researchTemplatePath = path.join(process.cwd(), "roles", "research-v2-template.md")
      
      if (!fs.existsSync(researchTemplatePath)) {
        results.push({ role: "research", status: "error", error: "Template file not found" })
      } else {
        const researchContent = fs.readFileSync(researchTemplatePath, "utf-8")

        if (!researchContent.trim()) {
          results.push({ role: "research", status: "error", error: "Template file is empty" })
        } else {
          // Validate the template
          const researchValidation = await convex.query(api.promptVersions.validate, {
            role: "research",
            content: researchContent,
          })

          if (!researchValidation.valid) {
            results.push({ 
              role: "research", 
              status: "error", 
              error: `Validation failed: ${researchValidation.syntaxErrors.join(", ")} ${researchValidation.undefinedVariables.join(", ")}` 
            })
          } else {
            // Check if v2 already exists
            const existingResearchVersions = await convex.query(api.promptVersions.listByRole, {
              role: "research",
            })

            const existingResearchV2 = existingResearchVersions.find((v: { version: number }) => v.version === 2)
            if (existingResearchV2) {
              results.push({ role: "research", status: "skipped", version: 2 })
            } else {
              // Get v1 for parent reference
              const researchV1 = existingResearchVersions.find((v: { version: number }) => v.version === 1)

              // Create v2
              const researchVersion = await convex.mutation(api.promptVersions.create, {
                role: "research",
                content: researchContent,
                created_by: "migration-phase-4a",
                change_summary: "Phase 4a: Migrated Research role from hardcoded TypeScript to Handlebars DB template. Includes SOUL content + task context with variable substitution and conditional comments.",
                parent_version_id: researchV1?.id,
              })

              results.push({ role: "research", status: "created", version: researchVersion.version })
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ role: "research", status: "error", error: message })
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
    console.error("[Migrate PM/Research V2 API] Error:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: "Failed to migrate PM/Research v2", details: message },
      { status: 500 }
    )
  }
}
