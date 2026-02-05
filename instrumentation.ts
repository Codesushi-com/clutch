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
    const { chatEvents } = await import('@/lib/sse/chat-events')
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
          chatEvents.emitTypingStart(chatId)
          break
          
        case 'chat.typing.end':
          chatEvents.emitTypingEnd(chatId)
          break
          
        case 'chat.delta':
          if (event.delta) {
            chatEvents.emitDelta(chatId, event.delta, event.runId)
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
              chatEvents.emitMessage(chatId, messageId, author, content, event.runId)
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
