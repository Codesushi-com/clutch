"use client"

import { useEffect, useRef, useState } from 'react'
import type { WebSocketMessage } from './server'

interface UseWebSocketOptions {
  projectId: string
  userId?: string
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  autoReconnect?: boolean
}

export function useWebSocket({
  projectId,
  userId = 'anonymous',
  onMessage,
  onConnect,
  onDisconnect,
  autoReconnect = true
}: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [subscribers, setSubscribers] = useState<string[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectDelayRef = useRef(1000)

  const getWebSocketUrl = () => {
    if (typeof window === 'undefined') return ''
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = process.env.NODE_ENV === 'production' ? 
      (window.location.port ? `:${window.location.port}` : '') : ':3003'
    
    return `${protocol}//${host}${port}`
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'unsubscribe',
          projectId
        }))
      }
      
      wsRef.current.close()
      wsRef.current = null
    }

    setConnected(false)
    setConnecting(false)
    setSubscribers([])
  }

  const connect = () => {
    if (connecting || connected) {
      return
    }

    setConnecting(true)
    setError(null)

    try {
      const wsUrl = getWebSocketUrl()
      if (!wsUrl) return

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setConnecting(false)
        setError(null)
        reconnectAttempts.current = 0
        reconnectDelayRef.current = 1000

        ws.send(JSON.stringify({
          type: 'subscribe',
          projectId,
          userId
        }))

        onConnect?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)

          if (message.type === 'presence:join') {
            setSubscribers(prev => {
              if (!prev.includes(message.data.userId)) {
                return [...prev, message.data.userId]
              }
              return prev
            })
          } else if (message.type === 'presence:leave') {
            setSubscribers(prev => prev.filter(id => id !== message.data.userId))
          }

          onMessage?.(message)
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.onclose = (event) => {
        setConnected(false)
        setConnecting(false)
        
        if (event.code !== 1000 && autoReconnect && reconnectAttempts.current < 10) {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000)
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, reconnectDelayRef.current)
        }
        
        onDisconnect?.()
      }

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        setError('Connection failed')
        setConnecting(false)
      }

    } catch (err) {
      console.error('Failed to create WebSocket connection:', err)
      setConnecting(false)
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const sendMessage = (message: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    return false
  }

  // Keep-alive ping
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (connected) {
        sendMessage({ type: 'ping' })
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [connected])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()
    
    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconnect when projectId changes
  useEffect(() => {
    if (connected) {
      disconnect()
      setTimeout(() => {
        connect()
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return {
    connected,
    connecting,
    error,
    lastMessage,
    subscribers,
    sendMessage,
    reconnect: connect,
    disconnect
  }
}