/**
 * Next.js Instrumentation
 * Runs once on server startup for initializing backend services
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Trap] Initializing backend services...')
    
    // Initialize OpenClaw WebSocket client
    const { initializeOpenClawClient } = await import('@/lib/openclaw')
    const { broadcastToChat } = await import('@/lib/sse/connections')
    const { findChatBySessionKey, saveOpenClawMessage } = await import('@/lib/db/messages')
    
    const client = initializeOpenClawClient()
    
    // Set up chat event handler
    client.onChatEvent(async (event) => {
      // Find the chat ID for this session
      const chatId = findChatBySessionKey(event.sessionKey)
      
      if (!chatId) {
        // Not a Trap chat session, ignore
        return
      }
      
      // Handle different event types
      switch (event.type) {
        case 'chat.typing.start':
          broadcastToChat(chatId, {
            type: 'typing',
            data: { chatId, author: 'ada', typing: true }
          })
          break
          
        case 'chat.typing.end':
          broadcastToChat(chatId, {
            type: 'typing',
            data: { chatId, author: 'ada', typing: false }
          })
          break
          
        case 'chat.delta':
          if (event.delta) {
            broadcastToChat(chatId, {
              type: 'delta',
              data: { delta: event.delta, runId: event.runId, timestamp: Date.now() }
            })
          }
          break
          
        case 'chat.message':
          if (event.message) {
            // Save to database with deduplication
            const messageId = saveOpenClawMessage(
              event.sessionKey,
              event.message,
              event.runId
            )
            
            // Emit to SSE subscribers (only if saved, i.e., not a duplicate)
            if (messageId && event.message.content) {
              const content = typeof event.message.content === 'string' 
                ? event.message.content
                : event.message.content
                    .filter(b => b.type === 'text' && b.text)
                    .map(b => b.text!)
                    .join('\n')
              
              const author = event.message.role === 'assistant' ? 'ada' : event.message.role
              broadcastToChat(chatId, {
                type: 'message',
                data: {
                  id: messageId,
                  chat_id: chatId,
                  author,
                  content,
                  run_id: event.runId,
                  created_at: Date.now()
                }
              })
            }
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
