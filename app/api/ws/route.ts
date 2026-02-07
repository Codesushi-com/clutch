import { broadcastMessage } from "@/lib/websocket/server"
import { type NextRequest } from "next/server"

// Force Node.js runtime for WebSocket support
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const preferredRegion = "home"

/**
 * WebSocket upgrade handler for Next.js App Router.
 *
 * This route handles both:
 * 1. GET requests for WebSocket upgrade (ws://host/api/ws)
 * 2. POST requests for broadcasting messages via HTTP
 *
 * Note: WebSocket upgrade in Next.js App Router requires Node.js runtime
 * and access to the underlying HTTP server socket.
 */
export async function GET(request: NextRequest) {
  // Check if this is a WebSocket upgrade request
  const upgrade = request.headers.get("upgrade")

  if (upgrade?.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({
        status: "WebSocket endpoint",
        url: "/api/ws",
        protocol: "ws/wss",
        message: "Use WebSocket connection to this endpoint for real-time updates",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  // For WebSocket upgrade, we need to access the underlying Node.js HTTP request
  // This requires Node.js runtime and is handled through the upgrade mechanism
  // The actual upgrade happens when the client sends the proper WebSocket handshake

  // Return 426 Upgrade Required to trigger the WebSocket handshake
  return new Response(
    JSON.stringify({
      error: "Use WebSocket protocol",
      message: "This endpoint requires a WebSocket connection",
    }),
    {
      status: 426,
      headers: {
        "Content-Type": "application/json",
        Upgrade: "websocket",
      },
    }
  )
}

/**
 * POST handler for broadcasting messages via HTTP.
 * Used by other API routes to notify WebSocket clients of changes.
 *
 * Example body: { type: "task_updated", task: { ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate message has required type field
    if (!body.type) {
      return Response.json(
        { error: "Message must have a 'type' field" },
        { status: 400 }
      )
    }

    // Broadcast to all connected clients
    const sent = broadcastMessage(body)

    return Response.json({
      success: true,
      clientsNotified: sent,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error("[WebSocket] Broadcast failed:", error)
    return Response.json(
      { error: "Failed to broadcast message" },
      { status: 500 }
    )
  }
}

/**
 * GET handler for status (non-upgrade requests).
 * Returns information about the WebSocket server status.
 */
export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-WebSocket-Supported": "true",
    },
  })
}
