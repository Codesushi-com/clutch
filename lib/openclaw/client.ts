/**
 * OpenClaw Backend WebSocket Client
 * Persistent connection from OpenClutch server to OpenClaw for reliable message handling
 *
 * Uses device identity (Ed25519 keypair) for gateway authentication with full operator scopes.
 * Shares identity file with the work loop at ~/.openclutch/identity/device.json.
 */

import WebSocket from 'ws'

const PROTOCOL_VERSION = 3

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; text?: string }>
  timestamp?: number
}

type ChatEvent = {
  type: 'chat.typing.start' | 'chat.typing.end' | 'chat.delta' | 'chat.message' | 'chat.final' | 'chat.error'
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

// --- Device Identity (Ed25519 keypair for gateway auth) ---
// Using require() to avoid Next.js bundler pulling node builtins into client chunks

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

function getNodeCrypto(): typeof import('node:crypto') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:crypto')
}

function getNodeFs(): typeof import('node:fs') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs')
}

function getNodePath(): typeof import('node:path') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:path')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const crypto = getNodeCrypto()
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  // Ed25519 SPKI is 44 bytes; raw key is last 32
  return spki.subarray(spki.length - 32)
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const crypto = getNodeCrypto()
  const raw = derivePublicKeyRaw(publicKeyPem)
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function signPayload(privateKeyPem: string, payload: string): string {
  const crypto = getNodeCrypto()
  const key = crypto.createPrivateKey(privateKeyPem)
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key)
  return base64UrlEncode(sig)
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function loadOrCreateDeviceIdentity(filePath: string): DeviceIdentity {
  const fs = getNodeFs()
  const path = getNodePath()
  const crypto = getNodeCrypto()

  try {
    const data = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(data)
    if (parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
      return { deviceId: parsed.deviceId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem }
    }
  } catch {
    // File doesn't exist or is invalid — generate new identity
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const deviceId = fingerprintPublicKey(publicKeyPem)

  const identity = { version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now() }
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(identity, null, 2), { mode: 0o600 })
  console.log(`[OpenClaw] Generated new device identity: ${deviceId.slice(0, 12)}…`)
  return { deviceId, publicKeyPem, privateKeyPem }
}

function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token?: string
  nonce: string
}): string {
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token || '',
    params.nonce,
  ].join('|')
}

// --- OpenClaw WebSocket Client ---

class OpenClawClient {
  private ws: WebSocket | null = null
  private status: ConnectionStatus = 'disconnected'
  private serverInfo: { version?: string; host?: string; uptimeMs?: number } = {}
  private reconnectTimeout: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelay = 1000
  private maxReconnectDelay = 30000
  
  private wsUrl: string
  private authToken: string
  private deviceIdentity: DeviceIdentity | null = null
  
  private pendingRequests = new Map<string, PendingRequest>()
  private eventCallbacks = new Set<EventCallback>()
  private heartbeatInterval: NodeJS.Timeout | null = null
  private connectChallengeHandler: ((nonce: string) => void) | null = null
  private connectChallengeTimeout: NodeJS.Timeout | null = null
  
  constructor() {
    this.wsUrl = process.env.OPENCLAW_WS_URL || 'ws://127.0.0.1:4440/ws'
    this.authToken = process.env.OPENCLAW_TOKEN || ''

    // Load or create device identity (shared with work loop at ~/.openclutch/identity/device.json)
    try {
      const path = getNodePath()
      const identityFile = path.join(
        process.env.HOME || '/tmp',
        '.openclutch',
        'identity',
        'device.json'
      )
      this.deviceIdentity = loadOrCreateDeviceIdentity(identityFile)
      console.log(`[OpenClaw] Device identity loaded: ${this.deviceIdentity.deviceId.slice(0, 12)}…`)
    } catch (err) {
      console.warn('[OpenClaw] Failed to load device identity, connecting without:', err)
    }
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
        console.log('[OpenClaw] WebSocket open, waiting for challenge…')

        let connectSent = false
        const role = 'operator'
        const scopes = ['operator.admin', 'operator.read', 'operator.write']
        const clientId = 'gateway-client'   // Must match GATEWAY_CLIENT_IDS enum
        const clientMode = 'backend'

        const sendConnect = (nonce: string) => {
          if (connectSent) return
          connectSent = true
          this.connectChallengeHandler = null
          if (this.connectChallengeTimeout) {
            clearTimeout(this.connectChallengeTimeout)
            this.connectChallengeTimeout = null
          }

          const connectId = this.generateId()

          // Build device identity block if available
          let device: Record<string, unknown> | undefined
          if (this.deviceIdentity) {
            const signedAtMs = Date.now()
            const publicKeyRaw = base64UrlEncode(derivePublicKeyRaw(this.deviceIdentity.publicKeyPem))
            const payload = buildDeviceAuthPayload({
              deviceId: this.deviceIdentity.deviceId,
              clientId,
              clientMode,
              role,
              scopes,
              signedAtMs,
              token: this.authToken || undefined,
              nonce,
            })
            const signature = signPayload(this.deviceIdentity.privateKeyPem, payload)
            device = {
              id: this.deviceIdentity.deviceId,
              publicKey: publicKeyRaw,
              signature,
              signedAt: signedAtMs,
              nonce,
            }
          }

          this.ws!.send(JSON.stringify({
            type: 'req',
            id: connectId,
            method: 'connect',
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: {
                id: clientId,
                displayName: 'OpenClutch Backend',
                version: '1.0.0',
                platform: 'linux',
                mode: clientMode,
              },
              caps: [],
              auth: this.authToken ? { token: this.authToken } : undefined,
              role,
              scopes,
              device,
            }
          }))

          // Wait for connect response before marking connected
          this.pendingRequests.set(connectId, {
            resolve: (payload: unknown) => {
              this.status = 'connected'
              this.reconnectAttempts = 0
              const p = payload as { server?: { version?: string; host?: string }; snapshot?: { uptimeMs?: number } } | undefined
              this.serverInfo = {
                version: p?.server?.version,
                host: p?.server?.host,
                uptimeMs: p?.snapshot?.uptimeMs,
              }
              console.log(`[OpenClaw] Connected successfully (v${this.serverInfo.version ?? '?'}, host=${this.serverInfo.host ?? '?'})`)
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
        }

        // Set up challenge handler — gateway sends connect.challenge with nonce after WS open
        this.connectChallengeHandler = (nonce: string) => {
          console.log('[OpenClaw] Received challenge nonce')
          sendConnect(nonce)
        }

        // Fallback: if no challenge received within 2s, connect without nonce (backwards compat)
        this.connectChallengeTimeout = setTimeout(() => {
          sendConnect('')
        }, 2000)
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
    this.connectChallengeHandler = null
    if (this.connectChallengeTimeout) {
      clearTimeout(this.connectChallengeTimeout)
      this.connectChallengeTimeout = null
    }
    
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

  getServerInfo(): { version?: string; host?: string; uptimeMs?: number } {
    return this.serverInfo
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
    this.connectChallengeHandler = null
    if (this.connectChallengeTimeout) {
      clearTimeout(this.connectChallengeTimeout)
      this.connectChallengeTimeout = null
    }
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
        // Handle connect.challenge during handshake
        if (message.event === 'connect.challenge') {
          const nonce = typeof message.payload?.nonce === 'string' ? message.payload.nonce.trim() : ''
          if (nonce && this.connectChallengeHandler) {
            this.connectChallengeHandler(nonce)
          }
          return
        }

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
