"use client"

import { useEffect, useRef, useCallback } from "react"
import type { ChatMessage } from "@/lib/db/types"

type UseChatEventsOptions = {
  chatId: string
  onMessage?: (message: ChatMessage) => void
  onTyping?: (author: string, typing: boolean) => void
  onConnect?: () => void
  enabled?: boolean
}

export function useChatEvents({
  chatId,
  onMessage,
  onTyping,
  onConnect,
  enabled = true,
}: UseChatEventsOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 10
  const baseReconnectDelay = 1000

  const connect = useCallback(() => {
    if (!enabled || !chatId) return
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    console.log("[ChatEvents] Connecting to", chatId)
    const eventSource = new EventSource(`/api/chats/${chatId}/events`)
    eventSourceRef.current = eventSource

    eventSource.addEventListener("connected", () => {
      console.log("[ChatEvents] Connected to", chatId)
      reconnectAttemptsRef.current = 0
      onConnect?.()
    })

    eventSource.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data) as ChatMessage
        console.log("[ChatEvents] New message:", message.id, message.content?.substring(0, 30))
        onMessage?.(message)
      } catch (error) {
        console.error("[ChatEvents] Failed to parse message:", error)
      }
    })

    eventSource.addEventListener("typing", (event) => {
      try {
        const data = JSON.parse(event.data) as { author: string; typing: boolean }
        onTyping?.(data.author, data.typing)
      } catch (error) {
        console.error("[ChatEvents] Failed to parse typing:", error)
      }
    })

    eventSource.onerror = (error) => {
      console.log("[ChatEvents] Connection error, will reconnect...", error)
      eventSource.close()
      eventSourceRef.current = null
      
      // Attempt to reconnect with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
          30000
        )
        reconnectAttemptsRef.current++
        
        console.log(`[ChatEvents] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      } else {
        console.error("[ChatEvents] Max reconnect attempts reached")
      }
    }
  }, [chatId, enabled, onMessage, onTyping, onConnect])

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [connect])

  return {
    reconnect: connect,
  }
}
