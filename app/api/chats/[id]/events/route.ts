import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { addConnection, removeConnection } from "@/lib/sse/connections"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/chats/[id]/events — SSE stream for chat updates
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  
  // Verify chat exists
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(id)
  if (!chat) {
    return new Response("Chat not found", { status: 404 })
  }

  let pingInterval: NodeJS.Timeout | null = null
  let activeController: ReadableStreamDefaultController | null = null

  const stream = new ReadableStream({
    start(controller) {
      activeController = controller
      
      // Add to global connections registry
      addConnection(id, controller)
      
      // Send initial connection event
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`event: connected\ndata: {"chatId":"${id}"}\n\n`))
      
      // Keep-alive ping every 15 seconds
      pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:ping\n\n`))
        } catch {
          // Connection closed
          if (pingInterval) clearInterval(pingInterval)
        }
      }, 15000)
      
      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        if (pingInterval) clearInterval(pingInterval)
        if (activeController) removeConnection(id, activeController)
      })
    },
    cancel() {
      if (pingInterval) clearInterval(pingInterval)
      if (activeController) removeConnection(id, activeController)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  })
}
