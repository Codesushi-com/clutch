"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Event } from "@/lib/types"

/**
 * Reactive Convex subscription for events by task.
 * 
 * Returns events updated in real-time whenever events are created
 * or updated in Convex.
 * 
 * Falls back gracefully if Convex provider is not available.
 */
export function useTaskEvents(
  taskId: string | null,
  limit?: number
): {
  events: Event[] | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.events.getByTask,
    taskId ? { taskId, limit } : "skip"
  )

  return {
    events: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}
