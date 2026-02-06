/**
 * Next.js Instrumentation
 * Runs once on server startup for initializing backend services
 */

import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Trap] Initializing backend services...')

    // Initialize OpenClaw WebSocket client
    const { initializeOpenClawClient } = await import('@/lib/openclaw')

    const client = initializeOpenClawClient()

    // Set up chat event handler
    client.onChatEvent(async (event) => {
      // Find the chat ID for this session using Convex
      const convex = getConvexClient()
      const chat = await convex.query(api.chats.findBySessionKey, {
        sessionKey: event.sessionKey
      })

      if (!chat) {
        // Not a Trap chat session, ignore
        return
      }

      const chatId = chat.id

      // Handle different event types
      switch (event.type) {
        case 'chat.typing.start':
          // Typing indicators handled by OpenClaw WebSocket and Convex reactivity
          break

        case 'chat.typing.end':
          // Typing indicators handled by OpenClaw WebSocket and Convex reactivity
          break

        case 'chat.delta':
          // Deltas streamed via OpenClaw WebSocket
          break

        case 'chat.message':
          if (event.message) {
            // Extract text content from message
            const content = typeof event.message.content === 'string'
              ? event.message.content
              : event.message.content
                  .filter((b: {type: string; text?: string}) => b.type === 'text' && b.text)
                  .map((b: {text?: string}) => b.text!)
                  .join('\n')

            // Check for duplicate via run_id using Convex
            let messageId: string | null = null
            if (event.runId) {
              const existing = await convex.query(api.chats.getMessageByRunId, {
                runId: event.runId
              })
              if (existing) {
                console.log('[Messages] Skipping duplicate message with run_id:', event.runId)
                messageId = existing.id
              }
            }

            // Save message to Convex if not a duplicate
            if (!messageId && content.trim()) {
              const author = event.message.role === 'assistant' ? 'ada' : event.message.role
              const saved = await convex.mutation(api.chats.createMessage, {
                chat_id: chatId,
                author,
                content,
                run_id: event.runId,
                session_key: event.sessionKey,
                is_automated: false,
              })
              messageId = saved.id
              console.log('[Messages] Saved message:', { id: messageId, chatId, author, runId: event.runId })
            }

            // Real-time updates handled by Convex reactivity
          }
          break

        case 'chat.error':
          console.error('[Trap] Chat error:', event.errorMessage)
          break
      }
    })

    console.log('[Trap] Backend services initialized')
  }
}
