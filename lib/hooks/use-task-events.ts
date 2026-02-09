"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Event } from "@/lib/types"

/**
 * Map task_events event_type → Event type for timeline rendering
 */
function mapEventType(eventType: string): Event["type"] {
  const mapping: Record<string, Event["type"]> = {
    status_changed: "task_moved",
    agent_assigned: "agent_started",
    agent_completed: "agent_completed",
    agent_reaped: "agent_completed",
    pr_opened: "task_moved",
    pr_merged: "task_completed",
    comment_added: "comment_added",
    triage_sent: "task_moved",
    triage_resolved: "task_moved",
    triage_escalated: "task_moved",
  }
  return mapping[eventType] ?? "task_moved"
}

/**
 * Reactive Convex subscription for task events.
 * 
 * Queries the task_events table (where the work loop writes)
 * and maps results to the Event shape expected by the timeline UI.
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
    api.task_events.getByTaskId,
    taskId ? { taskId, limit } : "skip"
  )

  // Map TaskEvent → Event shape for the timeline component
  const events: Event[] | null = result
    ? result.map((te: { id: string; project_id: string; task_id: string; event_type: string; timestamp: number; actor: string | null; data: string | null }) => ({
        id: te.id,
        project_id: te.project_id,
        task_id: te.task_id,
        type: mapEventType(te.event_type),
        actor: te.actor ?? "system",
        data: te.data,
        created_at: te.timestamp,
      }))
    : null

  return {
    events,
    isLoading: result === undefined,
    error: null,
  }
}
