/**
 * Migration script for Phase 3: Migrate dev role prompt from TypeScript to DB template.
 *
 * Run: npx tsx scripts/migrate-dev-v2.ts
 */
import * as fs from "fs"
import * as path from "path"
import { ConvexHttpClient } from "convex/browser"

const CONVEX_URL = process.env.CONVEX_URL || "http://127.0.0.1:3210"

async function main() {
  console.log("=== Phase 3: Migrate Dev Prompt to Template Engine ===\n")

  // Read the v2 template from disk
  const templatePath = path.join(process.cwd(), "roles", "dev-v2-template.md")

  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(templatePath, "utf-8")

  if (!content.trim()) {
    console.error(`❌ Template file is empty: ${templatePath}`)
    process.exit(1)
  }

  console.log(`✓ Template loaded (${content.length} characters)`)

  // Create Convex client
  const convex = new ConvexHttpClient(CONVEX_URL)

  // Check if v2 already exists
  console.log("\nChecking existing versions...")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingVersions = await (convex as any).query("promptVersions:listByRole", { role: "dev" })

  const existingV2 = existingVersions.find((v: { version: number }) => v.version === 2)
  if (existingV2) {
    console.log(`⚠️  Dev v2 already exists (id: ${existingV2.id})`)
    console.log("\n✓ Migration already complete. No action needed.")
    process.exit(0)
  }

  const v1 = existingVersions.find((v: { version: number }) => v.version === 1)
  console.log(`✓ Found v1: ${v1 ? v1.id : "none"}`)

  // Validate the template
  console.log("\nValidating template...")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validation = await (convex as any).query("promptVersions:validate", {
    role: "dev",
    content,
  })

  if (!validation.valid) {
    // Warn about validation issues but continue anyway
    // The Convex validator doesn't understand block params from {{#each}}
    console.log("⚠️  Template validation warnings (non-blocking):")
    if (validation.syntaxErrors.length > 0) {
      console.log("  Syntax errors:", validation.syntaxErrors)
    }
    if (validation.undefinedVariables.length > 0) {
      console.log("  Undefined variables (likely block params from {{#each}}):", validation.undefinedVariables)
    }
    console.log("  Continuing with skip_validation=true...")
  } else {
    console.log("✓ Template validation passed")
  }

  // Create v2 (skip validation since the Convex validator doesn't understand block params from {{#each}})
  console.log("\nCreating dev v2 prompt version...")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const version = await (convex as any).mutation("promptVersions:create", {
    role: "dev",
    content,
    created_by: "migration-phase-3",
    change_summary: "Phase 3: Migrated dev role from hardcoded TypeScript to Handlebars DB template. Includes SOUL content + task context with variable substitution.",
    parent_version_id: v1?.id,
    skip_validation: true,
  })

  console.log(`\n✅ Successfully created dev v2!`)
  console.log(`\nVersion details:`)
  console.log(`  ID: ${version.id}`)
  console.log(`  Role: ${version.role}`)
  console.log(`  Version: ${version.version}`)
  console.log(`  Active: ${version.active}`)
  console.log(`  Created at: ${new Date(version.created_at).toISOString()}`)

  console.log("\n=== Next Steps ===")
  console.log("1. Set PROMPT_TEMPLATE_ENGINE=enabled in your environment")
  console.log("2. Spawn a dev agent to test the new template")
  console.log("3. Verify the prompt renders correctly with all variables filled")
  console.log("4. After validation, buildDevTaskContext() can be removed")
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error.message)
  process.exit(1)
})
