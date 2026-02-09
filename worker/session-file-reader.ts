/**
 * Session File Reader
 *
 * Reads agent session JSONL files directly from disk to detect completion
 * and extract session metadata. Uses file mtime as the true activity signal
 * since the RPC sessions.list has broken updatedAt timestamps.
 */

import { readFileSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

// ============================================
// Types
// ============================================

export interface SessionFileInfo {
  sessionId: string
  filePath: string
  fileMtimeMs: number
  lastAssistantMessage: {
    model: string
    provider: string
    stopReason: string
    usage: {
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
      total: number
      cost: {
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
        total: number
      }
    }
    textPreview: string
    timestamp: number
  } | null
  isDone: boolean
  /** True when OpenClaw killed the run (embedded timeout → synthetic error). isDone is also true. */
  isTerminalError: boolean
  isStale: boolean
}

interface SessionsJsonEntry {
  sessionId: string
  sessionFile?: string
  updatedAt?: number
}

interface SessionsJson {
  [sessionKey: string]: SessionsJsonEntry
}

interface SessionMessage {
  type: string
  id?: string
  timestamp?: string
  message?: {
    role: string
    content?: Array<{
      type: string
      text?: string
      thinking?: string
    }>
    model?: string
    provider?: string
    usage?: {
      input?: number
      output?: number
      cacheRead?: number
      cacheWrite?: number
      totalTokens?: number
      cost?: {
        input?: number
        output?: number
        cacheRead?: number
        cacheWrite?: number
        total?: number
      }
    }
    stopReason?: string
    timestamp?: number
  }
}

// ============================================
// Session File Reader
// ============================================

export class SessionFileReader {
  private sessionsDir: string
  private sessionsJsonPath: string
  private sessionsCache: {
    data: SessionsJson | null
    mtimeMs: number
  } = { data: null, mtimeMs: 0 }

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir ?? join(homedir(), ".openclaw", "agents", "main", "sessions")
    this.sessionsJsonPath = join(this.sessionsDir, "sessions.json")
  }

  /**
   * Read sessions.json and cache it.
   * Reloads if the file mtime has changed.
   */
  private readSessionsJson(): SessionsJson {
    try {
      const stats = statSync(this.sessionsJsonPath)
      const currentMtime = stats.mtimeMs

      // Return cached version if file hasn't changed
      if (this.sessionsCache.data && this.sessionsCache.mtimeMs === currentMtime) {
        return this.sessionsCache.data
      }

      // Read and parse the file
      const content = readFileSync(this.sessionsJsonPath, "utf-8")
      const data = JSON.parse(content) as SessionsJson

      // Update cache
      this.sessionsCache = { data, mtimeMs: currentMtime }
      return data
    } catch {
      return {}
    }
  }

  /**
   * Resolve a session key to a file path.
   * Returns null if the session key is not found.
   */
  private resolveFilePath(sessionKey: string): { sessionId: string; filePath: string } | null {
    const sessions = this.readSessionsJson()
    const entry = sessions[sessionKey]

    if (!entry) {
      return null
    }

    // Use sessionFile if available, otherwise construct from sessionId
    const filePath = entry.sessionFile ?? join(this.sessionsDir, `${entry.sessionId}.jsonl`)

    return { sessionId: entry.sessionId, filePath }
  }

  /**
   * Read the last N lines of a file using tail.
   * More efficient than reading the entire file for large JSONL files.
   */
  private readLastLines(filePath: string, lineCount: number): string[] {
    try {
      const result = execFileSync("tail", ["-n", String(lineCount), filePath], {
        encoding: "utf-8",
        timeout: 5000,
      })
      return result.trim().split("\n").filter(Boolean)
    } catch {
      return []
    }
  }

  /**
   * Extract text preview from message content.
   * Looks for text content in the message and returns first 500 chars.
   */
  private extractTextPreview(message: SessionMessage): string {
    const content = message.message?.content
    if (!Array.isArray(content)) {
      return ""
    }

    let text = ""
    for (const block of content) {
      if (block.type === "text" && block.text) {
        text += block.text
      } else if (block.type === "thinking" && block.thinking) {
        // Skip thinking blocks for text preview
        continue
      }

      if (text.length >= 500) {
        break
      }
    }

    return text.slice(0, 500)
  }

  /**
   * Find the last assistant message in the JSONL lines.
   * Walks backward from the end to find the most recent assistant message.
   */
  private findLastAssistantMessage(lines: string[]): SessionMessage | null {
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const message = JSON.parse(lines[i]) as SessionMessage
        if (message.message?.role === "assistant") {
          return message
        }
      } catch {
        // Skip invalid JSON lines
        continue
      }
    }
    return null
  }

  /**
   * Check if the session ended with a terminal error (e.g. OpenClaw killed
   * the run due to timeout and injected a synthetic toolResult).
   *
   * Pattern: the last JSONL entry is a toolResult with isError: true and
   * content containing "synthetic error result for transcript repair".
   * This means the embedded run timed out — the session is dead.
   */
  private hasTerminalError(lines: string[]): boolean {
    // Walk backward — the synthetic error is typically the very last line
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      try {
        const entry = JSON.parse(lines[i]) as SessionMessage
        if (
          entry.message?.role === "toolResult" &&
          (entry as { isError?: boolean }).isError === true
        ) {
          const content = entry.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block.type === "text" &&
                block.text?.includes("synthetic error result for transcript repair")
              ) {
                return true
              }
            }
          }
        }
      } catch {
        continue
      }
    }
    return false
  }

  /**
   * Get session file info for a given session key.
   *
   * Returns null if:
   * - The session key is not found in sessions.json
   * - The JSONL file does not exist
   *
   * @param sessionKey - The session key to look up
   * @param staleThresholdMs - Threshold in ms for considering a session stale (default: 5 minutes)
   * @returns SessionFileInfo or null
   */
  getSessionInfo(sessionKey: string, staleThresholdMs = 5 * 60 * 1000): SessionFileInfo | null {
    // Resolve the file path
    const resolved = this.resolveFilePath(sessionKey)
    if (!resolved) {
      return null
    }

    const { sessionId, filePath } = resolved

    // Get file stats
    let stats
    try {
      stats = statSync(filePath)
    } catch {
      return null
    }

    const fileMtimeMs = stats.mtimeMs
    const now = Date.now()

    // Read last lines and find last assistant message
    const lines = this.readLastLines(filePath, 20)
    const lastMessage = this.findLastAssistantMessage(lines)

    // Check for terminal error (OpenClaw killed the run via timeout).
    // The synthetic error toolResult updates the file mtime, so without
    // this check the session looks "active" and the reaper ignores it.
    const terminalError = this.hasTerminalError(lines)

    // Extract info from last assistant message
    let lastAssistantMessage: SessionFileInfo["lastAssistantMessage"] = null
    let isDone = false

    if (lastMessage?.message) {
      const msg = lastMessage.message
      const usage = msg.usage

      lastAssistantMessage = {
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
            total: usage?.cost?.total ?? 0,
          },
        },
        textPreview: this.extractTextPreview(lastMessage),
        timestamp: msg.timestamp ?? 0,
      }

      isDone = msg.stopReason === "stop"
    }

    // A session is done if:
    // 1. The last assistant message has stopReason === "stop" (normal completion), OR
    // 2. OpenClaw injected a synthetic error (embedded run timed out — session is dead)
    isDone = isDone || terminalError

    // A session is stale if:
    // 1. The file mtime is older than the threshold AND
    // 2. The session is not done
    const isStale = !isDone && (now - fileMtimeMs) > staleThresholdMs

    return {
      sessionId,
      filePath,
      fileMtimeMs,
      lastAssistantMessage,
      isDone,
      isTerminalError: terminalError,
      isStale,
    }
  }

  /**
   * Check if a session is done (completed successfully).
   *
   * @param sessionKey - The session key to check
   * @returns True if the session has stopReason === "stop"
   */
  isSessionDone(sessionKey: string): boolean {
    const info = this.getSessionInfo(sessionKey)
    return info?.isDone ?? false
  }

  /**
   * Check if a session is stale (not done and mtime older than threshold).
   *
   * @param sessionKey - The session key to check
   * @param staleThresholdMs - Threshold in ms (default: 5 minutes)
   * @returns True if the session is stale
   */
  isSessionStale(sessionKey: string, staleThresholdMs = 5 * 60 * 1000): boolean {
    const info = this.getSessionInfo(sessionKey, staleThresholdMs)
    return info?.isStale ?? false
  }
}

// ============================================
// Singleton
// ============================================

export const sessionFileReader = new SessionFileReader()
