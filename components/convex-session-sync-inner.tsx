"use client"

/**
 * Convex Session Sync - Inner Component
 *
 * The actual implementation that uses Convex hooks.
 * This is dynamically imported with ssr: false to avoid SSR issues.
 */

import { useEffect } from "react"
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions"
import { useSessionStore } from "@/lib/stores/session-store"
import type { Session } from "@/lib/types"

/**
 * Convert AgentSession from Convex to Session type for zustand store compatibility
 */
function convertAgentSessionToSession(agentSession: {
  id: string
  name: string
  type: "main" | "isolated" | "subagent"
  model: string
  status: "running" | "idle" | "completed"
  createdAt: string
  updatedAt: string
  completedAt?: string
  tokens: {
    input: number
    output: number
    total: number
  }
  task: {
    id: string
    title: string
    status: "backlog" | "ready" | "in_progress" | "in_review" | "done"
  }
}): Session {
  return {
    id: agentSession.id,
    name: agentSession.name,
    type: agentSession.type,
    model: agentSession.model,
    status: agentSession.status,
    createdAt: agentSession.createdAt,
    updatedAt: agentSession.updatedAt,
    completedAt: agentSession.completedAt,
    tokens: agentSession.tokens,
    task: {
      id: agentSession.task.id,
      title: agentSession.task.title,
      status: agentSession.task.status,
    },
  }
}

interface ConvexSessionSyncInnerProps {
  /** Optional project ID to filter sessions. If not provided, syncs all sessions. */
  projectId?: string | null
}

export function ConvexSessionSyncInner({ projectId }: ConvexSessionSyncInnerProps) {
  // Subscribe to Convex sessions (reactive, no polling)
  const { sessions: agentSessions, isLoading } = useAgentSessions(projectId)

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

    if (agentSessions) {
      // Convert AgentSession[] to Session[]
      const sessions = agentSessions.map(convertAgentSessionToSession)
      setSessions(sessions)
      setInitialized(true)
      setError(null)
    }
  }, [agentSessions, isLoading, setSessions, setLoading, setInitialized, setError])

  // This component doesn't render anything
  return null
}
