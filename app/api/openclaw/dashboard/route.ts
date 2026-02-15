import { NextResponse } from "next/server"
import { getOpenClawClient, initializeOpenClawClient } from "@/lib/openclaw/client"

/**
 * GET /api/openclaw/dashboard
 *
 * Aggregates data from multiple OpenClaw RPC methods into a single response
 * for the dashboard widgets. Includes caching to avoid hammering the gateway.
 */

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30000

interface DashboardCache {
  data: DashboardResponse
  timestamp: number
}

interface DashboardResponse {
  gateway: {
    ok: boolean
    version: string
    uptime: number
    defaultModel: string
  }
  sessions: {
    total: number
    active: number
    byAgent: Array<{ agentId: string; count: number }>
  }
  usage24h: {
    totalTokens: number
    totalCost: number
    inputTokens: number
    outputTokens: number
  }
  channels: Array<{
    id: string
    label: string
    connected: boolean
    accountId?: string
  }>
  cron: {
    total: number
    enabled: number
    disabled: number
  }
  errors?: Array<{
    source: string
    message: string
  }>
}

// Simple in-memory cache
let cache: DashboardCache | null = null

/** Max time to wait for WS connection (ms) */
const CONNECTION_TIMEOUT_MS = 10000

/** Poll interval for checking connection status (ms) */
const CONNECTION_POLL_MS = 100

/** Ensure the WS client is connected (lazy init) */
function ensureClient() {
  const client = getOpenClawClient()
  if (client.getStatus() === "disconnected") {
    initializeOpenClawClient()
  }
  return client
}

/** Wait for the client to connect, with timeout */
async function waitForConnection(
  client: ReturnType<typeof getOpenClawClient>,
  timeoutMs: number
): Promise<boolean> {
  if (client.getStatus() === "connected") {
    return true
  }

  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (client.getStatus() === "connected") {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, CONNECTION_POLL_MS))
  }

  return client.getStatus() === "connected"
}

/** Fetch health data from OpenClaw */
async function fetchHealth(
  client: ReturnType<typeof getOpenClawClient>
): Promise<{
  ok: boolean
  version: string
  uptime: number
  defaultModel: string
} | null> {
  try {
    const result = await client.rpc<{
      ok: boolean
      ts?: number
    }>("health")

    const serverInfo = client.getServerInfo()
    return {
      ok: result.ok ?? false,
      version: serverInfo.version ?? "unknown",
      uptime: serverInfo.uptimeMs ?? 0,
      defaultModel: "unknown",
    }
  } catch {
    return null
  }
}

/** Fetch status data from OpenClaw */
async function fetchStatus(
  client: ReturnType<typeof getOpenClawClient>
): Promise<{
  sessionCount: number
  agentCount: number
} | null> {
  try {
    const result = await client.rpc<{
      sessionCount?: number
      agentCount?: number
    }>("status")

    return {
      sessionCount: result.sessionCount ?? 0,
      agentCount: result.agentCount ?? 0,
    }
  } catch {
    return null
  }
}

/** Fetch sessions list from OpenClaw
 *
 * NOTE: Session tracking moved to Convex (agent_session_key, agent_spawned_at).
 * This RPC-based approach is deprecated. Returns empty data for backwards compatibility.
 */
async function fetchSessions(): Promise<{
  total: number
  active: number
  byAgent: Array<{ agentId: string; count: number }>
} | null> {
  // Sessions are now tracked via Convex fields (agent_session_key, agent_spawned_at)
  // and session-file-reader.ts. The RPC-based sessions.list is deprecated.
  return { total: 0, active: 0, byAgent: [] }
}

/** Fetch usage data from OpenClaw */
async function fetchUsage(
  client: ReturnType<typeof getOpenClawClient>
): Promise<{
  totalTokens: number
  totalCost: number
  inputTokens: number
  outputTokens: number
} | null> {
  try {
    const result = await client.rpc<{
      totalTokens?: number
      totalCost?: number
      inputTokens?: number
      outputTokens?: number
    }>("usage.cost", { days: 1 })

    return {
      totalTokens: result.totalTokens ?? 0,
      totalCost: result.totalCost ?? 0,
      inputTokens: result.inputTokens ?? 0,
      outputTokens: result.outputTokens ?? 0,
    }
  } catch {
    return null
  }
}

/** Fetch channels status from OpenClaw */
async function fetchChannels(
  client: ReturnType<typeof getOpenClawClient>
): Promise<
  Array<{
    id: string
    label: string
    connected: boolean
    accountId?: string
  }>
  | null
> {
  try {
    const result = await client.rpc<{
      channels?: Record<string, {
        configured?: boolean
        running?: boolean
        lastError?: string | null
      }>
      channelLabels?: Record<string, string>
    }>("channels.status")

    const channels = result.channels ?? {}
    const labels = result.channelLabels ?? {}
    const channelList = Object.entries(channels).map(([id, ch]) => ({
      id,
      label: labels[id] ?? id,
      connected: ch.running ?? ch.configured ?? false,
      accountId: undefined,
    }))
    // Override clutch channel status — it's a hook-based plugin without
    // gateway.startAccount, so channels.status never reports it as running.
    // Use the WS client connection status instead.
    const clutchEntry = channelList.find(c => c.id === "clutch")
    if (clutchEntry) {
      clutchEntry.connected = client.getStatus() === "connected"
    }
    return channelList
  } catch {
    return null
  }
}

/** Fetch cron jobs status from OpenClaw */
async function fetchCron(
  client: ReturnType<typeof getOpenClawClient>
): Promise<{
  total: number
  enabled: number
  disabled: number
} | null> {
  try {
    const result = await client.rpc<{
      jobs?: Array<{
        enabled?: boolean
      }>
    }>("cron.list")

    const jobs = result.jobs ?? []
    const total = jobs.length
    const enabled = jobs.filter((j) => j.enabled !== false).length
    const disabled = total - enabled

    return { total, enabled, disabled }
  } catch {
    return null
  }
}

export async function GET(): Promise<NextResponse> {
  const client = ensureClient()
  const errors: Array<{ source: string; message: string }> = []

  // Check cache first
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data)
  }

  // Wait for connection
  const isConnected = await waitForConnection(client, CONNECTION_TIMEOUT_MS)

  if (!isConnected) {
    return NextResponse.json(
      {
        gateway: {
          ok: false,
          version: "unknown",
          uptime: 0,
          defaultModel: "unknown",
        },
        sessions: { total: 0, active: 0, byAgent: [] },
        usage24h: {
          totalTokens: 0,
          totalCost: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
        channels: [],
        cron: { total: 0, enabled: 0, disabled: 0 },
        errors: [
          { source: "connection", message: "OpenClaw gateway not connected" },
        ],
      },
      { status: 503 }
    )
  }

  // Fetch all data in parallel
  const [healthData, statusData, sessionsData, usageData, channelsData, cronData] =
    await Promise.all([
      fetchHealth(client),
      fetchStatus(client),
      fetchSessions(),
      fetchUsage(client),
      fetchChannels(client),
      fetchCron(client),
    ])

  // Track errors
  if (!healthData) {
    errors.push({ source: "health", message: "Failed to fetch health data" })
  }
  if (!statusData) {
    errors.push({ source: "status", message: "Failed to fetch status data" })
  }
  if (!sessionsData) {
    errors.push({ source: "sessions", message: "Failed to fetch sessions data" })
  }
  if (!usageData) {
    errors.push({ source: "usage", message: "Failed to fetch usage data" })
  }
  if (!channelsData) {
    errors.push({ source: "channels", message: "Failed to fetch channels data" })
  }
  if (!cronData) {
    errors.push({ source: "cron", message: "Failed to fetch cron data" })
  }

  const response: DashboardResponse = {
    gateway: healthData ?? {
      ok: false,
      version: "unknown",
      uptime: 0,
      defaultModel: "unknown",
    },
    sessions: sessionsData ?? { total: 0, active: 0, byAgent: [] },
    usage24h: usageData ?? {
      totalTokens: 0,
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
    channels: channelsData ?? [],
    cron: cronData ?? { total: 0, enabled: 0, disabled: 0 },
  }

  if (errors.length > 0) {
    response.errors = errors
  }

  // Update cache
  cache = {
    data: response,
    timestamp: Date.now(),
  }

  return NextResponse.json(response)
}
