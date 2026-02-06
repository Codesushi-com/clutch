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

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const STUCK_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

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

function deriveStatus(session: OpenClawSession): "running" | "idle" | "error" {
  const timeSinceActivity = session.ageMs ?? (Date.now() - (session.updatedAt || Date.now()))
  if (timeSinceActivity < IDLE_THRESHOLD_MS) return "running"
  if (timeSinceActivity >= STUCK_THRESHOLD_MS) return "error"
  return "idle"
}

/**
 * GET /api/sessions/list?activeMinutes=60&limit=100
 *
 * Returns sessions from the OpenClaw CLI, formatted for the frontend Session type.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const activeMinutes = parseInt(searchParams.get("activeMinutes") || "60", 10)
  const limit = parseInt(searchParams.get("limit") || "100", 10)

  const rawSessions = fetchOpenClawSessions(activeMinutes)

  const sessions = rawSessions.slice(0, limit).map((s) => {
    const updatedAt = s.updatedAt
      ? new Date(s.updatedAt).toISOString()
      : new Date().toISOString()

    return {
      id: s.key,
      name: s.key?.split(":").pop() || "unknown",
      type: mapKind(s.kind || "main"),
      model: s.model || "unknown",
      status: deriveStatus(s),
      updatedAt,
      createdAt: updatedAt,
      tokens: {
        input: s.inputTokens || 0,
        output: s.outputTokens || 0,
        total: s.totalTokens || 0,
      },
    }
  })

  return NextResponse.json({ sessions, total: sessions.length })
}
