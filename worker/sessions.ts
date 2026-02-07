import { execFileSync } from "node:child_process"

/**
 * Session information from the OpenClaw sessions API
 */
export interface SessionInfo {
  /** Session key (unique identifier) */
  key: string
  /** Session kind (e.g., "agent") */
  kind: string
  /** Unix timestamp of last update (milliseconds) */
  updatedAt: number
  /** Age of the session in milliseconds */
  ageMs: number
  /** Session ID (short identifier) */
  sessionId: string
  /** Whether the session aborted on the last run */
  abortedLastRun: boolean
  /** Input tokens consumed */
  inputTokens: number
  /** Output tokens consumed */
  outputTokens: number
  /** Total tokens consumed */
  totalTokens: number
  /** Model being used */
  model: string
  /** Context window tokens */
  contextTokens: number
}

/**
 * Polls the OpenClaw sessions API to get status info about running agent sessions.
 *
 * The orchestrator uses this to check session health, token usage, and activity.
 */
export class SessionsPoller {
  /**
   * Poll all active sessions from OpenClaw CLI.
   *
   * Executes `openclaw sessions --json --active N` and parses the result.
   * Returns empty array on any error (CLI failure, JSON parse error).
   *
   * @param activeMinutes - Number of minutes to look back for active sessions (default: 30)
   * @returns Array of session info objects
   */
  async poll(activeMinutes = 30): Promise<SessionInfo[]> {
    try {
      const result = execFileSync("openclaw", ["sessions", "--json", "--active", String(activeMinutes)], {
        encoding: "utf-8",
        timeout: 10_000,
      })

      const data = JSON.parse(result) as { sessions?: SessionInfo[] }
      return data.sessions ?? []
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[SessionsPoller] Failed to poll sessions: ${message}`)
      return []
    }
  }

  /**
   * Find sessions matching a set of session keys.
   *
   * Polls for active sessions and returns a map of matching sessions by their keys.
   *
   * @param keys - Array of session keys to look for
   * @param activeMinutes - Number of minutes to look back (default: 30)
   * @returns Map of session key to session info
   */
  async findByKeys(keys: string[], activeMinutes?: number): Promise<Map<string, SessionInfo>> {
    const sessions = await this.poll(activeMinutes)
    const keySet = new Set(keys)
    const result = new Map<string, SessionInfo>()

    for (const session of sessions) {
      if (keySet.has(session.key)) {
        result.set(session.key, session)
      }
    }

    return result
  }

  /**
   * Check if a specific session is still active.
   *
   * Polls for active sessions and checks if the given session key is present.
   *
   * @param sessionKey - The session key to check
   * @param activeMinutes - Number of minutes to look back (default: 30)
   * @returns True if the session is active, false otherwise
   */
  async isActive(sessionKey: string, activeMinutes?: number): Promise<boolean> {
    const sessions = await this.poll(activeMinutes)
    return sessions.some((session) => session.key === sessionKey)
  }
}

/**
 * Default singleton instance for convenience.
 *
 * Use this for the global sessions poller, or create new SessionsPoller
 * instances for isolated testing.
 */
export const sessionsPoller = new SessionsPoller()
