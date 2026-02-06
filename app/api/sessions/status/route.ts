import { execFileSync } from "node:child_process"
import { NextRequest, NextResponse } from "next/server"

export interface SessionStatusInfo {
  id: string
  status: 'running' | 'idle' | 'completed' | 'error' | 'cancelled' | 'not_found'
  updatedAt?: string
  createdAt?: string
  model?: string
  tokens?: {
    input: number
    output: number
    total: number
  }
  lastActivity?: string
  isActive: boolean
  isIdle: boolean
  isStuck: boolean
}

/**
 * Raw session data from `openclaw sessions --json`.
 */
interface OpenClawSession {
  key: string
  kind: string
  updatedAt: number
  ageMs: number
  sessionId: string
  abortedLastRun: boolean
  inputTokens: number
  outputTokens: number
  totalTokens: number
  model: string
  contextTokens: number
}

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const COMPLETED_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Fetch all active sessions from the OpenClaw CLI.
 *
 * Uses `openclaw sessions --json --active N` which reads the local sessions
 * file. This is the same approach used by worker/sessions.ts and avoids the
 * non-existent HTTP RPC endpoint that was causing "fetch failed" errors.
 */
function fetchOpenClawSessions(activeMinutes = 60): OpenClawSession[] {
  try {
    const result = execFileSync(
      "openclaw",
      ["sessions", "--json", "--active", String(activeMinutes)],
      { encoding: "utf-8", timeout: 10_000 },
    )
    const data = JSON.parse(result) as { sessions?: OpenClawSession[] }
    return data.sessions ?? []
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[sessions/status] Failed to poll openclaw sessions: ${message}`)
    return []
  }
}

/**
 * Derive status info from a raw OpenClaw session.
 */
function toStatusInfo(session: OpenClawSession): SessionStatusInfo {
  const now = Date.now()
  const lastActivityMs = session.updatedAt || now
  const timeSinceActivity = now - lastActivityMs

  const isActive = timeSinceActivity < IDLE_THRESHOLD_MS
  const isIdle = timeSinceActivity >= IDLE_THRESHOLD_MS && timeSinceActivity < COMPLETED_THRESHOLD_MS
  const isStuck = timeSinceActivity >= COMPLETED_THRESHOLD_MS

  let status: SessionStatusInfo['status'] = 'idle'
  if (isActive) status = 'running'
  else if (isStuck) status = 'completed'

  const updatedAt = session.updatedAt
    ? new Date(session.updatedAt).toISOString()
    : undefined

  return {
    id: session.key,
    status,
    updatedAt,
    model: session.model,
    tokens: {
      input: session.inputTokens || 0,
      output: session.outputTokens || 0,
      total: session.totalTokens || 0,
    },
    lastActivity: updatedAt,
    isActive,
    isIdle,
    isStuck,
  }
}

/**
 * POST /api/sessions/status
 * Get status for multiple session IDs.
 *
 * Body: { sessionIds: string[] }
 * Returns: { sessions: Record<string, SessionStatusInfo> }
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionIds } = await request.json()

    if (!Array.isArray(sessionIds)) {
      return NextResponse.json(
        { error: "sessionIds must be an array" },
        { status: 400 },
      )
    }

    // One CLI call to get all active sessions, then match locally
    const allSessions = fetchOpenClawSessions(60)
    const sessionsByKey = new Map(allSessions.map((s) => [s.key, s]))

    const sessions: Record<string, SessionStatusInfo> = {}

    for (const sessionId of sessionIds) {
      if (!sessionId || typeof sessionId !== "string") {
        sessions[sessionId] = {
          id: sessionId,
          status: "not_found",
          isActive: false,
          isIdle: false,
          isStuck: false,
        }
        continue
      }

      const match = sessionsByKey.get(sessionId)

      if (!match) {
        sessions[sessionId] = {
          id: sessionId,
          status: "not_found",
          isActive: false,
          isIdle: false,
          isStuck: false,
        }
        continue
      }

      sessions[sessionId] = toStatusInfo(match)
    }

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("Failed to get session status:", error)
    return NextResponse.json(
      { error: "Failed to get session status", details: String(error) },
      { status: 500 },
    )
  }
}

/**
 * GET /api/sessions/status?sessionId=xxx
 * Get status for a single session ID (for testing).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId parameter is required" },
      { status: 400 },
    )
  }

  const mockRequest = {
    json: async () => ({ sessionIds: [sessionId] }),
  } as NextRequest

  const response = await POST(mockRequest)
  const data = await response.json()

  return NextResponse.json({
    session: data.sessions?.[sessionId] || null,
  })
}
