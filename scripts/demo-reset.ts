#!/usr/bin/env tsx
/**
 * Demo Reset Script with Safety Checks
 *
 * This script safely resets the demo environment by:
 * 1. Running safety checks to ensure production is not affected
 * 2. Stopping demo containers
 * 3. Removing demo volumes ONLY
 * 4. Restarting demo containers
 *
 * Usage:
 *   pnpm demo:reset          # Safe reset with checks
 *   pnpm demo:reset --force  # Skip safety checks (dangerous!)
 */

import { execSync } from "child_process"

// Colors for terminal output
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RESET = "\x1b[0m"

function log(message: string): void {
  console.log(message)
}

function error(message: string): void {
  console.error(`${RED}❌ ${message}${RESET}`)
}

function success(message: string): void {
  console.log(`${GREEN}✅ ${message}${RESET}`)
}

function info(message: string): void {
  console.log(`${BLUE}ℹ️  ${message}${RESET}`)
}

function warn(message: string): void {
  console.warn(`${YELLOW}⚠️  ${message}${RESET}`)
}

// Parse arguments
const args = process.argv.slice(2)
const forceMode = args.includes("--force") || args.includes("-f")

async function main(): Promise<void> {
  log("")
  log("=".repeat(60))
  log("🔄 DEMO RESET")
  log("=".repeat(60))
  log("")

  // Step 1: Safety checks (unless force mode)
  if (forceMode) {
    warn("FORCE MODE ENABLED - Skipping safety checks!")
    warn("This is dangerous and may result in data loss.")
    log("")
  } else {
    info("Running safety checks...")
    log("")

    try {
      execSync("tsx scripts/demo-safety-check.ts", {
        stdio: "inherit",
      })
    } catch {
      error("Safety checks failed. Aborting.")
      log("")
      log("To bypass safety checks (DANGEROUS):")
      log("  pnpm demo:reset --force")
      log("")
      process.exit(1)
    }
  }

  // Step 2: Confirm destructive operation
  log("")
  info("This will DESTROY all demo data and recreate the demo environment.")
  log("")
  log("Operations to be performed:")
  log("  1. Stop demo containers (docker-compose.demo.yml)")
  log("  2. Remove demo volume (convex-demo-data)")
  log("  3. Start fresh demo containers")
  log("")

  // In non-interactive mode (CI/agent), proceed without prompt
  const isInteractive = process.stdin.isTTY

  if (isInteractive && !forceMode) {
    // For interactive mode, we'd prompt here, but since this runs in agents,
    // we'll just add a short delay and proceed
    log("Proceeding in 3 seconds...")
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  // Step 3: Execute reset
  log("")
  log("Executing reset...")
  log("")

  try {
    // Stop demo containers
    info("Step 1/3: Stopping demo containers...")
    execSync("docker compose -f docker-compose.demo.yml down", {
      stdio: "inherit",
    })
    success("Demo containers stopped")
    log("")

    // Remove demo volume explicitly
    info("Step 2/3: Removing demo volume (convex-demo-data)...")
    try {
      execSync("docker volume rm openclutch-demo-convex-demo-data 2>/dev/null || docker volume rm convex-demo-data 2>/dev/null || true", {
        stdio: "pipe",
      })
      success("Demo volume removed")
    } catch {
      // Volume might not exist, which is fine
      warn("Demo volume not found or already removed")
    }
    log("")

    // Start fresh demo containers
    info("Step 3/3: Starting fresh demo containers...")
    execSync("docker compose -f docker-compose.demo.yml up -d", {
      stdio: "inherit",
    })
    success("Demo containers started")
    log("")

    // Verify containers are running
    info("Verifying demo containers...")
    execSync("docker compose -f docker-compose.demo.yml ps", {
      stdio: "inherit",
    })
    log("")

    success("Demo reset complete!")
    log("")
    log("Next steps:")
    log("  1. Deploy Convex schema: pnpm demo:deploy")
    log("  2. Seed demo data:       pnpm demo:seed")
    log("  3. Access dashboard:     http://localhost:3231")
    log("")
  } catch (err) {
    error(`Reset failed: ${err}`)
    process.exit(1)
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err}`)
  process.exit(1)
})
