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

// Max age for watching completed sessions (2 hours - allow time for review)
const COMPLETED_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000

// Stale threshold (5 minutes of inactivity)
const STALE_THRESHOLD_MS = 5 * 60 * 1000

// Max watched files limit (increased from 100)
const MAX_WATCHED_FILES = 250

// Re-scan sessions.json every N flush cycles to pick up new sessions
const RESCAN_INTERVAL_FLUSHES = 5

// Clean up old completed sessions every N flush cycles (every ~5 minutes)
const CLEANUP_INTERVAL_FLUSHES = 100

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
 * Known agent roles from the work loop.
 * Used to distinguish agent sessions from chat sessions
 * when both share the agent:main:clutch:* prefix.
 */
const AGENT_ROLES = new Set([
  "dev",
  "reviewer",
  "pm",
  "research",
  "conflict_resolver",
  "analyzer",
  "fixer",
  "qa",
  "security",
])

/**
 * Detect session type from session key pattern.
 */
function detectSessionType(sessionKey: string): SessionType {
  // agent:main:main → type main
  if (sessionKey === "agent:main:main") {
    return "main"
  }

  // agent:main:clutch:{role}:{taskIdPrefix} → type agent (work loop)
  // agent:main:trap:{role}:{taskIdPrefix}  → type agent (legacy pre-rename)
  // Distinguished from chat by checking if segment is a known role.
  const agentMatch = sessionKey.match(
    /^agent:main:(?:clutch|trap):([^:]+):([a-f0-9]{8})$/
  )
  if (agentMatch && AGENT_ROLES.has(agentMatch[1])) {
    return "agent"
  }

  // agent:main:clutch:{slug}:{chatId} → type chat
  if (sessionKey.match(/^agent:main:(?:clutch|trap):[^:]+:/)) {
    return "chat"
  }

  // agent:main:cron:*:clutch-{taskIdPrefix} → type agent (old cron-based spawning)
  // agent:main:cron:*:trap-{taskIdPrefix}   → type agent (legacy)
  if (sessionKey.match(/^agent:main:cron:.*:(?:clutch|trap)-/)) {
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
 *
 * For agent sessions (agent:main:clutch:{role}:{taskPrefix}), the slug
 * comes from the "clutch" or "trap" segment, not from the role. We look
 * up the full task in Convex to get the real project slug.
 *
 * For chat sessions (agent:main:clutch:{slug}:{chatId}), the slug IS
 * the first variable segment.
 *
 * For legacy cron-based sessions, we extract from the label prefix.
 */
function extractProjectSlug(sessionKey: string): string | undefined {
  // agent:main:clutch:{role}:{taskPrefix} → slug is "clutch" project
  // agent:main:trap:{role}:{taskPrefix}   → slug is "trap"/"clutch" project
  const agentMatch = sessionKey.match(
    /^agent:main:(clutch|trap):([^:]+):([a-f0-9]{8})$/
  )
  if (agentMatch && AGENT_ROLES.has(agentMatch[2])) {
    // Agent sessions: the project is "clutch" (or "trader" etc)
    // We can't determine the exact project from the key alone since the
    // key embeds the product name, not the project slug. Return "clutch"
    // for clutch keys, or look it up from the task.
    // For now, return undefined and let the task_id join handle it.
    return undefined
  }

  // agent:main:clutch:{slug}:{chatId} or agent:main:trap:{slug}:{chatId}
  const chatMatch = sessionKey.match(/^agent:main:(?:clutch|trap):([^:]+):/)
  if (chatMatch) {
    return chatMatch[1]
  }

  // agent:main:cron:*:clutch-* or agent:main:cron:*:trap-*
  if (sessionKey.match(/:(?:clutch|trap)-/)) {
    return "clutch"
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
  private flushCycleCount = 0

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
   * Check if session key is from pre-rename trap: era (should be skipped).
   */
  private isLegacyTrapKey(sessionKey: string): boolean {
    return sessionKey.includes(":trap:") || sessionKey.includes(":trap-")
  }

  /**
   * Sort sessions by recency (updatedAt desc) with active sessions first.
   */
  private sortSessionsByRecency(
    sessions: SessionsJson
  ): Array<[string, SessionsJsonEntry]> {
    const entries = Object.entries(sessions)

    // Sort by updatedAt desc (most recent first)
    entries.sort((a, b) => {
      const timeA = a[1].updatedAt ?? 0
      const timeB = b[1].updatedAt ?? 0
      return timeB - timeA
    })

    return entries
  }

  /**
   * Initial scan of sessions.json to populate watched sessions.
   * Prioritizes recently active sessions and skips legacy trap: keys.
   */
  private async scanSessionsJson(): Promise<void> {
    const sessions = this.readSessionsJson()
    const sortedSessions = this.sortSessionsByRecency(sessions)
    const now = Date.now()

    for (const [sessionKey, entry] of sortedSessions) {
      // Skip legacy trap: keys (pre-rename artifacts)
      if (this.isLegacyTrapKey(sessionKey)) {
        continue
      }

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
        // File doesn't exist yet, skip (we'll pick it up on re-scan)
        continue
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
   * Prioritizes recently active sessions when adding new watches.
   *
   * BUG FIX: Detects when a session key's sessionId has changed (e.g., task retry
   * with same key but new session). Removes old watcher and re-adds with new file.
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
      const sortedSessions = this.sortSessionsByRecency(sessions)

      // Find removed sessions
      const newKeys = new Set(Object.keys(sessions))
      for (const sessionKey of currentKeys) {
        if (!newKeys.has(sessionKey)) {
          this.removeSessionWatch(sessionKey)
        }
      }

      // Find new or changed sessions (prioritize by recency)
      for (const [sessionKey, entry] of sortedSessions) {
        // Skip legacy trap: keys
        if (this.isLegacyTrapKey(sessionKey)) {
          continue
        }

        const filePath =
          entry.sessionFile ??
          join(dirname(SESSIONS_JSON_PATH), `${entry.sessionId}.jsonl`)

        const watchedSession = this.watchedSessions.get(sessionKey)

        if (!watchedSession) {
          // New session key - add it
          this.addSessionWatch(sessionKey, entry.sessionId, filePath)
        } else if (watchedSession.sessionId !== entry.sessionId) {
          // BUG FIX #1: Session key exists but sessionId changed (retry scenario)
          // Remove old watcher and add new one with updated file path
          console.log(
            `[SessionWatcher] Session ${sessionKey} changed from ${watchedSession.sessionId} to ${entry.sessionId}, replacing watcher`
          )
          this.removeSessionWatch(sessionKey)
          this.addSessionWatch(sessionKey, entry.sessionId, filePath)
        }
        // else: already watching this session key with same sessionId - do nothing
      }

      // Clean up old completed sessions if we're over the limit
      this.cleanupOldSessions()
    } catch (error) {
      console.error("[SessionWatcher] Error handling sessions.json change:", error)
    }
  }

  /**
   * Add a session to the watch list.
   * Evicts old completed sessions if at limit and new session is active.
   */
  private addSessionWatch(
    sessionKey: string,
    sessionId: string,
    filePath: string
  ): void {
    // If file doesn't exist yet, don't watch it (fs.watch throws ENOENT).
    // We'll pick it up on the next sessions.json change or periodic scan.
    try {
      statSync(filePath)
    } catch {
      return
    }

    // Check limit - try to make room by evicting old completed sessions
    if (this.watchedSessions.size >= MAX_WATCHED_FILES) {
      const evicted = this.evictOldestCompletedSession()
      if (!evicted) {
        console.warn(`[SessionWatcher] Max watched files reached, skipping ${sessionKey}`)
        return
      }
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
   * Evict the oldest completed session to make room for a new one.
   * Returns true if a session was evicted.
   */
  private evictOldestCompletedSession(): boolean {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [sessionKey, session] of this.watchedSessions) {
      if (session.status === "completed" && session.lastModified < oldestTime) {
        oldestKey = sessionKey
        oldestTime = session.lastModified
      }
    }

    if (oldestKey) {
      console.log(`[SessionWatcher] Evicting completed session ${oldestKey} to make room`)
      this.removeSessionWatch(oldestKey)
      return true
    }

    return false
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
   * Clean up old completed sessions from Convex.
   * Runs periodically to prevent unbounded growth.
   */
  private async cleanupOldCompletedSessions(): Promise<void> {
    try {
      const result = await this.convex.mutation(api.sessions.cleanupCompleted, {})
      if (result.deleted > 0) {
        console.log(`[SessionWatcher] Cleaned up ${result.deleted} old completed sessions`)
      }
    } catch (error) {
      console.error("[SessionWatcher] Failed to cleanup old sessions:", error)
    }
  }

  /**
   * Evict completed sessions that have been idle.
   */
  private evictIdleCompletedSessions(): void {
    const now = Date.now()
    const toEvict: string[] = []

    for (const [sessionKey, session] of this.watchedSessions) {
      if (session.status === "completed") {
        const idleTime = now - session.lastModified
        if (idleTime > COMPLETED_SESSION_MAX_AGE_MS) {
          toEvict.push(sessionKey)
        }
      }
    }

    for (const sessionKey of toEvict) {
      console.log(`[SessionWatcher] Evicting idle completed session ${sessionKey}`)
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
   * Also evicts completed sessions that have been idle and triggers periodic re-scan.
   */
  private async flush(): Promise<void> {
    this.flushCycleCount++

    // Periodic re-scan: pick up new sessions that appeared since last scan
    if (this.flushCycleCount % RESCAN_INTERVAL_FLUSHES === 0) {
      console.log("[SessionWatcher] Periodic re-scan triggered")
      this.handleSessionsJsonChange()
    }

    // Periodic cleanup of old completed sessions
    if (this.flushCycleCount % CLEANUP_INTERVAL_FLUSHES === 0) {
      await this.cleanupOldCompletedSessions()
    }

    // Evict completed sessions that have been idle
    this.evictIdleCompletedSessions()

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
      // BUG FIX #2: Pass the known filePath to bypass stale sessions.json cache
      const info = sessionFileReader.getSessionInfo(
        sessionKey,
        STALE_THRESHOLD_MS,
        watchedSession.filePath
      )

      // Determine status
      const status = determineStatus(info)

      // Update watched session status
      watchedSession.status = status === "idle" ? "active" : status
      if (info) {
        watchedSession.lastModified = info.fileMtimeMs
      }

      // Detect type and extract metadata
      const sessionType = detectSessionType(sessionKey)
      let projectSlug = extractProjectSlug(sessionKey)
      // Resolve task ID: look up tasks where agent_session_key matches
      // this session key. The task stores the full session key, so we
      // can match exactly without needing to expand the 8-char prefix.
      let taskId: string | undefined
      if (sessionType === "agent") {
        try {
          const task = await this.convex.query(api.tasks.getByAgentSessionKey, {
            agentSessionKey: sessionKey,
          })
          if (task) {
            taskId = task.id
            // BUG FIX: Resolve project slug from task's project_id
            // extractProjectSlug() returns undefined for agent sessions,
            // so we need to look up the actual project slug
            const resolvedSlug = await this.convex.query(api.projects.getSlugById, {
              projectId: task.project_id,
            })
            if (resolvedSlug) {
              projectSlug = resolvedSlug
            }
          }
        } catch {
          // Non-fatal: task lookup failed, taskId stays undefined
          // The sidebar can still join via agent_session_key on the task
        }

        // REGRESSION GUARD: Agent sessions with resolved tasks MUST have projectSlug
        if (taskId && !projectSlug) {
          console.error(
            `[SessionWatcher] REGRESSION: Agent session ${sessionKey} has taskId ${taskId} but no projectSlug`
          )
        }
      }

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
