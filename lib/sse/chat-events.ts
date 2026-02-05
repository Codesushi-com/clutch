/**
 * Chat SSE Event Emitter
 * Pub/sub system for broadcasting chat events to connected clients
 */

type ChatEventType = 
  | 'message'
  | 'typing.start'
  | 'typing.end'
  | 'delta'

interface ChatEvent {
  type: ChatEventType
  chatId: string
  data: {
    id?: string
    author?: string
    content?: string
    delta?: string
    runId?: string
    timestamp?: number
  }
}

type EventCallback = (event: ChatEvent) => void

class ChatEventEmitter {
  // Map of chatId -> Set of subscriber callbacks
  private subscribers = new Map<string, Set<EventCallback>>()
  
  /**
   * Subscribe to events for a specific chat
   * Returns unsubscribe function
   */
  subscribe(chatId: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(chatId)) {
      this.subscribers.set(chatId, new Set())
    }
    
    this.subscribers.get(chatId)!.add(callback)
    console.log(`[SSE] Subscriber added for chat ${chatId.substring(0, 8)}... (${this.subscribers.get(chatId)!.size} total)`)
    
    return () => {
      const subs = this.subscribers.get(chatId)
      if (subs) {
        subs.delete(callback)
        console.log(`[SSE] Subscriber removed for chat ${chatId.substring(0, 8)}... (${subs.size} remaining)`)
        if (subs.size === 0) {
          this.subscribers.delete(chatId)
        }
      }
    }
  }
  
  /**
   * Emit an event to all subscribers of a chat
   */
  emit(event: ChatEvent): void {
    const subs = this.subscribers.get(event.chatId)
    if (subs && subs.size > 0) {
      console.log(`[SSE] Emitting ${event.type} to ${subs.size} subscribers for chat ${event.chatId.substring(0, 8)}...`)
      subs.forEach(callback => {
        try {
          callback(event)
        } catch (error) {
          console.error('[SSE] Error in subscriber callback:', error)
        }
      })
    }
  }
  
  /**
   * Emit a new message event
   */
  emitMessage(chatId: string, messageId: string, author: string, content: string, runId?: string): void {
    this.emit({
      type: 'message',
      chatId,
      data: {
        id: messageId,
        author,
        content,
        runId,
        timestamp: Date.now()
      }
    })
  }
  
  /**
   * Emit typing indicator start
   */
  emitTypingStart(chatId: string): void {
    this.emit({
      type: 'typing.start',
      chatId,
      data: { timestamp: Date.now() }
    })
  }
  
  /**
   * Emit typing indicator end
   */
  emitTypingEnd(chatId: string): void {
    this.emit({
      type: 'typing.end',
      chatId,
      data: { timestamp: Date.now() }
    })
  }
  
  /**
   * Emit streaming delta
   */
  emitDelta(chatId: string, delta: string, runId?: string): void {
    this.emit({
      type: 'delta',
      chatId,
      data: { delta, runId, timestamp: Date.now() }
    })
  }
  
  /**
   * Get subscriber count for a chat
   */
  getSubscriberCount(chatId: string): number {
    return this.subscribers.get(chatId)?.size || 0
  }
}

// Singleton instance
export const chatEvents = new ChatEventEmitter()

export type { ChatEvent, ChatEventType }
