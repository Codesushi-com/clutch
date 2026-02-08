"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Session, SessionType, SessionStatus } from "@/convex/sessions"

export type { Session, SessionType, SessionStatus }

export interface SessionFilters {
  sessionType?: SessionType
  status?: SessionStatus
  projectSlug?: string
}

/**
 * Reactive Convex subscription for sessions from the sessions table.
 *
 * Returns sessions from the unified sessions table, updated in real-time
 * whenever sessions are updated in Convex.
 *
 * Works for ALL session types:
 * - main: Main Ada session
 * - agent: Agent sessions (replaces isolated/subagent)
 * - chat: Chat sessions
 * - cron: Cron job sessions
 *
 * @param filters - Optional filters for type, status, or project
 * @param limit - Maximum number of sessions to return
 */
export function useSessions(
  filters: SessionFilters = {},
  limit?: number
): {
  sessions: Session[] | null
  isLoading: boolean
} {
  // Use project-specific query if projectSlug is provided
  const projectResult = useQuery(
    api.sessions.getForProject,
    filters.projectSlug ? { projectSlug: filters.projectSlug } : "skip"
  )

  // Use list query if no project filter
  const listResult = useQuery(
    api.sessions.list,
    !filters.projectSlug ? {} : "skip"
  )

  // Return the appropriate result
  const result = filters.projectSlug ? projectResult : listResult

  // Apply client-side filters
  let filtered = result
  if (filtered && (filters.sessionType || filters.status)) {
    filtered = filtered.filter((s: Session) => {
      if (filters.sessionType && s.session_type !== filters.sessionType) return false
      if (filters.status && s.status !== filters.status) return false
      return true
    })
  }

  // Apply limit client-side
  if (filtered && limit && limit > 0) {
    filtered = filtered.slice(0, limit)
  }

  return {
    sessions: filtered ?? null,
    isLoading: result === undefined,
  }
}

/**
 * Get a single session by its session_key
 */
export function useSession(sessionKey: string): {
  session: Session | null
  isLoading: boolean
} {
  const result = useQuery(
    api.sessions.get,
    sessionKey ? { sessionKey } : "skip"
  )

  return {
    session: result ?? null,
    isLoading: result === undefined && !!sessionKey,
  }
}

/**
 * Get sessions associated with a specific task
 */
export function useSessionsByTask(taskId: string): {
  sessions: Session[] | null
  isLoading: boolean
} {
  const result = useQuery(
    api.sessions.getByTask,
    taskId ? { taskId } : "skip"
  )

  return {
    sessions: result ?? null,
    isLoading: result === undefined && !!taskId,
  }
}

/**
 * Get sessions for a specific project by slug
 */
export function useSessionsForProject(projectSlug: string): {
  sessions: Session[] | null
  isLoading: boolean
} {
  const result = useQuery(
    api.sessions.getForProject,
    projectSlug ? { projectSlug } : "skip"
  )

  return {
    sessions: result ?? null,
    isLoading: result === undefined && !!projectSlug,
  }
}
