"use client"

import { useCallback, useRef, useEffect, useState } from "react"
import { SessionListResponse, SessionListParams } from "@/lib/types"

// Dynamic WebSocket URL based on page protocol
// HTTPS pages must use WSS through nginx proxy, HTTP can use WS directly
function getWebSocketUrl(): string {
  if (typeof window === "undefined") return ""
  
  // When on HTTPS, use the same-origin WSS proxy
  if (window.location.protocol === "https:") {
    return `wss://${window.location.host}/openclaw-ws`
  }
  
  // When on HTTP (dev), use direct connection
  return process.env.NEXT_PUBLIC_OPENCLAW_WS_URL || ""
}

const AUTH_TOKEN = process.env.NEXT_PUBLIC_OPENCLAW_TOKEN || ""

interface RPCResponse<T> {
  type: "res"
  id: string
  ok: boolean
  payload?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export function useOpenClawRpc() {
  console.log("[OpenClawRPC] Hook initializing")
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const connectingRef = useRef(false)
  const pendingRequests = useRef<Map<string, PendingRequest<unknown>>>(new Map())
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear all pending requests with an error
  const clearPendingRequests = useCallback((errorMessage: string) => {
    const error = new Error(errorMessage)
    pendingRequests.current.forEach((req) => {
      clearTimeout(req.timeout)
      req.reject(error)
    })
    pendingRequests.current.clear()
  }, [])

  // Connect to OpenClaw WebSocket
  const connect = useCallback(() => {
    const wsUrl = getWebSocketUrl()
    if (!wsUrl) {
      console.log("[OpenClawRPC] WebSocket URL not configured")
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    if (connectingRef.current) {
      return
    }

    connectingRef.current = true
    setConnecting(true)
    console.log("[OpenClawRPC] Connecting to", wsUrl)
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[OpenClawRPC] WebSocket open, sending connect handshake")
      
      // Send connect handshake (required first message)
      const connectId = crypto.randomUUID()
      console.log("[OpenClawRPC] Connect ID:", connectId)
      
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(connectId)) {
          pendingRequests.current.delete(connectId)
          ws.close()
          connectingRef.current = false
          setConnecting(false)
        }
      }, 10000) // 10s timeout for handshake
      
      pendingRequests.current.set(connectId, {
        resolve: () => {
          console.log("[OpenClawRPC] Connected and authenticated")
          setConnected(true)
          connectingRef.current = false
          setConnecting(false)
          // Clear any reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
          }
        },
        reject: (e) => {
          console.error("[OpenClawRPC] Connect handshake failed:", e)
          connectingRef.current = false
          setConnecting(false)
          ws.close()
        },
        timeout,
      })
      
      ws.send(JSON.stringify({
        type: "req",
        id: connectId,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "webchat",
            version: "1.0.0",
            platform: "web",
            mode: "webchat",
          },
          auth: {
            token: AUTH_TOKEN
          }
        }
      }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RPCResponse<unknown>
        console.log("[OpenClawRPC] Received:", data.type, data.id, "pending:", Array.from(pendingRequests.current.keys()))
        
        // Handle RPC responses (type: "res")
        if (data.type === "res" && data.id && pendingRequests.current.has(data.id)) {
          const pending = pendingRequests.current.get(data.id)!
          pendingRequests.current.delete(data.id)
          clearTimeout(pending.timeout)
          
          if (!data.ok || data.error) {
            const errorMessage = data.error?.message || "RPC error"
            pending.reject(new Error(errorMessage))
          } else {
            pending.resolve(data.payload)
          }
          return
        }
      } catch (e) {
        console.error("[OpenClawRPC] Failed to parse message:", e)
      }
    }

    ws.onclose = (event) => {
      console.log("[OpenClawRPC] Disconnected", event.code, event.reason)
      setConnected(false)
      connectingRef.current = false
      setConnecting(false)
      
      // Reject all pending requests
      clearPendingRequests("WebSocket disconnected")
      
      // Reconnect after delay with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, Math.random() * 2), 30000)
      console.log(`[OpenClawRPC] Reconnecting in ${Math.round(delay)}ms`)
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }

    ws.onerror = (error) => {
      console.error("[OpenClawRPC] WebSocket error:", error)
      connectingRef.current = false
      setConnecting(false)
    }
  }, [clearPendingRequests])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    clearPendingRequests("Disconnected by user")
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    setConnected(false)
    connectingRef.current = false
    setConnecting(false)
  }, [clearPendingRequests])

  // Generic RPC request method
  const rpc = useCallback(async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected")
    }

    const id = crypto.randomUUID()
    
    return new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id)
          reject(new Error(`RPC timeout for method: ${method}`))
        }
      }, 60000) // 60s timeout
      
      pendingRequests.current.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      })
      
      try {
        wsRef.current!.send(JSON.stringify({
          type: "req",
          id,
          method,
          params: params || {},
        }))
      } catch (error) {
        pendingRequests.current.delete(id)
        clearTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }, [])

  // List sessions via RPC
  const listSessions = useCallback(async (params?: SessionListParams): Promise<SessionListResponse> => {
    return rpc<SessionListResponse>("sessions.list", (params || {}) as Record<string, unknown>)
  }, [rpc])

  // Connect on mount
  useEffect(() => {
    console.log("[OpenClawRPC] useEffect running, calling connect()")
    connect()
    
    return () => {
      console.log("[OpenClawRPC] useEffect cleanup, calling disconnect()")
      disconnect()
    }
  }, [connect, disconnect])

  return {
    connected,
    connecting,
    connect,
    disconnect,
    rpc,
    listSessions,
  }
}

export default useOpenClawRpc
