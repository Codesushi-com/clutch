"use server"

import { WebSocketServer, WebSocket } from "ws"
import { IncomingMessage } from "http"
import type { Duplex } from "stream"

// Store for all connected clients
const clients = new Set<WebSocket>()

// Message types for board updates
export type BoardMessage =
  | { type: "task_created"; task: unknown }
  | { type: "task_updated"; task: unknown }
  | { type: "task_deleted"; taskId: string }
  | { type: "task_moved"; taskId: string; status: string; position: number; task?: unknown }
  | { type: "ping" }
  | { type: "pong" }

let wss: WebSocketServer | null = null

/**
 * Initialize the WebSocket server by attaching to an existing HTTP server.
 * This is called from the Next.js route handler when an upgrade request comes in.
 */
export function initWebSocketServer() {
  if (wss) {
    return wss
  }

  // Create WebSocket server without its own HTTP server
  // We'll handle the upgrade manually in the route handler
  wss = new WebSocketServer({ noServer: true })

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const clientIp = req.socket.remoteAddress
    console.log(`[WebSocket] Client connected from ${clientIp}`)

    clients.add(ws)

    // Send welcome message
    ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }))

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as BoardMessage

        // Handle ping/pong for keepalive
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }))
          return
        }

        console.log("[WebSocket] Received:", message.type)
      } catch (error) {
        console.error("[WebSocket] Invalid message:", error)
      }
    })

    ws.on("close", () => {
      console.log("[WebSocket] Client disconnected")
      clients.delete(ws)
    })

    ws.on("error", (error) => {
      console.error("[WebSocket] Client error:", error)
      clients.delete(ws)
    })
  })

  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error)
  })

  console.log("[WebSocket] Server initialized")
  return wss
}

/**
 * Handle HTTP upgrade request for WebSocket.
 * This is called from the route handler to upgrade the connection.
 */
export function handleWebSocketUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const server = initWebSocketServer()

  server.handleUpgrade(request, socket, head, (ws) => {
    server.emit("connection", ws, request)
  })
}

/**
 * Broadcast a message to all connected clients.
 * Used by API routes to notify clients of changes.
 */
export function broadcastMessage(message: BoardMessage) {
  const messageStr = JSON.stringify(message)
  let sent = 0

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr)
      sent++
    }
  }

  console.log(`[WebSocket] Broadcast ${message.type} to ${sent} clients`)
  return sent
}

/**
 * Get the number of connected clients.
 */
export function getConnectedClientCount(): number {
  return clients.size
}

/**
 * Check if the WebSocket server is initialized.
 */
export function isWebSocketServerInitialized(): boolean {
  return wss !== null
}
