/**
 * Shared SSE connections registry
 * Uses globalThis to persist across Next.js route invocations in single-process mode
 */

type ChatConnection = ReadableStreamDefaultController

declare global {
  // eslint-disable-next-line no-var
  var chatConnections: Map<string, Set<ChatConnection>> | undefined
}

// Get or create the global connections map
function getConnections(): Map<string, Set<ChatConnection>> {
  if (!globalThis.chatConnections) {
    globalThis.chatConnections = new Map()
  }
  return globalThis.chatConnections
}

export function addConnection(chatId: string, controller: ChatConnection) {
  const connections = getConnections()
  if (!connections.has(chatId)) {
    connections.set(chatId, new Set())
  }
  connections.get(chatId)!.add(controller)
  console.log(`[SSE] Connection added for chat ${chatId}, total: ${connections.get(chatId)!.size}`)
}

export function removeConnection(chatId: string, controller: ChatConnection) {
  const connections = getConnections()
  connections.get(chatId)?.delete(controller)
  if (connections.get(chatId)?.size === 0) {
    connections.delete(chatId)
  }
  console.log(`[SSE] Connection removed for chat ${chatId}`)
}

export function broadcastToChat(chatId: string, event: { type: string; data: unknown }) {
  const connections = getConnections()
  const chatConns = connections.get(chatId)
  
  if (!chatConns || chatConns.size === 0) {
    console.log(`[SSE] No connections for chat ${chatId}`)
    return
  }

  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
  const encoder = new TextEncoder()
  const encoded = encoder.encode(message)

  console.log(`[SSE] Broadcasting ${event.type} to ${chatConns.size} connections for chat ${chatId}`)
  
  for (const controller of chatConns) {
    try {
      controller.enqueue(encoded)
    } catch (error) {
      console.error(`[SSE] Failed to send to connection:`, error)
      // Remove dead connections
      chatConns.delete(controller)
    }
  }
}

export function getConnectionCount(chatId: string): number {
  const connections = getConnections()
  return connections.get(chatId)?.size ?? 0
}
