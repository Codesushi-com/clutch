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
    
    const client = initializeOpenClawClient()
    
    // Set up chat event handler to save messages
    client.onChatEvent(async (event) => {
      // Only log non-typing events to reduce noise
      if (!event.type.includes('typing')) {
        console.log('[Trap] Chat event:', event.type, event.sessionKey?.substring(0, 30))
      }
      
      // Save assistant messages to database with deduplication
      if (event.type === 'chat.message' && event.message) {
        try {
          const { saveOpenClawMessage } = await import('@/lib/db/messages')
          const messageId = saveOpenClawMessage(
            event.sessionKey,
            event.message,
            event.runId
          )
          
          if (messageId) {
            console.log('[Trap] Saved message:', messageId)
          }
        } catch (error) {
          console.error('[Trap] Failed to save message:', error)
        }
      }
    })
    
    console.log('[Trap] Backend services initialized')
  }
}
