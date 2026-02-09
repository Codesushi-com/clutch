import { NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

// GET /api/gate — Check if coordinator should wake
export async function GET() {
  try {
    const convex = getConvexClient()
    const status = await convex.query(api.gate.getStatus, {})

    // Log check (could be persisted to DB)
    console.log(
      `[gate_check] needsAttention=${status.needsAttention} ` +
      `ready=${status.details.readyTasks} pending=${status.details.pendingInputs} ` +
      `dispatch=${status.details.pendingDispatch} stuck=${status.details.stuckTasks} ` +
      `review=${status.details.reviewTasks} escalations=${status.details.unreadEscalations} ` +
      `signals=${status.details.pendingSignals}`
    )

    return NextResponse.json(status)
  } catch (error) {
    console.error("[Gate API] Error checking gate status:", error)
    return NextResponse.json(
      { error: "Failed to check gate status" },
      { status: 500 }
    )
  }
}
