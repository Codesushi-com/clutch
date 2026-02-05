'use client'

/**
 * Chat SSE Hook
 * Subscribes to Trap's SSE endpoint for reliable message delivery
 * Replaces direct OpenClaw WebSocket for receiving messages
 */

import { useEffect, useRef, useCallback, useState } from 'react'

type MessageData = {
  id: string
  author: string
  content: string
  runId?: string
  timestamp: number
}

type DeltaData = {
  delta: string
  runId?: string
  timestamp: number
}

interface UseChatSSEOptions {
  chatId: string | null
  onMessage?: (message: MessageData) => void
  onTypingStart?: () => void
  onTypingEnd?: () => void
  onDelta?: (delta: string, runId?: string) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

export function useChatSSE({
  chatId,
  onMessage,
  onTypingStart,
  onTypingEnd,
  onDelta,
  onConnected,
  onDisconnected
}: UseChatSSEOptions) {
  const [connected, setConnected] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  
  // Store callbacks in refs to avoid re-subscribing on every render
  const callbacksRef = useRef({ onMessage, onTypingStart, onTypingEnd, onDelta, onConnected, onDisconnected })
  useEffect(() => {
    callbacksRef.current = { onMessage, onTypingStart, onTypingEnd, onDelta, onConnected, onDisconnected }
  }, [onMessage, onTypingStart, onTypingEnd, onDelta, onConnected, onDisconnected])
  
  const connect = useCallback(() => {
    if (!chatId) return
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    console.log('[ChatSSE] Connecting to', chatId.substring(0, 8) + '...')
    
    const eventSource = new EventSource(`/api/chats/${chatId}/stream`)
    eventSourceRef.current = eventSource
    
    eventSource.addEventListener('connected', () => {
      console.log('[ChatSSE] Connected')
      setConnected(true)
      reconnectAttempts.current = 0
      callbacksRef.current.onConnected?.()
    })
    
    eventSource.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data) as MessageData
        console.log('[ChatSSE] Received message:', data.id?.substring(0, 8))
        callbacksRef.current.onMessage?.(data)
      } catch (error) {
        console.error('[ChatSSE] Failed to parse message:', error)
      }
    })
    
    eventSource.addEventListener('typing.start', () => {
      setIsTyping(true)
      callbacksRef.current.onTypingStart?.()
    })
    
    eventSource.addEventListener('typing.end', () => {
      setIsTyping(false)
      callbacksRef.current.onTypingEnd?.()
    })
    
    eventSource.addEventListener('delta', (e) => {
      try {
        const data = JSON.parse(e.data) as DeltaData
        callbacksRef.current.onDelta?.(data.delta, data.runId)
      } catch (error) {
        console.error('[ChatSSE] Failed to parse delta:', error)
      }
    })
    
    eventSource.onerror = () => {
      console.log('[ChatSSE] Connection error')
      setConnected(false)
      setIsTyping(false)
      callbacksRef.current.onDisconnected?.()
      
      // Schedule reconnect
      if (reconnectAttempts.current < 10) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        console.log(`[ChatSSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    }
  }, [chatId])
  
  // Connect when chatId changes
  useEffect(() => {
    if (!chatId) {
      // Disconnect if no chatId
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setConnected(false)
      setIsTyping(false)
      return
    }
    
    connect()
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [chatId, connect])
  
  // Reconnect on page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && chatId && !connected) {
        console.log('[ChatSSE] Page became visible, reconnecting...')
        reconnectAttempts.current = 0
        connect()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [chatId, connected, connect])
  
  return {
    connected,
    isTyping
  }
}
