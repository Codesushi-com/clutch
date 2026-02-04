"use client"

import { useCallback, useRef, useEffect, useState } from "react"

// Fallback for non-secure contexts where crypto.randomUUID isn't available
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Dynamic WebSocket URL based on page protocol
function getWebSocketUrl(): string {
  if (typeof window === "undefined") return ""
  
  if (window.location.protocol === "https:") {
    return `wss://${window.location.host}/openclaw-ws`
  }
  
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
  onTypingStart?: (runId: string) => void
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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Store callbacks in refs so they don't cause reconnection
  const onDeltaRef = useRef(onDelta)
  const onMessageRef = useRef(onMessage)
  const onErrorRef = useRef(onError)
  const onTypingStartRef = useRef(onTypingStart)
  const onTypingEndRef = useRef(onTypingEnd)

  // Keep refs updated
  useEffect(() => {
    onDeltaRef.current = onDelta
    onMessageRef.current = onMessage
    onErrorRef.current = onError
    onTypingStartRef.current = onTypingStart
    onTypingEndRef.current = onTypingEnd
  }, [onDelta, onMessage, onError, onTypingStart, onTypingEnd])

  // Connect to OpenClaw WebSocket
  const connect = useCallback(() => {
    const wsUrl = getWebSocketUrl()
    if (!enabled || !wsUrl) {
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    console.log("[OpenClawChat] Connecting to", wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[OpenClawChat] WebSocket open, sending connect handshake")
      const connectId = generateUUID()
      pendingRequests.current.set(connectId, {
        resolve: () => {
          console.log("[OpenClawChat] Connected and authenticated")
          if (mountedRef.current) setConnected(true)
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
            onTypingStartRef.current?.(payload.runId)
          } else if (payload.state === "delta") {
            const text = typeof payload.message?.content === "string" 
              ? payload.message.content 
              : payload.message?.content?.[0]?.text || ""
            onDeltaRef.current?.(text, payload.runId)
          } else if (payload.state === "final") {
            onTypingEndRef.current?.()
            if (payload.message) {
              onMessageRef.current?.(payload.message, payload.runId)
            }
            if (activeRunId.current === payload.runId) {
              activeRunId.current = null
              if (mountedRef.current) setSending(false)
            }
          } else if (payload.state === "error") {
            onTypingEndRef.current?.()
            onErrorRef.current?.(payload.errorMessage || "Unknown error", payload.runId)
            if (activeRunId.current === payload.runId) {
              activeRunId.current = null
              if (mountedRef.current) setSending(false)
            }
          }
        }
      } catch (e) {
        console.error("[OpenClawChat] Failed to parse message:", e)
      }
    }

    ws.onclose = () => {
      console.log("[OpenClawChat] Disconnected")
      if (mountedRef.current) {
        setConnected(false)
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = (error) => {
      console.error("[OpenClawChat] Error:", error)
    }
  }, [enabled]) // Only depends on enabled now

  // Send RPC request
  const rpc = useCallback(async (method: string, params: Record<string, unknown>): Promise<unknown> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected")
    }

    const id = generateUUID()
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(id, { resolve, reject })
      wsRef.current!.send(JSON.stringify({ type: "req", id, method, params }))
      
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
    const idempotencyKey = generateUUID()
    
    const contextMessage = trapChatId 
      ? `[Trap Chat ID: ${trapChatId}]\n\n${message}`
      : message

    try {
      const result = await rpc("chat.send", {
        sessionKey,
        message: contextMessage,
        idempotencyKey,
      }) as { runId: string; status: string }
      
      if (result.status === "started") {
        activeRunId.current = result.runId
        onTypingStartRef.current?.(result.runId)
      }
      
      return result.runId
    } catch (error) {
      setSending(false)
      throw error
    }
  }, [connected, sessionKey, rpc])

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    connect()
    
    return () => {
      mountedRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
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
