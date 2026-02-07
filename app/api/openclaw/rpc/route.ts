import { NextRequest, NextResponse } from "next/server"
import { getOpenClawClient, initializeOpenClawClient } from "@/lib/openclaw/client"

/**
 * POST /api/openclaw/rpc
 *
 * Proxy browser RPC calls to the OpenClaw gateway via the persistent
 * server-side WebSocket client.  The gateway only speaks WS for RPC —
 * there is no HTTP /rpc endpoint — so we bridge through the WS client.
 */

/** Max time to wait for WS connection before returning error (ms) */
const CONNECTION_TIMEOUT_MS = 10000

/** Poll interval for checking connection status (ms) */
const CONNECTION_POLL_MS = 100

/** Ensure the WS client is connected (lazy init). */
function ensureClient() {
  const client = getOpenClawClient()
  if (client.getStatus() === "disconnected") {
    initializeOpenClawClient()
  }
  return client
}

/** Wait for the client to connect, with timeout */
async function waitForConnection(
  client: ReturnType<typeof getOpenClawClient>,
  timeoutMs: number
): Promise<boolean> {
  if (client.getStatus() === "connected") {
    return true
  }

  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    if (client.getStatus() === "connected") {
      return true
    }
    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, CONNECTION_POLL_MS))
  }
  
  return client.getStatus() === "connected"
}

export async function POST(request: NextRequest) {
  let body: { id?: string; method?: string; params?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { type: "res", id: "unknown", ok: false, error: { message: "Invalid JSON body" } },
      { status: 400 },
    )
  }

  const { id = "unknown", method, params } = body
  if (!method) {
    return NextResponse.json(
      { type: "res", id, ok: false, error: { message: "Missing 'method' in request body" } },
      { status: 400 },
    )
  }

  const client = ensureClient()

  // Wait for connection with longer timeout and polling
  const isConnected = await waitForConnection(client, CONNECTION_TIMEOUT_MS)

  if (!isConnected) {
    // Return 503 with Retry-After header to help client-side backoff
    return NextResponse.json(
      { type: "res", id, ok: false, error: { message: "OpenClaw gateway not connected" } },
      { 
        status: 503,
        headers: {
          "Retry-After": "5",
        }
      },
    )
  }

  try {
    const payload = await client.rpc(method, params)
    return NextResponse.json({ type: "res", id, ok: true, payload })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { type: "res", id, ok: false, error: { message } },
      { status: 502 },
    )
  }
}
