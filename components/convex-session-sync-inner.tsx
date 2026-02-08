"use client"

/**
 * Convex Session Sync - Inner Component
 *
 * The actual implementation that uses Convex hooks.
 * This is dynamically imported with ssr: false to avoid SSR issues.
 *
 * Now uses the sessions table instead of deriving sessions from tasks.
 */

import { useEffect } from "react"
import { useSessions } from "@/lib/hooks/use-sessions"
import { useSessionStore } from "@/lib/stores/session-store"

interface ConvexSessionSyncInnerProps {
  /** Optional project slug to filter sessions. If not provided, syncs all sessions. */
  projectSlug?: string | null
  /** Optional session type filter */
  sessionType?: "main" | "chat" | "agent" | "cron"
}

export function ConvexSessionSyncInner({ projectSlug, sessionType }: ConvexSessionSyncInnerProps) {
  // Subscribe to Convex sessions table (reactive, no polling)
  const { sessions, isLoading } = useSessions(
    { projectSlug: projectSlug ?? undefined, sessionType },
    100
  )

  // Get store actions
  const setSessions = useSessionStore((state) => state.setSessions)
  const setLoading = useSessionStore((state) => state.setLoading)
  const setInitialized = useSessionStore((state) => state.setInitialized)
  const setError = useSessionStore((state) => state.setError)

  // Sync Convex data to zustand store
  useEffect(() => {
    if (isLoading) {
      setLoading(true)
      return
    }

    if (sessions) {
      setSessions(sessions)
      setInitialized(true)
      setError(null)
    }
  }, [sessions, isLoading, setSessions, setLoading, setInitialized, setError])

  // This component doesn't render anything
  return null
}
