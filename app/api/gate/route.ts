import { NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"

interface GateStatus {
  needsAttention: boolean
  reason: string | null
  details: {
    readyTasks: number
    pendingInputs: number
    stuckTasks: number
    reviewTasks: number
    pendingDispatch: number
    unreadEscalations: number
    pendingSignals: number
  }
  tasks?: {
    ready: Array<{ id: string; title: string; priority: string }>
    pendingInput: Array<{ taskId: string; taskTitle: string; author: string; content: string }>
    stuck: Array<{ id: string; title: string; assignee: string; hours: number }>
    review: Array<{ id: string; title: string; assignee: string }>
    pendingDispatch: Array<{ id: string; title: string; assignee: string }>
  }
  escalations?: Array<{ id: string; severity: string; message: string; agent: string }>
  signals?: Array<{ id: string; kind: string; severity: string; message: string; agent_id: string; task_id: string }>
  timestamp: number
}

// GET /api/gate — Check if coordinator should wake
export async function GET() {
  try {
    const status = await convexServerClient.query(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "gate/getStatus" },
      {}
    ) as GateStatus

    // Log check
    console.log(
      `[gate_check] needsAttention=${status.needsAttention} ` +
      `ready=${status.details.readyTasks} pending=${status.details.pendingInputs} ` +
      `dispatch=${status.details.pendingDispatch} stuck=${status.details.stuckTasks} ` +
      `review=${status.details.reviewTasks} escalations=${status.details.unreadEscalations} ` +
      `signals=${status.details.pendingSignals}`
    )

    return NextResponse.json(status)
  } catch (error) {
    console.error("[gate_check] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch gate status", details: String(error) },
      { status: 500 }
    )
  }
}
