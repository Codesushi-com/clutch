"use client"

import { useEffect, useRef, useCallback } from "react"
import { usePageVisibility } from "./use-page-visibility"
import type { ChatMessage } from "@/lib/db/types"

type UseChatEventsOptions = {
  chatId: string
  onMessage?: (message: ChatMessage) => void
  onTyping?: (author: string, typing: boolean) => void
  onConnect?: () => void
  onRefreshMessages?: () => void
  enabled?: boolean
}

export function useChatEvents({
  chatId,
  onMessage,
  onTyping,
  onConnect,
  onRefreshMessages,
  enabled = true,
}: UseChatEventsOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const wasDisconnectedRef = useRef(false)
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
      
      // If we were previously disconnected, refetch messages to catch up
      if (wasDisconnectedRef.current) {
        console.log("[ChatEvents] Refetching messages after reconnection")
        onRefreshMessages?.()
        wasDisconnectedRef.current = false
      }
      
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
      wasDisconnectedRef.current = true
      
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
  }, [chatId, enabled, onMessage, onTyping, onConnect, onRefreshMessages])

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

  // Handle page visibility changes to refetch messages when tab becomes visible
  const { isVisible, onVisible } = usePageVisibility()
  const lastVisibilityTimeRef = useRef<number>(0)
  const wasHiddenRef = useRef(false)

  // Initialize timestamp ref on mount
  useEffect(() => {
    lastVisibilityTimeRef.current = Date.now()
  }, [])

  useEffect(() => {
    const handleTabVisible = () => {
      // Only refetch if we were actually hidden for more than a few seconds
      const now = Date.now()
      const timeSinceLastCheck = now - lastVisibilityTimeRef.current
      
      console.log("[ChatEvents] Tab became visible, was hidden:", wasHiddenRef.current, "time since:", timeSinceLastCheck)
      
      if (wasHiddenRef.current && timeSinceLastCheck > 3000) {
        console.log("[ChatEvents] Refetching messages after tab switch")
        onRefreshMessages?.()
      }
      
      wasHiddenRef.current = false
      lastVisibilityTimeRef.current = now
    }

    const cleanup = onVisible(handleTabVisible)
    return cleanup
  }, [onVisible, onRefreshMessages])

  // Track when tab becomes hidden
  useEffect(() => {
    if (!isVisible) {
      console.log("[ChatEvents] Tab became hidden")
      wasHiddenRef.current = true
      lastVisibilityTimeRef.current = Date.now()
    }
  }, [isVisible])

  return {
    reconnect: connect,
    isVisible,
  }
}
