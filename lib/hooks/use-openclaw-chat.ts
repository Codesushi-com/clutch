"use client"

import { useCallback, useRef, useEffect, useState } from "react"

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

type ChatMessage = {
  role: "user" | "assistant"
  content: string | Array<{ type: string; text?: string }>
  timestamp?: number
}

type ChatResponse = {
  runId: string
  sessionKey: string
  seq: number
  state: "started" | "delta" | "final" | "error"
  delta?: string
  message?: ChatMessage
  errorMessage?: string
}

type UseOpenClawChatOptions = {
  sessionKey?: string
  onDelta?: (delta: string, runId: string) => void
  onMessage?: (message: ChatMessage, runId: string) => void
  onError?: (error: string, runId: string) => void
  onTypingStart?: () => void
  onTypingEnd?: () => void
  enabled?: boolean
}

export function useOpenClawChat({
  sessionKey = "main",
  onDelta,
  onMessage,
  onError,
  onTypingStart,
  onTypingEnd,
  enabled = true,
}: UseOpenClawChatOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const pendingRequests = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map())
  const activeRunId = useRef<string | null>(null)

  // Connect to OpenClaw WebSocket
  const connect = useCallback(() => {
    const wsUrl = getWebSocketUrl()
    if (!enabled || !wsUrl) {
      console.log("[OpenClawChat] WebSocket URL not configured")
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    console.log("[OpenClawChat] Connecting to", wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[OpenClawChat] WebSocket open, sending connect handshake")
      // Send connect handshake (required first message)
      const connectId = crypto.randomUUID()
      pendingRequests.current.set(connectId, {
        resolve: () => {
          console.log("[OpenClawChat] Connected and authenticated")
          setConnected(true)
        },
        reject: (e) => {
          console.error("[OpenClawChat] Connect handshake failed:", e)
          ws.close()
        }
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
        const data = JSON.parse(event.data)
        console.log("[OpenClawChat] Received:", data.type, data)
        
        // Handle RPC responses (type: "res")
        if (data.type === "res" && data.id && pendingRequests.current.has(data.id)) {
          const { resolve, reject } = pendingRequests.current.get(data.id)!
          pendingRequests.current.delete(data.id)
          if (!data.ok || data.error) {
            reject(new Error(data.error?.message || "RPC error"))
          } else {
            resolve(data.payload)
          }
          return
        }

        // Handle events (type: "event")
        if (data.type === "event" && data.event === "chat") {
          const payload = data.payload as ChatResponse
          
          if (payload.state === "started") {
            activeRunId.current = payload.runId
            onTypingStart?.()
          } else if (payload.state === "delta" && payload.delta) {
            onDelta?.(payload.delta, payload.runId)
          } else if (payload.state === "final") {
            onTypingEnd?.()
            if (payload.message) {
              onMessage?.(payload.message, payload.runId)
            }
            if (activeRunId.current === payload.runId) {
              activeRunId.current = null
              setSending(false)
            }
          } else if (payload.state === "error") {
            onTypingEnd?.()
            onError?.(payload.errorMessage || "Unknown error", payload.runId)
            if (activeRunId.current === payload.runId) {
              activeRunId.current = null
              setSending(false)
            }
          }
        }
      } catch (e) {
        console.error("[OpenClawChat] Failed to parse message:", e)
      }
    }

    ws.onclose = () => {
      console.log("[OpenClawChat] Disconnected")
      setConnected(false)
      // Reconnect after delay
      setTimeout(connect, 3000)
    }

    ws.onerror = (error) => {
      console.error("[OpenClawChat] Error:", error)
    }
  }, [enabled, onDelta, onMessage, onError, onTypingStart, onTypingEnd])

  // Send RPC request
  const rpc = useCallback(async (method: string, params: Record<string, unknown>): Promise<unknown> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected")
    }

    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(id, { resolve, reject })
      wsRef.current!.send(JSON.stringify({ type: "req", id, method, params }))
      
      // Timeout after 60s
      setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id)
          reject(new Error("RPC timeout"))
        }
      }, 60000)
    })
  }, [])

  // Send a chat message
  const sendMessage = useCallback(async (message: string, trapChatId?: string): Promise<string> => {
    if (!connected) {
      throw new Error("Not connected to OpenClaw")
    }

    setSending(true)
    const idempotencyKey = crypto.randomUUID()
    
    // Include Trap chat context in the message
    const contextMessage = trapChatId 
      ? `[Trap Chat ID: ${trapChatId}]\n\n${message}`
      : message

    try {
      const result = await rpc("chat.send", {
        sessionKey,
        message: contextMessage,
        idempotencyKey,
      }) as { runId: string; status: string }
      
      return result.runId
    } catch (error) {
      setSending(false)
      throw error
    }
  }, [connected, sessionKey, rpc])

  // Connect on mount
  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return {
    connected,
    sending,
    sendMessage,
    rpc,
  }
}
