"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import type { SessionStatusInfo } from "@/app/api/sessions/status/route"

export interface SessionStatusMap {
  [sessionId: string]: SessionStatusInfo
}

/**
 * Hook to fetch and manage session status for multiple session IDs
 */
export function useSessionStatus(sessionIds: string[]) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatusMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSessionIdsRef = useRef<string>('')

  const fetchSessionStatus = useCallback(async (ids: string[]) => {
    // Filter out empty/null session IDs
    const validIds = ids.filter(id => id && typeof id === 'string')
    
    if (validIds.length === 0) {
      setSessionStatus({})
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/sessions/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionIds: validIds })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setSessionStatus(data.sessions || {})
    } catch (err) {
      console.error('Failed to fetch session status:', err)
      setError(err instanceof Error ? err.message : String(err))
      // Keep previous session status on error
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch when session IDs change
  useEffect(() => {
    const idsString = JSON.stringify(sessionIds.sort())
    
    // Only fetch if session IDs actually changed
    if (idsString !== lastSessionIdsRef.current) {
      lastSessionIdsRef.current = idsString
      fetchSessionStatus(sessionIds)
    }
  }, [sessionIds, fetchSessionStatus])

  // Auto-refresh every 15 seconds for active sessions (in-progress tasks)
  useEffect(() => {
    const hasActiveSessions = Object.values(sessionStatus).some(
      status => status.isActive || status.status === 'running'
    )
    
    if (!hasActiveSessions) return

    const interval = setInterval(() => {
      const validIds = sessionIds.filter(id => id && typeof id === 'string')
      if (validIds.length > 0) {
        fetchSessionStatus(validIds)
      }
    }, 15000) // 15 seconds for more responsive updates

    return () => clearInterval(interval)
  }, [sessionIds, sessionStatus, fetchSessionStatus])

  const refetch = useCallback(() => {
    fetchSessionStatus(sessionIds)
  }, [sessionIds, fetchSessionStatus])

  return {
    sessionStatus,
    loading,
    error,
    refetch
  }
}

/**
 * Hook to get session status for a single session ID
 */
export function useSingleSessionStatus(sessionId?: string) {
  const sessionIds = sessionId ? [sessionId] : []
  const { sessionStatus, loading, error, refetch } = useSessionStatus(sessionIds)
  
  return {
    sessionStatus: sessionId ? sessionStatus[sessionId] || null : null,
    loading,
    error,
    refetch
  }
}

/**
 * Get session status indicator emoji and color
 */
export function getSessionStatusIndicator(status?: SessionStatusInfo) {
  if (!status) {
    return { emoji: '⚪', color: '#6b7280', title: 'No session' }
  }

  if (status.status === 'not_found') {
    return { emoji: '⚪', color: '#6b7280', title: 'Session not found' }
  }

  if (status.isActive) {
    return { emoji: '🟢', color: '#22c55e', title: 'Active - recent activity' }
  }

  if (status.isStuck) {
    return { emoji: '🔴', color: '#ef4444', title: 'Stuck/Error - no activity for 15+ minutes' }
  }

  if (status.isIdle) {
    return { emoji: '🟡', color: '#eab308', title: 'Idle - no activity for 5+ minutes' }
  }

  // Default to idle for unknown states
  return { emoji: '🟡', color: '#eab308', title: 'Unknown status' }
}