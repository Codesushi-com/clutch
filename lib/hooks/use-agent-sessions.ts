"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { AgentSession } from "@/convex/tasks"

export type { AgentSession }

/**
 * Reactive Convex subscription for agent sessions.
 *
 * Returns sessions derived from tasks that have agent_session_key set,
 * updated in real-time whenever tasks are updated in Convex.
 *
 * This replaces the openclaw sessions CLI dependency for the Sessions tab.
 *
 * @param projectId - Optional project ID to filter by. If not provided, returns sessions from all projects.
 * @param limit - Maximum number of sessions to return
 */
export function useAgentSessions(projectId?: string | null, limit?: number): {
  sessions: AgentSession[] | null
  isLoading: boolean
} {
  // Use project-specific query if projectId is provided, otherwise use global query
  const projectResult = useQuery(
    api.tasks.getAgentSessions,
    projectId ? { projectId, limit } : "skip"
  )

  const globalResult = useQuery(
    api.tasks.getAllAgentSessions,
    projectId ? "skip" : { limit }
  )

  // Return the appropriate result based on which query is active
  const result = projectId ? projectResult : globalResult

  return {
    sessions: result ?? null,
    isLoading: result === undefined,
  }
}
