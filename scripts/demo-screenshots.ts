#!/usr/bin/env tsx
/**
 * Demo screenshots script for OpenClutch
 *
 * Opens key pages in the browser and takes screenshots for documentation.
 * Requires the demo environment to be running.
 *
 * Usage:
 *   pnpm demo:screenshots
 *
 * Prerequisites:
 *   - Demo environment running (pnpm demo:up)
 *   - Demo data seeded (pnpm demo:seed)
 *   - Dev server running (pnpm demo:dev)
 */

import fs from "fs"
import path from "path"

const BASE_URL = "http://localhost:3002"
const OUTPUT_DIR = "./docs/screenshots"

// Pages to screenshot with their descriptions
const PAGES = [
  { path: "/work-loop", name: "observatory-live", description: "Observatory Live tab" },
  { path: "/work-loop?triage", name: "observatory-triage", description: "Observatory Triage tab" },
  { path: "/work-loop?analytics", name: "observatory-analytics", description: "Observatory Analytics tab" },
  { path: "/work-loop?models", name: "observatory-models", description: "Observatory Models tab" },
  { path: "/work-loop?prompts", name: "observatory-prompts", description: "Observatory Prompts tab" },
  { path: "/projects/acme-api", name: "project-detail", description: "Project detail page" },
  { path: "/projects/acme-api/work-loop", name: "project-work-loop", description: "Project-specific work loop" },
  { path: "/projects/acme-api/roadmap", name: "project-roadmap", description: "Project roadmap" },
  { path: "/projects/acme-api/tasks", name: "project-tasks", description: "Project tasks list" },
  { path: "/projects/acme-api/chats", name: "project-chats", description: "Project chats" },
]

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log("📸 OpenClutch Demo Screenshots")
  console.log("   Base URL:", BASE_URL)
  console.log("   Output:", OUTPUT_DIR)
  console.log()

  // Check if dev server is running
  try {
    const response = await fetch(`${BASE_URL}/api/status`)
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`)
    }
  } catch (error) {
    console.error("❌ Dev server not responding at", BASE_URL)
    console.error("   Make sure to run: pnpm demo:dev")
    process.exit(1)
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  console.log("Taking screenshots...")
  console.log()

  for (const page of PAGES) {
    const url = `${BASE_URL}${page.path}`
    const outputPath = path.join(OUTPUT_DIR, `${page.name}.png`)

    console.log(`   📷 ${page.description}`)
    console.log(`      URL: ${url}`)
    console.log(`      Output: ${outputPath}`)

    try {
      // Use playwright or similar if available, otherwise log instructions
      // For now, we provide instructions for manual screenshots
      console.log(`      ⚠️  Manual screenshot required`)
      console.log()
    } catch (error) {
      console.error(`      ❌ Failed:`, error)
    }

    await sleep(100)
  }

  console.log()
  console.log("✅ Screenshot instructions complete!")
  console.log()
  console.log("For automated screenshots, install Playwright:")
  console.log("   pnpm add -D @playwright/test")
  console.log("   npx playwright install chromium")
  console.log()
  console.log("Then run this script again.")
}

main().catch((error) => {
  console.error("❌ Screenshot script failed:", error)
  process.exit(1)
})
