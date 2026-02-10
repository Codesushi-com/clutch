import { ConvexHttpClient } from "convex/browser"
import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from "node:fs"
import { homedir } from "node:os"
import { join, extname } from "node:path"
import { api } from "../convex/_generated/api"

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210"
const SESSIONS_DIR = join(homedir(), ".openclaw", "agents", "main", "sessions")
const SESSIONS_JSON_PATH = join(SESSIONS_DIR, "sessions.json")
const POLL_INTERVAL_MS = 3000
const STALE_THRESHOLD_MS = 5 * 60 * 1000

type SessionType = "main" | "chat" | "agent" | "cron"
type SessionStatus = "active" | "idle" | "completed" | "stale"

interface SessionsJsonEntry {
  sessionId: string
  sessionFile?: string
  updatedAt?: number
}

interface SessionsJson {
  [sessionKey: string]: SessionsJsonEntry
}

interface SessionData {
  sessionKey: string
  sessionId: string
  filePath: string
  fileMtimeMs: number
  sessionType: SessionType
  status: SessionStatus
  model?: string
  provider?: string
  stopReason?: string
  tokensInput?: number
  tokensOutput?: number
  tokensCacheRead?: number
  tokensCacheWrite?: number
  tokensTotal?: number
  costInput?: number
  costOutput?: number
  costCacheRead?: number
  costCacheWrite?: number
  costTotal?: number
  outputPreview?: string
  projectSlug?: string
  taskId?: string
}

const AGENT_ROLES = new Set([
  "dev", "reviewer", "pm", "research", "conflict_resolver",
  "analyzer", "fixer", "qa", "security"
])

function detectSessionType(sessionKey: string): SessionType {
  if (sessionKey === "agent:main:main") return "main"
  const agentMatch = sessionKey.match(/^agent:main:(?:clutch|trap):([^:]+):([a-f0-9]{8})$/)
  if (agentMatch && AGENT_ROLES.has(agentMatch[1])) return "agent"
  if (sessionKey.match(/^agent:main:(?:clutch|trap):[^:]+:/)) return "chat"
  if (sessionKey.match(/^agent:main:cron:.*:(?:clutch|trap)-/)) return "agent"
  if (sessionKey.startsWith("agent:main:cron:")) return "cron"
  return "cron"
}

function extractProjectSlug(sessionKey: string): string | undefined {
  const chatMatch = sessionKey.match(/^agent:main:(?:clutch|trap):([^:]+):/)
  if (chatMatch) return chatMatch[1]
  if (sessionKey.match(/:(?:clutch|trap)-/)) return "clutch"
  return undefined
}

/**
 * Read the last N lines of a file by reading a chunk from the end.
 * Pure Node.js — no external `tail` dependency.
 */
function readLastLines(filePath: string, lineCount: number, chunkSize = 8192): string[] {
  try {
    const stats = statSync(filePath)
    if (stats.size === 0) return []
    const fd = openSync(filePath, "r")
    try {
      const readSize = Math.min(chunkSize, stats.size)
      const buffer = Buffer.alloc(readSize)
      readSync(fd, buffer, 0, readSize, stats.size - readSize)
      const text = buffer.toString("utf-8")
      const lines = text.split("\n").filter(Boolean)
      return lines.slice(-lineCount)
    } finally {
      closeSync(fd)
    }
  } catch {
    return []
  }
}

function parseLastMessage(line: string): {
  model: string
  provider: string
  stopReason: string
  usage: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  }
  textPreview: string
  isDone: boolean
} | null {
  try {
    const entry = JSON.parse(line) as {
      message?: {
        role?: string
        model?: string
        provider?: string
        stopReason?: string
        usage?: {
          input?: number
          output?: number
          cacheRead?: number
          cacheWrite?: number
          totalTokens?: number
          cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number }
        }
        content?: Array<{ type: string; text?: string }>
      }
    }
    const msg = entry.message
    if (!msg || msg.role !== "assistant") return null
    const usage = msg.usage
    const textPreview = (msg.content || [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("")
      .slice(0, 500)
    return {
      model: msg.model ?? "unknown",
      provider: msg.provider ?? "unknown",
      stopReason: msg.stopReason ?? "unknown",
      usage: {
        input: usage?.input ?? 0,
        output: usage?.output ?? 0,
        cacheRead: usage?.cacheRead ?? 0,
        cacheWrite: usage?.cacheWrite ?? 0,
        total: usage?.totalTokens ?? 0,
        cost: {
          input: usage?.cost?.input ?? 0,
          output: usage?.cost?.output ?? 0,
          cacheRead: usage?.cost?.cacheRead ?? 0,
          cacheWrite: usage?.cost?.cacheWrite ?? 0,
          total: usage?.cost?.total ?? 0
        }
      },
      textPreview,
      isDone: msg.stopReason === "stop"
    }
  } catch {
    return null
  }
}

function findLastAssistantMessage(lines: string[]) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const result = parseLastMessage(lines[i])
    if (result) return result
  }
  return null
}

function hasTerminalError(filePath: string): boolean {
  try {
    const lines = readLastLines(filePath, 3)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]) as {
          message?: { role?: string; content?: Array<{ type: string; text?: string }> }
          isError?: boolean
        }
        if (
          entry.message?.role === "toolResult" &&
          entry.isError === true &&
          entry.message.content?.some(
            (c) => c.type === "text" && c.text?.includes("synthetic error result for transcript repair")
          )
        ) {
          return true
        }
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return false
}

function determineStatus(isDone: boolean, hasAssistantMessage: boolean, fileMtimeMs: number): SessionStatus {
  if (isDone) return "completed"
  if (!hasAssistantMessage) return "idle"
  if (Date.now() - fileMtimeMs > STALE_THRESHOLD_MS) return "stale"
  return "active"
}

class SessionCache {
  private data: SessionsJson = {}
  private mtimeMs = 0
  private fileToKey = new Map<string, string>()

  refresh(): void {
    try {
      const stats = statSync(SESSIONS_JSON_PATH)
      if (stats.mtimeMs === this.mtimeMs) return
      const content = readFileSync(SESSIONS_JSON_PATH, "utf-8")
      this.data = JSON.parse(content) as SessionsJson
      this.mtimeMs = stats.mtimeMs
      this.fileToKey.clear()
      for (const [key, entry] of Object.entries(this.data)) {
        const filePath = entry.sessionFile ?? join(SESSIONS_DIR, `${entry.sessionId}.jsonl`)
        this.fileToKey.set(filePath, key)
      }
    } catch {
      // keep existing cache
    }
  }

  getSessionKey(filePath: string): string | undefined {
    return this.fileToKey.get(filePath)
  }

  getSessionId(sessionKey: string): string | undefined {
    return this.data[sessionKey]?.sessionId
  }

  isLegacyTrap(sessionKey: string): boolean {
    return sessionKey.includes(":trap:") || sessionKey.includes(":trap-")
  }
}

class FileScanner {
  private fileMtimes = new Map<string, number>()

  scan(): string[] {
    const changedFiles: string[] = []
    try {
      const entries = readdirSync(SESSIONS_DIR, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || extname(entry.name) !== ".jsonl") continue
        const filePath = join(SESSIONS_DIR, entry.name)
        try {
          const stats = statSync(filePath)
          const lastMtime = this.fileMtimes.get(filePath) ?? 0
          if (stats.mtimeMs > lastMtime) {
            changedFiles.push(filePath)
            this.fileMtimes.set(filePath, stats.mtimeMs)
          }
        } catch {
          // skip
        }
      }
    } catch {
      // directory might not exist
    }
    return changedFiles
  }
}

class SessionWatcher {
  private convex: ConvexHttpClient
  private cache = new SessionCache()
  private scanner = new FileScanner()
  private pollTimer: NodeJS.Timeout | null = null
  private reconcileTimer: NodeJS.Timeout | null = null
  private running = false
  private static RECONCILE_INTERVAL_MS = 60_000 // check for stale sessions every 60s

  constructor() {
    this.convex = new ConvexHttpClient(CONVEX_URL)
  }

  async start(): Promise<void> {
    console.log("[SessionWatcher] Starting (poll-based)...")
    console.log(`[SessionWatcher] Convex URL: ${CONVEX_URL}`)

    try {
      await this.convex.query(api.sessions.list, { limit: 1 })
      console.log("[SessionWatcher] Connected to Convex")
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[SessionWatcher] Failed to connect to Convex: ${msg}`)
      process.exit(1)
    }

    this.cache.refresh()
    this.running = true
    this.poll()
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    // Periodically reconcile: mark Convex sessions as stale/completed if their
    // JSONL files haven't been touched or if they no longer appear in OpenClaw
    this.reconcileTimer = setInterval(() => this.reconcileStale(), SessionWatcher.RECONCILE_INTERVAL_MS)

    process.on("SIGTERM", () => this.stop())
    process.on("SIGINT", () => this.stop())

    console.log("[SessionWatcher] Ready")
  }

  stop(): void {
    console.log("[SessionWatcher] Shutting down...")
    this.running = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    console.log("[SessionWatcher] Goodbye")
    process.exit(0)
  }

  /**
   * Periodic reconciliation: find sessions marked "active" in Convex whose
   * JSONL files are older than STALE_THRESHOLD_MS, and mark them stale/completed.
   * This catches sessions that died without the watcher noticing (because the
   * file scanner only picks up files with new mtimes).
   */
  private async reconcileStale(): Promise<void> {
    if (!this.running) return

    try {
      // Get all active/idle agent sessions from Convex
      const activeSessions = await this.convex.query(api.sessions.list, {
        status: "active",
        sessionType: "agent",
        limit: 200,
      })

      if (!activeSessions || activeSessions.length === 0) return

      const now = Date.now()
      let reconciled = 0

      for (const session of activeSessions) {
        const filePath = session.file_path
        if (!filePath) {
          // No file path recorded — if lastActiveAt is old, mark completed
          const lastActive = session.last_active_at ?? session.updated_at ?? 0
          if (now - lastActive > STALE_THRESHOLD_MS) {
            try {
              await this.convex.mutation(api.sessions.upsert, {
                sessionKey: session.session_key,
                sessionId: session.session_id,
                sessionType: (session.session_type ?? "agent") as SessionType,
                status: "completed",
              })
              reconciled++
            } catch {
              // non-fatal
            }
          }
          continue
        }

        // Check file mtime
        try {
          const stats = statSync(filePath)
          if (now - stats.mtimeMs > STALE_THRESHOLD_MS) {
            // File hasn't been touched — determine proper status
            const lastLines = readLastLines(filePath, 5)
            const lastMsg = lastLines.length > 0 ? findLastAssistantMessage(lastLines) : null
            const isTerminalError = hasTerminalError(filePath)
            const isDone = (lastMsg?.isDone ?? false) || isTerminalError
            const newStatus = isDone ? "completed" : "stale"

            await this.convex.mutation(api.sessions.upsert, {
              sessionKey: session.session_key,
              sessionId: session.session_id,
              sessionType: (session.session_type ?? "agent") as SessionType,
              status: newStatus,
              lastActiveAt: stats.mtimeMs,
            })
            reconciled++
          }
        } catch {
          // File doesn't exist — session is dead
          try {
            await this.convex.mutation(api.sessions.upsert, {
              sessionKey: session.session_key,
              sessionId: session.session_id,
              sessionType: (session.session_type ?? "agent") as SessionType,
              status: "completed",
            })
            reconciled++
          } catch {
            // non-fatal
          }
        }
      }

      if (reconciled > 0) {
        console.log(`[SessionWatcher] Reconciled ${reconciled} stale sessions`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[SessionWatcher] Reconciliation error: ${msg}`)
    }
  }

  private async poll(): Promise<void> {
    if (!this.running) return

    this.cache.refresh()
    const changedFiles = this.scanner.scan()
    if (changedFiles.length === 0) return

    const sessions: SessionData[] = []

    for (const filePath of changedFiles) {
      const sessionKey = this.cache.getSessionKey(filePath)
      if (!sessionKey || this.cache.isLegacyTrap(sessionKey)) continue

      const sessionId = this.cache.getSessionId(sessionKey)
      if (!sessionId) continue

      const stats = statSync(filePath)
      const fileMtimeMs = stats.mtimeMs

      const lastLines = readLastLines(filePath, 5)
      const lastMsg = lastLines.length > 0 ? findLastAssistantMessage(lastLines) : null
      const isTerminalError = hasTerminalError(filePath)
      const isDone = (lastMsg?.isDone ?? false) || isTerminalError

      const sessionType = detectSessionType(sessionKey)
      let projectSlug = extractProjectSlug(sessionKey)
      const status = determineStatus(isDone, lastMsg !== null, fileMtimeMs)

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
          // non-fatal
        }

        // REGRESSION GUARD: Agent sessions with resolved tasks MUST have projectSlug
        if (taskId && !projectSlug) {
          console.error(
            `[SessionWatcher] REGRESSION: Agent session ${sessionKey} has taskId ${taskId} but no projectSlug`
          )
        }
      }

      sessions.push({
        sessionKey,
        sessionId,
        filePath,
        fileMtimeMs,
        sessionType,
        status,
        model: lastMsg?.model,
        provider: lastMsg?.provider,
        stopReason: lastMsg?.stopReason,
        tokensInput: lastMsg?.usage.input,
        tokensOutput: lastMsg?.usage.output,
        tokensCacheRead: lastMsg?.usage.cacheRead,
        tokensCacheWrite: lastMsg?.usage.cacheWrite,
        tokensTotal: lastMsg?.usage.total,
        costInput: lastMsg?.usage.cost.input,
        costOutput: lastMsg?.usage.cost.output,
        costCacheRead: lastMsg?.usage.cost.cacheRead,
        costCacheWrite: lastMsg?.usage.cost.cacheWrite,
        costTotal: lastMsg?.usage.cost.total,
        outputPreview: lastMsg?.textPreview,
        projectSlug,
        taskId
      })
    }

    if (sessions.length === 0) return

    try {
      const result = await this.convex.mutation(api.sessions.batchUpsert, {
        sessions: sessions.map((s) => ({
          sessionKey: s.sessionKey,
          sessionId: s.sessionId,
          sessionType: s.sessionType,
          status: s.status,
          model: s.model,
          provider: s.provider,
          tokensInput: s.tokensInput,
          tokensOutput: s.tokensOutput,
          tokensCacheRead: s.tokensCacheRead,
          tokensCacheWrite: s.tokensCacheWrite,
          tokensTotal: s.tokensTotal,
          costInput: s.costInput,
          costOutput: s.costOutput,
          costCacheRead: s.costCacheRead,
          costCacheWrite: s.costCacheWrite,
          costTotal: s.costTotal,
          lastActiveAt: s.fileMtimeMs,
          outputPreview: s.outputPreview,
          stopReason: s.stopReason,
          taskId: s.taskId,
          projectSlug: s.projectSlug,
          filePath: s.filePath,
          createdAt: Date.now()
        }))
      })

      if (result.count > 0) {
        console.log(`[SessionWatcher] Synced ${result.count} sessions`)
      }
      if (result.errors.length > 0) {
        console.error("[SessionWatcher] Errors:", result.errors)
      }
    } catch (error) {
      console.error("[SessionWatcher] Failed to sync:", error)
    }
  }
}

async function main(): Promise<void> {
  const watcher = new SessionWatcher()
  await watcher.start()
}

main().catch((error) => {
  console.error("[SessionWatcher] Fatal error:", error)
  process.exit(1)
})
