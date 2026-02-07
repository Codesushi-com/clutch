/**
 * Custom Next.js server with WebSocket support.
 *
 * This server wraps the Next.js request handler and adds WebSocket
 * upgrade handling on the same port (3002).
 *
 * Usage:
 *   node server.ts        # Production
 *   pnpm dev              # Development (uses next dev with custom server)
 *
 * Note: In development, we use a separate approach via middleware
 * since Next.js dev server doesn't easily support custom upgrades.
 */

import { createServer } from "http"
import { parse } from "url"
import next from "next"
import { handleWebSocketUpgrade } from "./lib/websocket/server"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME || "0.0.0.0"
const port = parseInt(process.env.PORT || "3002", 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "/", true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error("Error handling request:", err)
      res.statusCode = 500
      res.end("Internal Server Error")
    }
  })

  // Handle WebSocket upgrade requests
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "/", false)

    // Only handle WebSocket upgrades for /api/ws
    if (pathname === "/api/ws") {
      console.log("[Server] WebSocket upgrade request")
      handleWebSocketUpgrade(request, socket, head)
    } else {
      // Reject other upgrade requests
      socket.destroy()
    }
  })

  server.listen(port, hostname, () => {
    console.log(
      `> Ready on http://${hostname}:${port} (WebSocket on ws://${hostname}:${port}/api/ws)`
    )
  })

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n> Shutting down gracefully...")
    server.close(() => {
      console.log("> Server closed")
      process.exit(0)
    })
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
})
