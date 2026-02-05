import { NextRequest, NextResponse } from "next/server"
import { convexServerClient } from "@/lib/convex-server"
import type { Signal } from "@/lib/db/types"

// POST /api/signal/[id]/respond — Respond to signal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const { response } = body
    
    if (!response || typeof response !== "string") {
      return NextResponse.json(
        { error: "response is required and must be a string" },
        { status: 400 }
      )
    }

    const signal = await convexServerClient.mutation(
      // @ts-expect-error - Convex self-hosted uses any api type
      { name: "signals/respond" },
      {
        id,
        response,
      }
    ) as Signal

    // TODO: Integrate with OpenClaw sessions_send to notify the agent
    // This will be wired later when OpenClaw session integration is ready

    return NextResponse.json({
      success: true,
      signal,
      // TODO: Add session notification status once OpenClaw integration is ready
    })
  } catch (error) {
    console.error("[signals/respond] Error:", error)
    
    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json(
          { error: "Signal not found" },
          { status: 404 }
        )
      }
      if (error.message.includes("already been responded")) {
        return NextResponse.json(
          { error: "Signal has already been responded to" },
          { status: 409 }
        )
      }
    }
    
    return NextResponse.json(
      { error: "Failed to respond to signal", details: String(error) },
      { status: 500 }
    )
  }
}
