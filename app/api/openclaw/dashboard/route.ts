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
      version?: string
      timestamp?: number
      defaultModel?: string
    }>("health")

    return {
      ok: result.ok ?? false,
      version: result.version ?? "unknown",
      uptime: result.timestamp ? Date.now() - result.timestamp : 0,
      defaultModel: result.defaultModel ?? "unknown",
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

/** Fetch sessions list from OpenClaw */
async function fetchSessions(
  client: ReturnType<typeof getOpenClawClient>
): Promise<{
  total: number
  active: number
  byAgent: Array<{ agentId: string; count: number }>
} | null> {
  try {
    const result = await client.rpc<{
      sessions?: Array<{
        agentId?: string
        lastActivityAt?: number
      }>
      total?: number
    }>("sessions.list", { limit: 1000 })

    const sessions = result.sessions ?? []
    const total = result.total ?? sessions.length

    // Count active sessions (updated in last 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    const active = sessions.filter(
      (s) => s.lastActivityAt && s.lastActivityAt > tenMinutesAgo
    ).length

    // Group by agent
    const agentCounts = new Map<string, number>()
    for (const session of sessions) {
      const agentId = session.agentId ?? "unknown"
      agentCounts.set(agentId, (agentCounts.get(agentId) ?? 0) + 1)
    }

    const byAgent = Array.from(agentCounts.entries()).map(
      ([agentId, count]) => ({
        agentId,
        count,
      })
    )

    return { total, active, byAgent }
  } catch {
    return null
  }
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
      channels?: Array<{
        id: string
        label?: string
        connected?: boolean
        accountId?: string
      }>
    }>("channels.status")

    return (
      result.channels?.map((ch) => ({
        id: ch.id,
        label: ch.label ?? ch.id,
        connected: ch.connected ?? false,
        accountId: ch.accountId,
      })) ?? []
    )
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
      fetchSessions(client),
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
