import { execFileSync } from "node:child_process"
import { NextRequest, NextResponse } from "next/server"

/**
 * Raw session data from `openclaw sessions --json`.
 */
interface OpenClawSession {
  key: string
  kind: string
  updatedAt: number
  ageMs: number
  sessionId: string
  abortedLastRun?: boolean
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
  contextTokens?: number
  systemSent?: boolean
}

// Status thresholds:
// < 5min since last activity → running (actively working)
// 5-15min → idle (paused but may resume)
// > 15min → completed (done, no longer active)
const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const COMPLETED_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Fetch all active sessions from the OpenClaw CLI.
 *
 * Uses `openclaw sessions --json --active N` which reads the local sessions
 * file directly — no HTTP RPC dependency.
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
    console.warn(`[sessions/list] Failed to poll openclaw sessions: ${message}`)
    return []
  }
}

function mapKind(kind: string): "main" | "isolated" | "subagent" {
  switch (kind) {
    case "main":
    case "direct":
      return "main"
    case "isolated":
      return "isolated"
    case "subagent":
      return "subagent"
    default:
      return "main"
  }
}

function deriveStatus(session: OpenClawSession): "running" | "idle" | "completed" {
  const timeSinceActivity = session.ageMs ?? (Date.now() - (session.updatedAt || Date.now()))
  if (timeSinceActivity < IDLE_THRESHOLD_MS) return "running"
  if (timeSinceActivity >= COMPLETED_THRESHOLD_MS) return "completed"
  return "idle"
}

/**
 * GET /api/sessions/list?activeMinutes=60&limit=50
 *
 * Returns sessions from the OpenClaw CLI, formatted for the frontend Session type.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const activeMinutes = parseInt(searchParams.get("activeMinutes") || "60", 10)
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200)

  const rawSessions = fetchOpenClawSessions(activeMinutes)
  const now = Date.now()

  const sessions = rawSessions.slice(0, limit).map((s) => {
    const updatedAtMs = s.updatedAt || now
    const updatedAt = new Date(updatedAtMs).toISOString()
    const status = deriveStatus(s)

    // Estimate session duration from ageMs (time since last activity).
    // For completed sessions, updatedAt is the effective end time.
    const completedAt = status === "completed" ? updatedAt : undefined

    return {
      id: s.key,
      name: s.key?.split(":").pop() || "unknown",
      type: mapKind(s.kind || "main"),
      model: s.model || "unknown",
      status,
      updatedAt,
      createdAt: updatedAt,
      completedAt,
      tokens: {
        input: s.inputTokens || 0,
        output: s.outputTokens || 0,
        total: s.totalTokens || 0,
      },
    }
  })

  return NextResponse.json({ sessions, total: sessions.length })
}
