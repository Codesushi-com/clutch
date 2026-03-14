/**
 * Gateway WebSocket RPC Client
 *
 * Persistent WebSocket connection to the OpenClaw gateway for spawning
 * and monitoring agent sessions. Replaces child_process.spawn approach
 * with proper gateway-managed sessions that are fully trackable.
 */

import WebSocket from "ws"
import { randomUUID, createPublicKey, createPrivateKey, createHash, sign, generateKeyPairSync } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

// ============================================
// Types
// ============================================

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface GatewayClientConfig {
  wsUrl: string
  token: string
  requestTimeoutMs?: number
  onDisconnect?: () => void
}

interface AgentParams {
  message: string
  sessionKey: string
  model?: string
  thinking?: string
  timeout?: number
}

interface AgentResult {
  sessionKey?: string
  sessionId?: string
  reply?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// ============================================
// Device Identity (Ed25519)
// ============================================

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = createPublicKey(publicKeyPem)
  const spki = key.export({ type: "spki", format: "der" })
  return spki.subarray(spki.length - 32)
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem)
  return createHash("sha256").update(raw).digest("hex")
}

function signPayload(privateKeyPem: string, payload: string): string {
  const key = createPrivateKey(privateKeyPem)
  const sig = sign(null, Buffer.from(payload, "utf8"), key)
  return base64UrlEncode(sig)
}

function buildDeviceAuthPayload(params: {
  deviceId: string; clientId: string; clientMode: string
  role: string; scopes: string[]; signedAtMs: number; token?: string; nonce: string
}): string {
  return [
    "v2", params.deviceId, params.clientId, params.clientMode,
    params.role, params.scopes.join(","), String(params.signedAtMs),
    params.token || "", params.nonce,
  ].join("|")
}

function loadOrCreateDeviceIdentity(filePath: string): DeviceIdentity {
  try {
    const data = readFileSync(filePath, "utf8")
    const parsed = JSON.parse(data)
    if (parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
      return { deviceId: parsed.deviceId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem }
    }
  } catch { /* generate new */ }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string
  const deviceId = fingerprintPublicKey(publicKeyPem)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify({ version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now() }, null, 2), { mode: 0o600 })
  console.log(`[GatewayClient] Generated new device identity: ${deviceId.slice(0, 12)}…`)
  return { deviceId, publicKeyPem, privateKeyPem }
}

// ============================================
// Constants
// ============================================

const PROTOCOL_VERSION = 3
const DEFAULT_REQUEST_TIMEOUT_MS = 65 * 60 * 1000 // 65 minutes (above 1hr agent timeout)
const CONNECT_TIMEOUT_MS = 10_000
const RECONNECT_DELAY_MS = 5_000

// ============================================
// Gateway Client
// ============================================

export class GatewayRpcClient {
  private ws: WebSocket | null = null
  private wsReady = false
  private connectPromise: Promise<void> | null = null
  private pending = new Map<string, PendingRequest>()
  private closed = false
  private config: GatewayClientConfig
  private requestTimeoutMs: number
  private deviceIdentity: DeviceIdentity | null = null

  constructor(config: GatewayClientConfig) {
    this.config = config
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

    // Load shared device identity
    try {
      const identityFile = join(process.env.HOME || "/tmp", ".openclutch", "identity", "device.json")
      this.deviceIdentity = loadOrCreateDeviceIdentity(identityFile)
      console.log(`[GatewayClient] Device identity loaded: ${this.deviceIdentity.deviceId.slice(0, 12)}…`)
    } catch (err) {
      console.warn("[GatewayClient] Failed to load device identity:", err)
    }
  }

  // ---- Connection Management ----

  async connect(): Promise<void> {
    if (this.wsReady && this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this._doConnect()
    return this.connectPromise
  }

  private _doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.ws) {
        try { this.ws.close() } catch { /* ignore */ }
        this.ws = null
      }
      this.wsReady = false

      const socket = new WebSocket(this.config.wsUrl)
      this.ws = socket

      const connectTimeout = setTimeout(() => {
        socket.close()
        this.connectPromise = null
        reject(new Error("Gateway WebSocket connect timeout"))
      }, CONNECT_TIMEOUT_MS)

      socket.on("open", () => {
        const role = "operator"
        const scopes = ["operator.admin", "operator.read", "operator.write"]
        const clientId = "gateway-client"
        const clientMode = "backend"
        let connectSent = false

        const sendConnect = (nonce: string) => {
          if (connectSent) return
          connectSent = true

          const connectId = randomUUID()

          // Build device identity block if available
          let device: Record<string, unknown> | undefined
          if (this.deviceIdentity) {
            const signedAtMs = Date.now()
            const publicKeyRaw = base64UrlEncode(derivePublicKeyRaw(this.deviceIdentity.publicKeyPem))
            const payload = buildDeviceAuthPayload({
              deviceId: this.deviceIdentity.deviceId,
              clientId, clientMode, role, scopes, signedAtMs,
              token: this.config.token || undefined, nonce,
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

          const connectFrame = {
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: {
                id: clientId,
                displayName: "OpenClutch Work Loop",
                version: "1.0.0",
                platform: "linux",
                mode: clientMode,
              },
              caps: [],
              auth: this.config.token ? { token: this.config.token } : undefined,
              role,
              scopes,
              device,
            },
          }

          this.pending.set(connectId, {
            resolve: () => {
              clearTimeout(connectTimeout)
              this.wsReady = true
              this.connectPromise = null
              resolve()
            },
            reject: (err) => {
              clearTimeout(connectTimeout)
              this.connectPromise = null
              reject(err)
            },
            timer: connectTimeout,
          })

          socket.send(JSON.stringify(connectFrame))
        }

        // Wait for connect.challenge event with nonce, fallback after 2s
        const challengeTimeout = setTimeout(() => sendConnect(""), 2000)
        const earlyMessageHandler = (raw: WebSocket.Data) => {
          try {
            const msg = JSON.parse(raw.toString())
            if (msg.type === "event" && msg.event === "connect.challenge" && typeof msg.payload?.nonce === "string") {
              clearTimeout(challengeTimeout)
              sendConnect(msg.payload.nonce.trim())
            }
          } catch { /* ignore */ }
        }
        socket.on("message", earlyMessageHandler)
      })

      socket.on("message", (data) => {
        try {
          const frame = JSON.parse(data.toString())
          if (frame.type === "res" && frame.id) {
            const req = this.pending.get(frame.id)
            if (req) {
              // For agent calls, only resolve on the final response
              // The gateway may send intermediate frames (streaming)
              if (frame.final === false) {
                // Intermediate frame — skip, keep waiting
                return
              }
              this.pending.delete(frame.id)
              clearTimeout(req.timer)
              if (frame.ok) {
                req.resolve(frame.payload ?? null)
              } else {
                req.reject(new Error(frame.error?.message ?? "RPC error"))
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      })

      socket.on("close", () => {
        this.wsReady = false
        this.ws = null
        this.connectPromise = null
        // Flush pending with errors
        for (const [id, req] of this.pending) {
          clearTimeout(req.timer)
          req.reject(new Error("Gateway WebSocket closed"))
          this.pending.delete(id)
        }
        this.config.onDisconnect?.()
      })

      socket.on("error", (err) => {
        clearTimeout(connectTimeout)
        this.connectPromise = null
        reject(err instanceof Error ? err : new Error(String(err)))
      })
    })
  }

  disconnect(): void {
    this.closed = true
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.wsReady = false
    this.connectPromise = null
    // Flush pending
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer)
      req.reject(new Error("Gateway client stopped"))
      this.pending.delete(id)
    }
  }

  get isConnected(): boolean {
    return this.wsReady && this.ws?.readyState === WebSocket.OPEN
  }

  // ---- RPC Methods ----

  /**
   * Send a raw RPC request to the gateway.
   */
  async request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    await this.connect()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway not connected")
    }

    const id = randomUUID()
    const frame = { type: "req", id, method, params }
    const timeout = timeoutMs ?? this.requestTimeoutMs

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout for ${method} after ${timeout}ms`))
      }, timeout)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })

      this.ws!.send(JSON.stringify(frame))
    })
  }

  /**
   * Run an agent turn via the gateway.
   *
   * This creates a real gateway-managed session that is fully trackable
   * via `sessions.list`. The call blocks until the agent completes.
   *
   * @param params - Agent parameters (message, sessionKey, model, etc.)
   * @returns Agent result with session info and reply
   */
  async runAgent(params: AgentParams): Promise<AgentResult> {
    const timeoutSeconds = params.timeout ?? 3600

    // Set model override on the session BEFORE running the agent.
    // This ensures the agent runs with the correct model from the start.
    if (params.model) {
      try {
        const patchResult = await this.request("sessions.patch", {
          key: params.sessionKey,
          model: params.model,
        }, 10_000)
        console.log(
          `[GatewayClient] Model override set for ${params.sessionKey}: ` +
          `model=${params.model}, result=${JSON.stringify((patchResult as Record<string, unknown>)?.resolved ?? patchResult)}`,
        )
      } catch (err) {
        // Non-fatal: agent will run with default model
        console.warn(`[GatewayClient] Failed to set model for ${params.sessionKey}:`, err)
      }
    } else {
      console.warn(`[GatewayClient] No model specified for ${params.sessionKey} — will use gateway default!`)
    }

    // Use a shorter timeout for the initial RPC since the gateway returns "accepted" quickly.
    // The agent runs asynchronously on the gateway side.
    const result = await this.request<AgentResult & { status?: string; runId?: string }>("agent", {
      message: params.message,
      sessionKey: params.sessionKey,
      thinking: params.thinking ?? "off",
      timeout: timeoutSeconds,
      idempotencyKey: randomUUID(),
    }, 30_000)

    return {
      sessionKey: params.sessionKey,
      sessionId: (result as Record<string, unknown>).runId as string | undefined,
      reply: (result as Record<string, unknown>).status as string | undefined,
    }
  }

  /**
   * Delete (kill) a session on the gateway.
   *
   * Used to terminate stuck agent sessions that are no longer making progress.
   */
  async deleteSession(sessionKey: string): Promise<void> {
    await this.request<unknown>(
      "sessions.delete",
      { key: sessionKey },
      10_000,
    )
  }

  /**
   * Send a message to a specific session via the gateway.
   *
   * Used for triage notifications — sends a message to Ada's main session
   * without spawning a new agent.
   */
  async sendToSession(sessionKey: string, message: string): Promise<void> {
    await this.request("sessions.send", { sessionKey, message }, 10_000)
  }

  /**
   * Get the count of pending (in-flight) agent RPC calls.
   * This represents agents that are currently running.
   */
  get activeAgentCount(): number {
    // Count pending requests that aren't the connect handshake
    // Agent requests have long timeouts, connect has short ones
    let count = 0
    for (const req of this.pending.values()) {
      // We can't perfectly distinguish agent calls from other RPCs,
      // but in practice only agent calls have long timeouts
      count++
    }
    // Subtract 1 if we're still pending connect
    return Math.max(0, count)
  }
}

// ============================================
// Singleton
// ============================================

let _instance: GatewayRpcClient | null = null

export function getGatewayClient(): GatewayRpcClient {
  if (!_instance) {
    const wsUrl = process.env.OPENCLAW_WS_URL || "ws://127.0.0.1:18789/ws"
    const token = process.env.OPENCLAW_TOKEN || ""

    _instance = new GatewayRpcClient({
      wsUrl,
      token,
      onDisconnect: () => {
        console.warn("[GatewayClient] Disconnected from gateway")
      },
    })
  }
  return _instance
}
