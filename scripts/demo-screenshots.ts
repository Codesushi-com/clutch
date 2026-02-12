#!/usr/bin/env tsx
/**
 * Demo screenshots script for OpenClutch
 *
 * Uses Playwright to capture high-quality screenshots of the demo environment.
 *
 * Usage:
 *   pnpm demo:screenshots
 *
 * Prerequisites:
 *   - Demo environment running (pnpm demo:up)
 *   - Demo data seeded (pnpm demo:seed)
 *   - Dev server running on port 3003 (pnpm dev with PORT=3003)
 */

import { chromium, type Browser, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

// Safety check: verify we're not targeting production
function verifyDemoEnvironment(): void {
  // Check for safety bypass
  if (process.env.DEMO_UNSAFE_BYPASS === "true") {
    console.warn("⚠️  DEMO_UNSAFE_BYPASS is set - skipping environment verification")
    return
  }

  // Verify demo:screenshots is running against demo environment
  const isDemoPort = BASE_URL.includes(":3003") || BASE_URL.includes(":3002")
  if (!isDemoPort) {
    console.error("❌ ERROR: demo:screenshots must target demo/dev server, not production")
    console.error(`   Current BASE_URL: ${BASE_URL}`)
    console.error("   Expected: http://localhost:3003 (demo server)")
    process.exit(1)
  }

  console.log("✅ Demo environment verified")
}

const BASE_URL = "http://localhost:3002"
const OUTPUT_DIR = "./docs"
const MAX_WAIT_MS = 15000
const WARNING_THRESHOLD_MS = 10000

// Screenshots needed for README
const SCREENSHOTS = [
  {
    file: "observatory-screenshot.png",
    path: "/work-loop",
    description: "Observatory Live tab with multiple projects, active agents, recent activity",
    waitFor: 8000,
    fullPage: false,
    // Wait for either active agent cards OR the "No active agents" message (both indicate data loaded)
    waitForSelector: '[data-testid="agent-card"], .rounded-lg.border, .text-center.py-8.text-muted-foreground',
  },
  {
    file: "board-screenshot.png",
    path: "/projects/acme-api/board",
    description: "Kanban board with tasks in Backlog, Ready, In Progress, In Review, Done",
    waitFor: 10000,
    fullPage: false,
    // Wait for task cards or column content (not loading state)
    waitForSelector: '[data-testid="task-card"], [data-rfd-droppable-id]',
    // Additional check: ensure we're not seeing "Loading..."
    waitForFunction: () => {
      const loadingText = document.querySelector('.text-\\[var\\(--text-secondary\\)\\]')
      return !loadingText || loadingText.textContent !== 'Loading...'
    },
  },
  {
    file: "chat-screenshot.png",
    path: "/projects/acme-api/chat",
    description: "Chat page with agent conversation messages",
    waitFor: 10000,
    fullPage: false,
    // Wait for chat list items or the "Select a chat" state (both indicate data loaded)
    waitForSelector: '[data-testid="chat-list-item"], .chat-list-item, [role="listitem"], .text-center .MessageSquare',
  },
  {
    file: "work-loop-screenshot.png",
    path: "/work-loop?tab=analytics",
    description: "Analytics tab with cost/performance charts",
    waitFor: 8000,
    fullPage: false,
    // Wait for chart containers to be present
    waitForSelector: '.recharts-wrapper, [class*="chart"], canvas',
  },
  {
    file: "roadmap-screenshot.png",
    path: "/projects/acme-api/roadmap",
    description: "Roadmap with phases, requirements, coverage",
    waitFor: 10000,
    fullPage: false,
    // Wait for phase cards OR the "No Roadmap Yet" state (both indicate data loaded)
    waitForSelector: '[class*="phase"], [data-testid="phase-card"], .rounded-lg.border, .text-center.py-12',
    // Additional check: ensure loading spinner is gone
    waitForFunction: () => {
      return document.querySelector('.animate-spin') === null
    },
  },
  {
    file: "sessions-screenshot.png",
    path: "/sessions",
    description: "Sessions list with token counts, costs, models, durations",
    waitFor: 8000,
    fullPage: false,
    // Wait for session list items or empty state
    waitForSelector: '[data-testid="session-row"], [class*="session"], table tbody tr, .text-center',
  },
  {
    file: "prompt-lab-screenshot.png",
    path: "/prompts",
    description: "Prompt Lab with role templates, versions, amendments",
    waitFor: 8000,
    fullPage: false,
    // Wait for role sidebar or version list (not loading spinner)
    waitForSelector: '[data-testid="role-sidebar"], [class*="role"], [class*="version"], [class*="VersionList"]',
    // Additional check: ensure loading spinner is gone
    waitForFunction: () => {
      return document.querySelector('.animate-spin') === null
    },
  },
]

async function hideScrollbars(page: Page) {
  await page.addStyleTag({
    content: `
      ::-webkit-scrollbar { display: none !important; }
      body { scrollbar-width: none !important; }
    `,
  })
}

async function optimizePng(filePath: string) {
  try {
    // Try pngquant first, then optipng as fallback
    try {
      execSync(`pngquant --force --quality=80-95 --output "${filePath}" "${filePath}"`, {
        stdio: "ignore",
      })
    } catch {
      execSync(`optipng -o2 "${filePath}"`, { stdio: "ignore" })
    }
  } catch {
    // Optimization failed, but file still exists
  }
}

/**
 * Calculate remaining time within global timeout budget
 */
function getRemainingTime(startTime: number, budgetMs: number): number {
  return Math.max(0, budgetMs - (Date.now() - startTime))
}

/**
 * Wait for page to be ready for screenshot
 * Uses multiple strategies racing against each other:
 * 1. Wait for specific selector if provided
 * 2. Wait for custom function condition if provided
 * 3. Fallback to minimum wait time
 *
 * All strategies share a global timeout budget (MAX_WAIT_MS) to prevent
 * excessive wait times when multiple strategies are configured.
 */
async function waitForPageReady(
  page: Page,
  config: typeof SCREENSHOTS[0]
): Promise<{ success: boolean; durationMs: number; warning?: string }> {
  const startTime = Date.now()
  let warning: string | undefined

  try {
    // Build array of wait promises that will race against each other
    const waitPromises: Array<Promise<{ strategy: string; durationMs: number }>> = []

    // Strategy 1: Wait for specific selector
    if (config.waitForSelector) {
      waitPromises.push(
        (async () => {
          const timeout = getRemainingTime(startTime, MAX_WAIT_MS)
          await page.waitForSelector(config.waitForSelector!, { timeout })
          return { strategy: "selector", durationMs: Date.now() - startTime }
        })()
      )
    }

    // Strategy 2: Wait for custom function condition
    if (config.waitForFunction) {
      waitPromises.push(
        (async () => {
          const timeout = getRemainingTime(startTime, MAX_WAIT_MS)
          await page.waitForFunction(config.waitForFunction!, { timeout })
          return { strategy: "function", durationMs: Date.now() - startTime }
        })()
      )
    }

    // Strategy 3: Minimum wait time (always included as a safety minimum)
    const minimumWaitMs = config.waitFor ?? 5000
    waitPromises.push(
      (async () => {
        const timeout = getRemainingTime(startTime, MAX_WAIT_MS)
        const waitTime = Math.min(minimumWaitMs, timeout)
        if (waitTime > 0) {
          await page.waitForTimeout(waitTime)
        }
        return { strategy: "minimum", durationMs: Date.now() - startTime }
      })()
    )

    // Race all strategies - whichever completes first wins
    const result = await Promise.race(waitPromises)

    // Log which strategy won (for debugging)
    if (result.strategy !== "minimum") {
      console.log(`      ✓ Ready via ${result.strategy} strategy`)
    } else {
      console.log(`      ⏱️  Used minimum wait time`)
    }

    const duration = Date.now() - startTime
    if (duration > WARNING_THRESHOLD_MS) {
      warning = `Page took ${duration}ms to load (threshold: ${WARNING_THRESHOLD_MS}ms)`
    }
    return { success: true, durationMs: duration, warning }

  } catch (error) {
    const duration = Date.now() - startTime
    return {
      success: false,
      durationMs: duration,
      warning: `Failed to wait for page ready after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Verify that the page is not showing a loading state
 */
async function verifyNoLoadingState(page: Page): Promise<boolean> {
  const loadingText = await page.locator('text=Loading...').count()
  const loadingBoardText = await page.locator('text=Loading board...').count()
  const loadingMessagesText = await page.locator('text=Loading messages...').count()
  
  if (loadingText > 0 || loadingBoardText > 0 || loadingMessagesText > 0) {
    console.log(`      ⚠️  Page still showing loading text`)
    return false
  }

  // Check for spinners
  const spinners = await page.locator('.animate-spin').count()
  if (spinners > 0) {
    console.log(`      ⚠️  Page still showing ${spinners} loading spinner(s)`)
    return false
  }

  return true
}

async function takeScreenshot(browser: Browser, config: typeof SCREENSHOTS[0]) {
  const url = `${BASE_URL}${config.path}`
  const outputPath = path.join(OUTPUT_DIR, config.file)

  console.log(`   📷 ${config.description}`)
  console.log(`      URL: ${url}`)

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })

  const page = await context.newPage()

  try {
    // Navigate to page
    const navStart = Date.now()
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
    console.log(`      🌐 Navigation: ${Date.now() - navStart}ms`)

    // Wait for page to be ready
    const waitResult = await waitForPageReady(page, config)
    console.log(`      ⏱️  Wait time: ${waitResult.durationMs}ms`)
    
    if (waitResult.warning) {
      console.log(`      ⚠️  ${waitResult.warning}`)
    }

    // For chat page, click into the first chat to show actual conversation
    if (config.path.includes("/chat")) {
      try {
        // Wait a bit more for chat list to be clickable
        await page.waitForTimeout(1000)
        
        // Click the first chat in the list
        const chatItem = await page.locator('[data-testid="chat-list-item"], .chat-list-item, [role="listitem"]').first()
        if (await chatItem.isVisible().catch(() => false)) {
          await chatItem.click()
          // Wait for chat content to load
          await page.waitForTimeout(2000)
          
          // Wait for messages to appear
          await page.waitForSelector('[class*="message"], .MessageBubble, [data-testid="message"]', { timeout: 5000 })
            .catch(() => console.log(`      ⚠️  No messages found after clicking chat`))
        }
      } catch {
        // If selectors don't work, try generic approach
        const firstRow = await page.locator('a[href*="/chat/"], [class*="chat"]').first()
        if (await firstRow.isVisible().catch(() => false)) {
          await firstRow.click()
          await page.waitForTimeout(2000)
        }
      }
    }

    // Verify no loading state
    const isReady = await verifyNoLoadingState(page)
    if (!isReady) {
      console.log(`      ⏱️  Extra wait for loading state to clear...`)
      await page.waitForTimeout(3000)
      
      // Final check
      const finalCheck = await verifyNoLoadingState(page)
      if (!finalCheck) {
        console.log(`      ⚠️  WARNING: Page may still be in loading state`)
      }
    }

    // Hide scrollbars for clean screenshot
    await hideScrollbars(page)

    // Additional wait for any animations to complete
    await page.waitForTimeout(500)

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: config.fullPage,
      type: "png",
    })

    // Optimize the PNG
    await optimizePng(outputPath)

    const stats = fs.statSync(outputPath)
    const sizeKB = Math.round(stats.size / 1024)

    // Warn if screenshot is suspiciously small (likely still loading)
    if (sizeKB < 20) {
      console.log(`      ⚠️  WARNING: Screenshot is very small (${sizeKB}KB) - may be incomplete`)
    }

    console.log(`      ✓ Saved (${sizeKB}KB)`)
  } catch (error) {
    console.error(`      ✗ Failed:`, error instanceof Error ? error.message : error)
    throw error
  } finally {
    await context.close()
  }
}

async function main() {
  console.log("📸 OpenClutch Demo Screenshots")
  console.log("   Base URL:", BASE_URL)
  console.log("   Output:", OUTPUT_DIR)
  console.log()

  // Verify demo environment before proceeding
  verifyDemoEnvironment()
  console.log()

  // Check if dev server is running
  try {
    const response = await fetch(BASE_URL)
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`)
    }
  } catch {
    console.error("❌ Dev server not responding at", BASE_URL)
    console.error("   Make sure to run: pnpm demo:dev")
    process.exit(1)
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Launch browser
  console.log("Launching browser...")
  const browser = await chromium.launch({ headless: true })

  console.log("Taking screenshots...")
  console.log()

  let successCount = 0
  let failCount = 0
  const warnings: string[] = []

  for (const screenshot of SCREENSHOTS) {
    try {
      await takeScreenshot(browser, screenshot)
      successCount++
    } catch (error) {
      failCount++
      warnings.push(`${screenshot.file}: ${error instanceof Error ? error.message : String(error)}`)
    }
    console.log()
  }

  await browser.close()

  console.log("✅ Screenshot capture complete!")
  console.log(`   Success: ${successCount}, Failed: ${failCount}`)

  if (warnings.length > 0) {
    console.log()
    console.log("⚠️  Warnings:")
    for (const warning of warnings) {
      console.log(`   - ${warning}`)
    }
  }

  if (failCount > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("❌ Screenshot script failed:", error)
  process.exit(1)
})
