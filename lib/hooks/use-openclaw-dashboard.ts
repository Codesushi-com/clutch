"use client"

import { useState, useEffect, useCallback } from "react"

interface GatewayStatus {
  ok: boolean
  version: string
  uptime: number
  defaultModel: string
}

interface SessionStats {
  total: number
  active: number
  byAgent: Array<{ agentId: string; count: number }>
}

interface UsageStats {
  totalTokens: number
  totalCost: number
  inputTokens: number
  outputTokens: number
}

interface Channel {
  id: string
  label: string
  connected: boolean
  accountId?: string
}

interface CronStats {
  total: number
  enabled: number
  disabled: number
}

interface DashboardError {
  source: string
  message: string
}

interface DashboardData {
  gateway: GatewayStatus
  sessions: SessionStats
  usage24h: UsageStats
  channels: Channel[]
  cron: CronStats
  errors?: DashboardError[]
}

interface UseOpenClawDashboardReturn {
  data: DashboardData | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/** Default refresh interval: 30 seconds */
const DEFAULT_REFRESH_INTERVAL_MS = 30000

/**
 * Hook to fetch and poll OpenClaw dashboard data.
 *
 * Aggregates data from multiple OpenClaw RPC methods into a single response
 * for dashboard widgets. Automatically refreshes every 30 seconds.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { data, isLoading, error } = useOpenClawDashboard()
 *
 *   if (isLoading) return <Spinner />
 *   if (error) return <Error message={error.message} />
 *
 *   return (
 *     <div>
 *       <GatewayStatus status={data.gateway} />
 *       <SessionStats stats={data.sessions} />
 *       <UsageStats stats={data.usage24h} />
 *     </div>
 *   )
 * }
 * ```
 */
export function useOpenClawDashboard(
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS
): UseOpenClawDashboardReturn {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/openclaw/dashboard")

      if (!response.ok) {
        // For 503 (gateway down), we still get valid JSON with default values
        if (response.status !== 503) {
          throw new Error(`Failed to fetch dashboard: ${response.status}`)
        }
      }

      const result = (await response.json()) as DashboardData
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(fetchData, refreshIntervalMs)
    return () => clearInterval(interval)
  }, [fetchData, refreshIntervalMs])

  const refetch = useCallback(() => {
    setIsLoading(true)
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch,
  }
}

export type {
  DashboardData,
  GatewayStatus,
  SessionStats,
  UsageStats,
  Channel,
  CronStats,
  DashboardError,
}
