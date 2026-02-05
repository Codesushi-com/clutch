import { NextRequest } from 'next/server'
import { chatEvents } from '@/lib/sse/chat-events'

/**
 * GET /api/chats/[id]/stream
 * Server-Sent Events endpoint for real-time chat updates
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await params
  
  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable Nginx buffering
  })
  
  // Create readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      // Helper to send SSE event
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }
      
      // Send initial connection event
      sendEvent('connected', { chatId, timestamp: Date.now() })
      
      // Subscribe to chat events
      const unsubscribe = chatEvents.subscribe(chatId, (event) => {
        try {
          sendEvent(event.type, event.data)
        } catch (error) {
          // Stream might be closed
          console.error('[SSE] Error sending event:', error)
        }
      })
      
      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.log(`[SSE] Client disconnected from chat ${chatId.substring(0, 8)}...`)
        unsubscribe()
        controller.close()
      })
      
      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          const ping = `: ping ${Date.now()}\n\n`
          controller.enqueue(encoder.encode(ping))
        } catch {
          // Stream closed
          clearInterval(pingInterval)
        }
      }, 30000)
      
      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval)
      })
    }
  })
  
  return new Response(stream, { headers })
}

// Disable static generation for SSE endpoint
export const dynamic = 'force-dynamic'
