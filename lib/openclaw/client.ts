/**
 * OpenClaw Backend WebSocket Client
 * Persistent connection from Trap server to OpenClaw for reliable message handling
 */

import WebSocket from 'ws'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; text?: string }>
  timestamp?: number
}

type ChatEvent = {
  type: 'chat.typing.start' | 'chat.typing.end' | 'chat.delta' | 'chat.message' | 'chat.error'
  sessionKey: string
  runId?: string
  delta?: string
  message?: ChatMessage
  errorMessage?: string
}

type EventCallback = (event: ChatEvent) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

class OpenClawClient {
  private ws: WebSocket | null = null
  private status: ConnectionStatus = 'disconnected'
  private reconnectTimeout: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelay = 1000
  private maxReconnectDelay = 30000
  
  private wsUrl: string
  private authToken: string
  
  private pendingRequests = new Map<string, PendingRequest>()
  private eventCallbacks = new Set<EventCallback>()
  private heartbeatInterval: NodeJS.Timeout | null = null
  
  constructor() {
    this.wsUrl = process.env.OPENCLAW_WS_URL || 'ws://127.0.0.1:4440/ws'
    this.authToken = process.env.OPENCLAW_TOKEN || ''
  }

  /**
   * Connect to OpenClaw WebSocket
   */
  connect(): void {
    if (this.status === 'connecting' || this.status === 'connected') {
      return
    }

    this.status = 'connecting'
    console.log('[OpenClaw] Connecting to', this.wsUrl)

    try {
      this.ws = new WebSocket(this.wsUrl, {
        headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
      })

      this.ws.on('open', () => {
        console.log('[OpenClaw] WebSocket open, sending connect handshake')
        
        // Send proper OpenClaw connect handshake
        const connectId = this.generateId()
        this.ws!.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'gateway-client',
              displayName: 'OpenClutch Backend',
              version: '1.0.0',
              platform: 'nodejs',
              mode: 'backend',
            },
            auth: this.authToken ? { token: this.authToken } : undefined
          }
        }))
        
        // Wait for connect response before marking connected
        this.pendingRequests.set(connectId, {
          resolve: () => {
            this.status = 'connected'
            this.reconnectAttempts = 0
            console.log('[OpenClaw] Connected successfully (handshake complete)')
            this.startHeartbeat()
          },
          reject: (error) => {
            console.error('[OpenClaw] Connect handshake failed:', error.message)
            this.ws?.close()
          },
          timeout: setTimeout(() => {
            this.pendingRequests.delete(connectId)
            console.error('[OpenClaw] Connect handshake timeout')
            this.ws?.close()
          }, 10000)
        })
      })

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString())
      })

      this.ws.on('close', (code, reason) => {
        console.log('[OpenClaw] Connection closed:', code, reason.toString())
        this.handleDisconnect()
      })

      this.ws.on('error', (error) => {
        console.error('[OpenClaw] WebSocket error:', error.message)
        // Don't call handleDisconnect here - 'close' event will follow
      })
    } catch (error) {
      console.error('[OpenClaw] Failed to create WebSocket:', error)
      this.handleDisconnect()
    }
  }

  /**
   * Disconnect from OpenClaw
   */
  disconnect(): void {
    this.status = 'disconnected'
    this.stopHeartbeat()
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    // Clear pending requests
    this.pendingRequests.forEach((req) => {
      clearTimeout(req.timeout)
      req.reject(new Error('Disconnected'))
    })
    this.pendingRequests.clear()
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status
  }

  /**
   * Subscribe to chat events
   */
  onChatEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback)
    return () => {
      this.eventCallbacks.delete(callback)
    }
  }

  /**
   * Send RPC request to OpenClaw
   */
  async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (this.status !== 'connected' || !this.ws) {
      throw new Error('Not connected to OpenClaw')
    }

    const id = this.generateId()
    
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, 30000)

      this.pendingRequests.set(id, { 
        resolve: resolve as (value: unknown) => void, 
        reject, 
        timeout 
      })

      const message = JSON.stringify({
        type: 'req',
        id,
        method,
        params: params || {}
      })

      this.ws!.send(message)
    })
  }

  /**
   * Send a chat message to a session
   */
  async sendMessage(sessionKey: string, message: string): Promise<{ runId: string }> {
    return this.rpc('chat.send', { sessionKey, message })
  }

  /**
   * Subscribe to a session's chat events
   */
  async subscribeToSession(sessionKey: string): Promise<void> {
    await this.rpc('chat.subscribe', { sessionKey })
    console.log('[OpenClaw] Subscribed to session:', sessionKey)
  }

  /**
   * Unsubscribe from a session's chat events
   */
  async unsubscribeFromSession(sessionKey: string): Promise<void> {
    await this.rpc('chat.unsubscribe', { sessionKey })
    console.log('[OpenClaw] Unsubscribed from session:', sessionKey)
  }

  // --- Private methods ---

  // Authentication is now handled in the connect handshake

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.status === 'connected') {
        try {
          this.ws.ping()
        } catch {
          // Ignore ping errors
        }
      }
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private handleDisconnect(): void {
    this.status = 'disconnected'
    this.stopHeartbeat()
    this.ws = null
    
    // Clear pending requests
    this.pendingRequests.forEach((req) => {
      clearTimeout(req.timeout)
      req.reject(new Error('Connection lost'))
    })
    this.pendingRequests.clear()
    
    // Schedule reconnect
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[OpenClaw] Max reconnect attempts reached')
      return
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    )
    
    this.reconnectAttempts++
    this.status = 'reconnecting'
    
    console.log(`[OpenClaw] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      
      // Handle RPC responses (type: "res")
      if (message.type === 'res' && message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!
        this.pendingRequests.delete(message.id)
        clearTimeout(pending.timeout)
        
        if (!message.ok || message.error) {
          pending.reject(new Error(message.error?.message || 'RPC error'))
        } else {
          pending.resolve(message.payload)
        }
        return
      }
      
      // Handle events (type: "event")
      if (message.type === 'event') {
        // Map event names to our ChatEvent types
        if (message.event === 'chat') {
          const payload = message.payload || {}
          const event: ChatEvent = {
            type: `chat.${payload.state || 'message'}` as ChatEvent['type'],
            sessionKey: payload.sessionKey || '',
            runId: payload.runId,
            delta: payload.delta,
            message: payload.message,
            errorMessage: payload.error
          }
          
          this.eventCallbacks.forEach((callback) => {
            try {
              callback(event)
            } catch (error) {
              console.error('[OpenClaw] Event callback error:', error)
            }
          })
        }
        // Ignore other events like 'health', 'pong' etc.
      }
    } catch (error) {
      console.error('[OpenClaw] Failed to parse message:', error)
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// Singleton instance
let clientInstance: OpenClawClient | null = null

/**
 * Get the OpenClaw client singleton
 */
export function getOpenClawClient(): OpenClawClient {
  if (!clientInstance) {
    clientInstance = new OpenClawClient()
  }
  return clientInstance
}

/**
 * Initialize and connect the OpenClaw client
 * Call this on server startup
 */
export function initializeOpenClawClient(): OpenClawClient {
  const client = getOpenClawClient()
  client.connect()
  return client
}

export type { ChatEvent, ChatMessage, ConnectionStatus }
