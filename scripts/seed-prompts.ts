#!/usr/bin/env tsx
/**
 * Seed Prompts Script
 *
 * Manually seed prompt versions from roles/*.md files.
 * Idempotent - skips roles that already have versions.
 *
 * Usage:
 *   pnpm seed:prompts
 *   # or
 *   npx tsx scripts/seed-prompts.ts
 */

const API_URL = process.env.CLUTCH_API_URL ?? "http://localhost:3002"

async function seedPrompts(): Promise<void> {
  console.log("Seeding prompts...")
  console.log(`API URL: ${API_URL}`)

  try {
    const res = await fetch(`${API_URL}/api/prompts/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`API error: ${res.status} ${error}`)
    }

    const data = await res.json()

    console.log("\nResults:")
    console.log(`  Created: ${data.summary.created}`)
    console.log(`  Skipped: ${data.summary.skipped}`)
    console.log(`  Errors: ${data.summary.errors}`)

    if (data.results.length > 0) {
      console.log("\nDetails:")
      for (const result of data.results) {
        const icon = result.status === "created" ? "✓" : result.status === "skipped" ? "○" : "✗"
        console.log(`  ${icon} ${result.role}: ${result.status}${result.version ? ` (v${result.version})` : ""}${result.error ? ` - ${result.error}` : ""}`)
      }
    }

    if (data.summary.errors > 0) {
      process.exit(1)
    }

    console.log("\n✓ Prompt seeding complete")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\n✗ Failed to seed prompts: ${message}`)
    process.exit(1)
  }
}

seedPrompts()
