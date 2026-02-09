"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { TaskStatus } from "@/lib/types"

/**
 * Task information for session association
 */
export interface SessionTaskInfo {
  id: string
  title: string
  status: TaskStatus
  project_id: string
  session_id: string
}

/**
 * Reactive Convex subscription for tasks by session IDs.
 * 
 * Returns tasks associated with the given session IDs, updated in real-time
 * whenever tasks are updated in Convex.
 * 
 * Falls back gracefully if Convex provider is not available.
 */
export function useTasksBySessionIds(sessionIds: string[]): {
  tasks: SessionTaskInfo[] | null
  isLoading: boolean
} {
  const result = useQuery(
    api.tasks.getBySessionIds,
    sessionIds.length > 0 ? { sessionIds } : "skip"
  )

  return {
    tasks: result ?? null,
    isLoading: result === undefined,
  }
}
