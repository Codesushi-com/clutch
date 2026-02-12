#!/usr/bin/env tsx
/**
 * Demo Safety Check Script
 *
 * This script validates that demo operations will NOT affect production.
 * It MUST be run before any destructive demo operation (reset, clean).
 *
 * Safety checks:
 * 1. Verify production containers are NOT running on ports 3210/3211
 * 2. Verify we're not targeting production .env.local
 * 3. Verify demo compose file is being used
 *
 * Exit codes:
 *   0 - Safe to proceed
 *   1 - Unsafe condition detected
 */

import { execSync } from "child_process"
import { existsSync } from "fs"
import { resolve } from "path"

// Production ports that must NOT be in use during demo operations
const PRODUCTION_PORTS = [3210, 3211]

// Demo ports that are safe to use
const DEMO_PORTS = [3230, 3231]

// Production container names that must NOT be running
const PRODUCTION_CONTAINERS = ["openclutch-convex", "openclutch-app"]

// Production volume name that must NOT be removed
const PRODUCTION_VOLUME = "convex-data"

// Colors for terminal output
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

function log(message: string): void {
  console.log(message)
}

function error(message: string): void {
  console.error(`${RED}❌ ERROR: ${message}${RESET}`)
}

function warn(message: string): void {
  console.warn(`${YELLOW}⚠️  WARNING: ${message}${RESET}`)
}

function success(message: string): void {
  console.log(`${GREEN}✅ ${message}${RESET}`)
}

/**
 * Check if production containers are running on their designated ports
 */
function checkProductionContainers(): boolean {
  let isSafe = true

  log("Checking for production containers...")

  for (const port of PRODUCTION_PORTS) {
    try {
      // Check if anything is listening on the production port
      const result = execSync(`lsof -Pi :${port} -sTCP:LISTEN -t 2>/dev/null || echo ""`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim()

      if (result) {
        error(`Something is already listening on production port ${port}`)
        try {
          const processInfo = execSync(`lsof -Pi :${port} -sTCP:LISTEN 2>/dev/null || echo ""`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
          }).trim()
          log(`  Process info:\n${processInfo}`)
        } catch {
          // Ignore errors getting process info
        }
        isSafe = false
      }
    } catch {
      // lsof not available or other error, try alternative check
      try {
        execSync(`nc -z localhost ${port} 2>/dev/null`, { stdio: "ignore" })
        error(`Port ${port} appears to be in use (connection succeeded)`)
        isSafe = false
      } catch {
        // Port is not in use, which is what we want
      }
    }
  }

  // Also check for known production container names
  try {
    const psOutput = execSync("docker ps --format '{{.Names}}' 2>/dev/null || echo \"\"", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()

    const runningContainers = psOutput.split("\n").filter(Boolean)

    for (const containerName of PRODUCTION_CONTAINERS) {
      if (runningContainers.some((name) => name.includes(containerName))) {
        error(`Production container '${containerName}' is currently running`)
        isSafe = false
      }
    }
  } catch {
    // Docker not available, skip this check
    warn("Could not check running Docker containers")
  }

  if (isSafe) {
    success("No production containers detected on ports 3210/3211")
  }

  return isSafe
}

/**
 * Check if demo environment file exists and is valid
 */
function checkDemoEnvironment(): boolean {
  log("Checking demo environment configuration...")

  const demoEnvPath = resolve(process.cwd(), ".env.demo.local")
  const productionEnvPath = resolve(process.cwd(), ".env.local")

  // Check that demo env exists
  if (!existsSync(demoEnvPath)) {
    error("Demo environment file not found: .env.demo.local")
    log("  Run: cp .env.demo .env.demo.local")
    return false
  }

  // Read demo env and verify it points to demo ports
  try {
    const demoEnvContent = execSync(`cat "${demoEnvPath}"`, { encoding: "utf-8" })

    // Check that it uses demo ports, not production ports
    const hasProductionPort3210 = demoEnvContent.includes(":3210") && !demoEnvContent.includes("NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211")
    const hasProductionPort3211 = demoEnvContent.match(/:\/\/[^\s]*:3211/) && !demoEnvContent.includes("NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3231")

    if (hasProductionPort3210 || hasProductionPort3211) {
      error("Demo environment file appears to contain production port references")
      log("  Please verify .env.demo.local points to ports 3230/3231")
      return false
    }

    success("Demo environment file exists and appears to use demo ports")
  } catch {
    warn("Could not read demo environment file for verification")
  }

  // Ensure production .env.local exists but warn about it
  if (existsSync(productionEnvPath)) {
    log("  Note: .env.local exists (this is expected)")
  }

  return true
}

/**
 * Check that docker-compose.demo.yml exists and is valid
 */
function checkDemoComposeFile(): boolean {
  log("Checking demo compose file...")

  const composePath = resolve(process.cwd(), "docker-compose.demo.yml")

  if (!existsSync(composePath)) {
    error("Demo compose file not found: docker-compose.demo.yml")
    return false
  }

  // Verify it uses demo ports
  try {
    const composeContent = execSync(`cat "${composePath}"`, { encoding: "utf-8" })

    // Check for hardcoded demo ports
    const hasDemoPort3230 = composeContent.includes('"3230:3210"')
    const hasDemoPort3231 = composeContent.includes('"3231:3211"')
    const hasDemoVolume = composeContent.includes("convex-demo-data:")

    if (!hasDemoPort3230 || !hasDemoPort3231) {
      error("Demo compose file does not have hardcoded demo ports (3230/3231)")
      return false
    }

    if (!hasDemoVolume) {
      error("Demo compose file does not use demo-specific volume (convex-demo-data)")
      return false
    }

    success("Demo compose file exists with correct ports and volume")
  } catch {
    warn("Could not verify demo compose file contents")
  }

  return true
}

/**
 * Main safety check function
 */
function runSafetyChecks(): boolean {
  log("")
  log("=".repeat(60))
  log("🔒 DEMO SAFETY CHECKS")
  log("=".repeat(60))
  log("")

  const checks = [checkProductionContainers(), checkDemoEnvironment(), checkDemoComposeFile()]

  log("")
  log("=".repeat(60))

  if (checks.every((c) => c)) {
    success("All safety checks passed - safe to proceed with demo operation")
    log("=".repeat(60))
    log("")
    return true
  } else {
    error("Safety check FAILED - demo operation aborted")
    log("")
    log("If you're certain production is not running, you can bypass with:")
    log("  DEMO_UNSAFE_BYPASS=true pnpm demo:reset")
    log("")
    log("⚠️  WARNING: Bypassing safety checks may result in DATA LOSS")
    log("=".repeat(60))
    log("")
    return false
  }
}

// Check for bypass flag
if (process.env.DEMO_UNSAFE_BYPASS === "true") {
  warn("SAFETY CHECKS BYPASSED - Proceeding at your own risk!")
  process.exit(0)
}

// Run checks
const isSafe = runSafetyChecks()
process.exit(isSafe ? 0 : 1)
