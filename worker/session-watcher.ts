/**
 * Session Watcher Worker
 *
 * Standalone process that watches OpenClaw session JSONL files
 * and syncs session metadata to Convex in real-time.
 *
 * Run separately from Next.js to avoid blocking the event loop:
 *   npx tsx worker/session-watcher.ts
 */

import { ConvexHttpClient } from "convex/browser"
import { watch, type FSWatcher } from "node:fs"
import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { api } from "../convex/_generated/api"
import { sessionFileReader, type SessionFileInfo } from "./session-file-reader"

// ============================================
// Configuration
// ============================================

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"
const SESSIONS_JSON_PATH = join(
  homedir(),
  ".openclaw",
  "agents",
  "main",
  "sessions",
  "sessions.json"
)

// Debounce interval for batching Convex writes (ms)
const FLUSH_INTERVAL_MS = 3000

// Max age for watching completed sessions (1 hour)
const COMPLETED_SESSION_MAX_AGE_MS = 60 * 60 * 1000

// Stale threshold (5 minutes of inactivity)
const STALE_THRESHOLD_MS = 5 * 60 * 1000

// Max watched files limit
const MAX_WATCHED_FILES = 100

// ============================================
// Types
// ============================================

interface SessionsJsonEntry {
  sessionId: string
  sessionFile?: string
  updatedAt?: number
}

interface SessionsJson {
  [sessionKey: string]: SessionsJsonEntry
}

interface WatchedSession {
  sessionKey: string
  sessionId: string
  filePath: string
  watcher: FSWatcher
  lastModified: number
  status: "active" | "completed" | "stale"
}

// ============================================
// Session Type Detection
// ============================================

type SessionType = "main" | "chat" | "agent" | "cron"

/**
 * Detect session type from session key pattern.
 */
function detectSessionType(sessionKey: string): SessionType {
  // agent:main:main → type main
  if (sessionKey === "agent:main:main") {
    return "main"
  }

  // agent:main:clutch:{slug}:{chatId} → type chat
  if (sessionKey.match(/^agent:main:clutch:[^:]+:/)) {
    return "chat"
  }

  // agent:main:cron:*:clutch-{taskIdPrefix} → type agent (work loop agent)
  if (sessionKey.match(/^agent:main:cron:.*:clutch-/)) {
    return "agent"
  }

  // agent:main:cron:*:clutch-pr-review-* → type agent (reviewer)
  if (sessionKey.match(/^agent:main:cron:.*:clutch-pr-review-/)) {
    return "agent"
  }

  // Other cron patterns → type cron
  if (sessionKey.startsWith("agent:main:cron:")) {
    return "cron"
  }

  // Default to cron for unknown patterns
  return "cron"
}

/**
 * Extract project slug from session key (for chat/agent types).
 */
function extractProjectSlug(sessionKey: string): string | undefined {
  // agent:main:clutch:{slug}:{chatId}
  const match = sessionKey.match(/^agent:main:clutch:([^:]+):/)
  if (match) {
    return match[1]
  }
  return undefined
}

/**
 * Extract task ID from session key (for agent types).
 */
function extractTaskId(sessionKey: string): string | undefined {
  // agent:main:cron:*:clutch-{taskId}
  const match = sessionKey.match(/:clutch-([a-f0-9-]+)$/)
  if (match) {
    return match[1]
  }

  // agent:main:cron:*:clutch-pr-review-{taskId}
  const reviewMatch = sessionKey.match(/:clutch-pr-review-([a-f0-9-]+)$/)
  if (reviewMatch) {
    return reviewMatch[1]
  }

  return undefined
}

// ============================================
// Status Detection
// ============================================

type SessionStatus = "active" | "idle" | "completed" | "stale"

/**
 * Determine session status from file info.
 */
function determineStatus(info: SessionFileInfo | null): SessionStatus {
  if (!info) {
    return "idle"
  }

  // stopReason === "stop" or terminal error → completed
  if (info.isDone) {
    return "completed"
  }

  // File mtime > 5 min ago and not completed → stale
  if (info.isStale) {
    return "stale"
  }

  // File mtime recent → active
  return "active"
}

// ============================================
// Session Watcher
// ============================================

class SessionWatcher {
  private convex: ConvexHttpClient
  private watchedSessions: Map<string, WatchedSession> = new Map()
  private sessionsJsonWatcher: FSWatcher | null = null
  private dirtySessions: Set<string> = new Set()
  private flushTimer: NodeJS.Timeout | null = null
  private running = false
  private sessionsJsonMtime = 0

  constructor() {
    this.convex = new ConvexHttpClient(CONVEX_URL)
  }

  /**
   * Start the session watcher.
   */
  async start(): Promise<void> {
    console.log("[SessionWatcher] Starting...")
    console.log(`[SessionWatcher] Convex URL: ${CONVEX_URL}`)
    console.log(`[SessionWatcher] Sessions JSON: ${SESSIONS_JSON_PATH}`)

    // Verify Convex connection
    try {
      await this.convex.query(api.sessions.list, { limit: 1 })
      console.log("[SessionWatcher] Connected to Convex")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[SessionWatcher] Failed to connect to Convex: ${message}`)
      process.exit(1)
    }

    // Do initial scan of sessions.json
    await this.scanSessionsJson()

    // Watch sessions.json for changes
    this.watchSessionsJson()

    // Start flush timer for batching updates
    this.startFlushTimer()

    this.running = true
    console.log(`[SessionWatcher] Watching ${this.watchedSessions.size} sessions`)
    console.log("[SessionWatcher] Ready")

    // Handle graceful shutdown
    process.on("SIGTERM", () => this.stop())
    process.on("SIGINT", () => this.stop())
  }

  /**
   * Stop the session watcher gracefully.
   */
  stop(): void {
    console.log("[SessionWatcher] Shutting down...")
    this.running = false

    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // Flush any pending updates
    if (this.dirtySessions.size > 0) {
      this.flush().catch((err) => {
        console.error("[SessionWatcher] Error during final flush:", err)
      })
    }

    // Close all file watchers
    for (const session of this.watchedSessions.values()) {
      session.watcher.close()
    }
    this.watchedSessions.clear()

    // Close sessions.json watcher
    if (this.sessionsJsonWatcher) {
      this.sessionsJsonWatcher.close()
      this.sessionsJsonWatcher = null
    }

    console.log("[SessionWatcher] Goodbye")
    process.exit(0)
  }

  /**
   * Read and parse sessions.json.
   */
  private readSessionsJson(): SessionsJson {
    try {
      const content = readFileSync(SESSIONS_JSON_PATH, "utf-8")
      return JSON.parse(content) as SessionsJson
    } catch {
      return {}
    }
  }

  /**
   * Initial scan of sessions.json to populate watched sessions.
   */
  private async scanSessionsJson(): Promise<void> {
    const sessions = this.readSessionsJson()
    const now = Date.now()

    for (const [sessionKey, entry] of Object.entries(sessions)) {
      // Resolve file path
      const filePath =
        entry.sessionFile ??
        join(dirname(SESSIONS_JSON_PATH), `${entry.sessionId}.jsonl`)

      // Check if file exists and is not too old if completed
      try {
        const stats = statSync(filePath)
        const age = now - stats.mtimeMs

        // Skip very old completed sessions to avoid watching too many files
        if (age > COMPLETED_SESSION_MAX_AGE_MS) {
          const info = sessionFileReader.getSessionInfo(sessionKey)
          if (info?.isDone) {
            continue
          }
        }

        // Add to watch list
        this.addSessionWatch(sessionKey, entry.sessionId, filePath)
      } catch {
        // File doesn't exist yet, still watch for it
        this.addSessionWatch(sessionKey, entry.sessionId, filePath)
      }
    }
  }

  /**
   * Watch sessions.json for new/removed sessions.
   */
  private watchSessionsJson(): void {
    try {
      this.sessionsJsonWatcher = watch(SESSIONS_JSON_PATH, (eventType) => {
        if (eventType === "change") {
          this.handleSessionsJsonChange()
        }
      })
    } catch (error) {
      console.error("[SessionWatcher] Failed to watch sessions.json:", error)
    }
  }

  /**
   * Handle changes to sessions.json.
   */
  private handleSessionsJsonChange(): void {
    try {
      // Check mtime to avoid duplicate processing
      const stats = statSync(SESSIONS_JSON_PATH)
      if (stats.mtimeMs === this.sessionsJsonMtime) {
        return
      }
      this.sessionsJsonMtime = stats.mtimeMs

      const sessions = this.readSessionsJson()
      const currentKeys = new Set(this.watchedSessions.keys())
      const newKeys = new Set(Object.keys(sessions))

      // Find removed sessions
      for (const sessionKey of currentKeys) {
        if (!newKeys.has(sessionKey)) {
          this.removeSessionWatch(sessionKey)
        }
      }

      // Find new sessions
      for (const [sessionKey, entry] of Object.entries(sessions)) {
        if (!currentKeys.has(sessionKey)) {
          const filePath =
            entry.sessionFile ??
            join(dirname(SESSIONS_JSON_PATH), `${entry.sessionId}.jsonl`)
          this.addSessionWatch(sessionKey, entry.sessionId, filePath)
        }
      }

      // Clean up old completed sessions if we're over the limit
      this.cleanupOldSessions()
    } catch (error) {
      console.error("[SessionWatcher] Error handling sessions.json change:", error)
    }
  }

  /**
   * Add a session to the watch list.
   */
  private addSessionWatch(
    sessionKey: string,
    sessionId: string,
    filePath: string
  ): void {
    // Check limit
    if (this.watchedSessions.size >= MAX_WATCHED_FILES) {
      console.warn(`[SessionWatcher] Max watched files reached, skipping ${sessionKey}`)
      return
    }

    // If file doesn't exist yet, don't watch it (fs.watch throws ENOENT).
    // We'll pick it up on the next sessions.json change or periodic scan.
    try {
      statSync(filePath)
    } catch {
      return
    }

    const watcher = watch(filePath, (eventType) => {
      if (eventType === "change") {
        this.dirtySessions.add(sessionKey)
      }
    })

    this.watchedSessions.set(sessionKey, {
      sessionKey,
      sessionId,
      filePath,
      watcher,
      lastModified: Date.now(),
      status: "active",
    })

    // Mark as dirty to sync initial state
    this.dirtySessions.add(sessionKey)
  }

  /**
   * Remove a session from the watch list.
   */
  private removeSessionWatch(sessionKey: string): void {
    const session = this.watchedSessions.get(sessionKey)
    if (session) {
      session.watcher.close()
      this.watchedSessions.delete(sessionKey)
      this.dirtySessions.delete(sessionKey)
      console.log(`[SessionWatcher] Stopped watching ${sessionKey}`)
    }
  }

  /**
   * Clean up old completed sessions when over limit.
   */
  private cleanupOldSessions(): void {
    if (this.watchedSessions.size <= MAX_WATCHED_FILES) {
      return
    }

    const now = Date.now()
    const sessionsToRemove: string[] = []

    // Find old completed sessions
    for (const [sessionKey, session] of this.watchedSessions) {
      if (session.status === "completed") {
        const age = now - session.lastModified
        if (age > COMPLETED_SESSION_MAX_AGE_MS) {
          sessionsToRemove.push(sessionKey)
        }
      }
    }

    // Remove oldest first
    sessionsToRemove.sort((a, b) => {
      const sessionA = this.watchedSessions.get(a)
      const sessionB = this.watchedSessions.get(b)
      return (sessionA?.lastModified ?? 0) - (sessionB?.lastModified ?? 0)
    })

    // Remove until under limit
    const toRemove = sessionsToRemove.slice(
      0,
      this.watchedSessions.size - MAX_WATCHED_FILES
    )
    for (const sessionKey of toRemove) {
      this.removeSessionWatch(sessionKey)
    }
  }

  /**
   * Start the flush timer for batching updates.
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.dirtySessions.size > 0) {
        this.flush().catch((err) => {
          console.error("[SessionWatcher] Flush error:", err)
        })
      }
    }, FLUSH_INTERVAL_MS)
  }

  /**
   * Flush dirty sessions to Convex.
   */
  private async flush(): Promise<void> {
    if (this.dirtySessions.size === 0) {
      return
    }

    const sessionsToSync = Array.from(this.dirtySessions)
    this.dirtySessions.clear()

    const sessionInputs = []

    for (const sessionKey of sessionsToSync) {
      const watchedSession = this.watchedSessions.get(sessionKey)
      if (!watchedSession) {
        continue
      }

      // Get session info from file reader
      const info = sessionFileReader.getSessionInfo(sessionKey, STALE_THRESHOLD_MS)

      // Determine status
      const status = determineStatus(info)

      // Update watched session status
      watchedSession.status = status === "idle" ? "active" : status
      if (info) {
        watchedSession.lastModified = info.fileMtimeMs
      }

      // Detect type and extract metadata
      const sessionType = detectSessionType(sessionKey)
      const projectSlug = extractProjectSlug(sessionKey)
      const taskId = extractTaskId(sessionKey)

      // Build session input for Convex (using camelCase as per the API)
      sessionInputs.push({
        sessionKey,
        sessionId: watchedSession.sessionId,
        sessionType,
        status,
        model: info?.lastAssistantMessage?.model,
        provider: info?.lastAssistantMessage?.provider,
        tokensInput: info?.lastAssistantMessage?.usage.input,
        tokensOutput: info?.lastAssistantMessage?.usage.output,
        tokensCacheRead: info?.lastAssistantMessage?.usage.cacheRead,
        tokensCacheWrite: info?.lastAssistantMessage?.usage.cacheWrite,
        tokensTotal: info?.lastAssistantMessage?.usage.total,
        costInput: info?.lastAssistantMessage?.usage.cost.input,
        costOutput: info?.lastAssistantMessage?.usage.cost.output,
        costCacheRead: info?.lastAssistantMessage?.usage.cost.cacheRead,
        costCacheWrite: info?.lastAssistantMessage?.usage.cost.cacheWrite,
        costTotal: info?.lastAssistantMessage?.usage.cost.total,
        lastActiveAt: info?.fileMtimeMs,
        outputPreview: info?.lastAssistantMessage?.textPreview,
        stopReason: info?.lastAssistantMessage?.stopReason,
        taskId,
        projectSlug,
        filePath: watchedSession.filePath,
        createdAt: Date.now(),
      })
    }

    if (sessionInputs.length === 0) {
      return
    }

    try {
      const result = await this.convex.mutation(api.sessions.batchUpsert, {
        sessions: sessionInputs,
      })
      console.log(
        `[SessionWatcher] Synced ${result.count} sessions (${sessionsToSync.length} dirty)`
      )
      if (result.errors.length > 0) {
        console.error("[SessionWatcher] Errors:", result.errors)
      }
    } catch (error) {
      console.error("[SessionWatcher] Failed to sync sessions:", error)
      // Re-add to dirty set for retry
      for (const sessionKey of sessionsToSync) {
        this.dirtySessions.add(sessionKey)
      }
    }
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  const watcher = new SessionWatcher()
  await watcher.start()
}

main().catch((error) => {
  console.error("[SessionWatcher] Fatal error:", error)
  process.exit(1)
})
