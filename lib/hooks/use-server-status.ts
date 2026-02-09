"use client"

import { useState, useEffect, useCallback } from "react"
import type { ServerStatus } from "@/app/api/status/route"

interface UseServerStatusReturn {
  status: ServerStatus | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Hook to fetch and poll server status information.
 * 
 * Returns the current server status including start time, uptime,
 * version, and git commit. Automatically refreshes every 30 seconds.
 */
export function useServerStatus(): UseServerStatusReturn {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status")
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`)
      }
      const data = await response.json() as ServerStatus
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll every 30 seconds to keep uptime current
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const refetch = useCallback(() => {
    setIsLoading(true)
    fetchStatus()
  }, [fetchStatus])

  return {
    status,
    isLoading,
    error,
    refetch,
  }
}
