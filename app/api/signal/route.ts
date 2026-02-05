import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"
import type { Signal, SignalKind, SignalSeverity } from "@/lib/db/types"

// GET /api/signal — List pending signals (for gate)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get("task_id")
    const kind = searchParams.get("kind")
    const onlyBlocking = searchParams.get("blocking") === "true"
    const onlyUnresponded = searchParams.get("unresponded") === "true"
    const limit = parseInt(searchParams.get("limit") || "50")

    const result = await convexServerClient.query(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "signals/getAll" },
      {
        taskId: taskId || undefined,
        kind: kind as SignalKind || undefined,
        onlyBlocking: onlyBlocking || undefined,
        onlyUnresponded: onlyUnresponded || undefined,
        limit,
      }
    ) as { signals: Signal[]; pendingCount: number }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[signals/get] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch signals", details: String(error) },
      { status: 500 }
    )
  }
}

// POST /api/signal — Create signal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { 
      taskId,
      sessionKey,
      agentId,
      kind,
      severity = "normal",
      message,
    } = body

    if (!taskId || !sessionKey || !agentId || !kind || !message) {
      return NextResponse.json(
        { error: "taskId, sessionKey, agentId, kind, and message are required" },
        { status: 400 }
      )
    }

    // Validate kind
    const validKinds: SignalKind[] = ["question", "blocker", "alert", "fyi"]
    if (!validKinds.includes(kind)) {
      return NextResponse.json(
        { error: `Invalid kind. Must be one of: ${validKinds.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate severity
    const validSeverities: SignalSeverity[] = ["normal", "high", "critical"]
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
        { status: 400 }
      )
    }

    const signal = await convexServerClient.mutation(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "signals/create" },
      {
        taskId,
        sessionKey,
        agentId,
        kind,
        severity,
        message,
      }
    ) as Signal

    return NextResponse.json({ 
      signalId: signal.id,
      blocking: Boolean(signal.blocking),
      signal,
    }, { status: 201 })
  } catch (error) {
    console.error("[signals/create] Error:", error)
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create signal", details: String(error) },
      { status: 500 }
    )
  }
}
