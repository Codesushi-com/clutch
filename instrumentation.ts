/**
 * Next.js Instrumentation
 * Runs once on server startup for initializing backend services
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Trap] Initializing backend services...')
    
    // Initialize OpenClaw WebSocket client
    const { initializeOpenClawClient, getOpenClawClient } = await import('@/lib/openclaw')
    
    const client = initializeOpenClawClient()
    
    // Set up chat event handler to save messages
    client.onChatEvent(async (event) => {
      console.log('[Trap] Received chat event:', event.type, event.sessionKey)
      
      // Import database functions dynamically to avoid edge runtime issues
      if (event.type === 'chat.message' && event.message) {
        try {
          // TODO: Save message to database (next ticket)
          // const { saveMessage } = await import('@/lib/db/messages')
          // await saveMessage(event.sessionKey, event.message, event.runId)
          console.log('[Trap] Would save message:', {
            sessionKey: event.sessionKey,
            role: event.message.role,
            runId: event.runId
          })
        } catch (error) {
          console.error('[Trap] Failed to save message:', error)
        }
      }
    })
    
    console.log('[Trap] Backend services initialized')
  }
}
