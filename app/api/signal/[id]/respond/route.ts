import { NextRequest, NextResponse } from "next/server"
import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"
import { getOpenClawClient } from "@/lib/openclaw/client"

// POST /api/signal/[id]/respond — Respond to signal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  
  const { response } = body
  
  if (!response || typeof response !== "string") {
    return NextResponse.json(
      { error: "response is required and must be a string" },
      { status: 400 }
    )
  }
  
  try {
    const convex = getConvexClient()

    // First, get the signal to access session_key and original message
    const signal = await convex.query(api.signals.getById, { id })
    
    if (!signal) {
      return NextResponse.json(
        { error: "Signal not found" },
        { status: 404 }
      )
    }

    // Save response to Convex (this sets responded_at)
    await convex.mutation(api.signals.respond, {
      id,
      response,
    })

    // Set notification status to pending
    await convex.mutation(api.signals.updateNotificationStatus, {
      id,
      status: "pending",
    })

    // Send notification to agent session via OpenClaw
    let notificationStatus: "sent" | "failed" = "sent"
    let notificationError: string | undefined

    try {
      const openclaw = getOpenClawClient()
      
      // Ensure connection is established
      if (openclaw.getStatus() !== "connected") {
        openclaw.connect()
        // Wait a moment for connection (fire-and-forget approach)
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      // Format message with original question and human response
      const message = formatSignalResponse(signal.message, response, signal.kind)
      
      await openclaw.sendMessage(signal.session_key, message)
      console.log(`[Signal API] Notification sent to session ${signal.session_key}`)
    } catch (error) {
      notificationStatus = "failed"
      notificationError = error instanceof Error ? error.message : String(error)
      console.warn(`[Signal API] Failed to notify agent session ${signal.session_key}:`, notificationError)
      // Don't throw - we still saved the response, just couldn't notify
    }

    // Update signal with final notification status
    const finalSignal = await convex.mutation(api.signals.updateNotificationStatus, {
      id,
      status: notificationStatus,
      error: notificationError,
    })

    return NextResponse.json({
      success: true,
      signal: finalSignal,
      notificationSent: notificationStatus === "sent",
    })
  } catch (error) {
    console.error("[Signal API] Error responding to signal:", error)
    const message = error instanceof Error ? error.message : "Failed to respond to signal"
    
    if (message.includes("not found")) {
      return NextResponse.json(
        { error: "Signal not found" },
        { status: 404 }
      )
    }
    
    if (message.includes("already been responded")) {
      return NextResponse.json(
        { error: "Signal has already been responded to" },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

/**
 * Format a signal response message for the agent
 */
function formatSignalResponse(
  originalMessage: string,
  humanResponse: string,
  kind: string
): string {
  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1)
  
  return `[${kindLabel} Response from Human]\n\n` +
    `Original ${kind}:\n${originalMessage}\n\n` +
    `Response:\n${humanResponse}`
}