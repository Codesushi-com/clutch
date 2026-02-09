import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import type { SignalKind, SignalSeverity } from "@/lib/types"

// GET /api/signal — List pending signals (for gate)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("task_id")
  const kind = searchParams.get("kind")
  const onlyBlocking = searchParams.get("blocking") === "true"
  const onlyUnresponded = searchParams.get("unresponded") === "true"
  const limit = parseInt(searchParams.get("limit") || "50")
  
  try {
    const convex = getConvexClient()
    const result = await convex.query(api.signals.getAll, {
      ...(taskId && { taskId }),
      ...(kind && { kind: kind as SignalKind }),
      ...(onlyBlocking && { onlyBlocking: true }),
      ...(onlyUnresponded && { onlyUnresponded: true }),
      limit,
    })

    return NextResponse.json({
      signals: result.signals,
      pendingCount: result.pendingCount,
    })
  } catch (error) {
    console.error("[Signal API] Error fetching signals:", error)
    return NextResponse.json(
      { error: "Failed to fetch signals" },
      { status: 500 }
    )
  }
}

// POST /api/signal — Create signal
export async function POST(request: NextRequest) {
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
  
  try {
    const convex = getConvexClient()

    const signal = await convex.mutation(api.signals.create, {
      taskId,
      sessionKey,
      agentId,
      kind,
      severity,
      message,
    })

    return NextResponse.json({ 
      signalId: signal.id,
      blocking: Boolean(signal.blocking),
      signal,
    }, { status: 201 })
  } catch (error) {
    console.error("[Signal API] Error creating signal:", error)
    const message = error instanceof Error ? error.message : "Failed to create signal"
    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
