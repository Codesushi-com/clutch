"use client"

import { useEffect, useRef, useCallback, useState } from "react"

export type BoardMessage =
  | { type: "task_created"; task: unknown }
  | { type: "task_updated"; task: unknown }
  | { type: "task_deleted"; taskId: string }
  | { type: "task_moved"; taskId: string; status: string; position: number }
  | { type: "connected"; timestamp: number }
  | { type: "pong" }

export type MessageHandler = (message: BoardMessage) => void

/**
 * Get the WebSocket URL based on the current window location.
 * Uses the same host/port as the Next.js app.
 */
export function getWebSocketUrl(): string {
  if (typeof window === "undefined") {
    return ""
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/api/ws`
}

/**
 * Hook for managing a WebSocket connection to the board updates endpoint.
 *
 * @param projectId - Optional project ID to filter updates
 * @returns Connection state and send function
 */
export function useBoardWebSocket(projectId?: string) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Set<MessageHandler>>(new Set())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Register a message handler
  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  // Send a message to the server
  const send = useCallback((message: Omit<BoardMessage, "timestamp">) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    return false
  }, [])

  // Connect to WebSocket
  useEffect(() => {
    let isActive = true

    const connect = () => {
      if (!isActive) return

      try {
        const url = getWebSocketUrl()
        if (!url) {
          setError(new Error("WebSocket URL not available"))
          return
        }

        console.log("[BoardWebSocket] Connecting to", url)
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isActive) {
            ws.close()
            return
          }
          console.log("[BoardWebSocket] Connected")
          setIsConnected(true)
          setError(null)

          // Start ping interval to keep connection alive
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }))
            }
          }, 30000) // Ping every 30 seconds
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as BoardMessage

            // Notify all registered handlers
            for (const handler of handlersRef.current) {
              try {
                handler(message)
              } catch (handlerError) {
                console.error("[BoardWebSocket] Handler error:", handlerError)
              }
            }
          } catch (parseError) {
            console.error("[BoardWebSocket] Failed to parse message:", parseError)
          }
        }

        ws.onerror = (event) => {
          console.error("[BoardWebSocket] Error:", event)
          setError(new Error("WebSocket connection error"))
        }

        ws.onclose = () => {
          console.log("[BoardWebSocket] Disconnected")
          setIsConnected(false)
          wsRef.current = null

          // Clear intervals
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current)
            pingIntervalRef.current = null
          }

          // Attempt reconnection after delay
          if (isActive) {
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log("[BoardWebSocket] Attempting reconnection...")
              connect()
            }, 5000)
          }
        }
      } catch (connectError) {
        console.error("[BoardSocket] Connection failed:", connectError)
        setError(connectError instanceof Error ? connectError : new Error("Connection failed"))

        // Attempt reconnection after delay
        if (isActive) {
          reconnectTimeoutRef.current = setTimeout(connect, 5000)
        }
      }
    }

    connect()

    // Cleanup on unmount
    return () => {
      isActive = false

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [projectId])

  return {
    isConnected,
    error,
    onMessage,
    send,
  }
}
