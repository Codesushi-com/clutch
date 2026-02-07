"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type {
  WorkLoopState,
  WorkLoopRun,
  WorkLoopStats,
} from "@/lib/types/work-loop"
import type { Task } from "@/lib/types"

/**
 * Reactive Convex subscription for work loop state.
 * 
 * Returns the current state updated in real-time whenever
 * the work loop state changes in Convex.
 */
export function useWorkLoopState(
  projectId: string | null
): {
  state: WorkLoopState | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.workLoop.getState,
    projectId ? { projectId } : "skip"
  )

  return {
    state: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}

/**
 * Reactive Convex subscription for work loop runs.
 * 
 * Returns recent runs updated in real-time whenever new
 * runs are logged to Convex.
 */
export function useWorkLoopRuns(
  projectId: string | null,
  limit?: number
): {
  runs: WorkLoopRun[] | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.workLoop.listRuns,
    projectId ? { projectId, limit: limit ?? 50 } : "skip"
  )

  return {
    runs: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}

/**
 * Reactive Convex subscription for work loop stats.
 *
 * Returns aggregated stats for today, updated in real-time.
 */
export function useWorkLoopStats(
  projectId: string | null
): {
  stats: WorkLoopStats | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.workLoop.getStats,
    projectId ? { projectId } : "skip"
  )

  return {
    stats: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}

/**
 * Reactive Convex subscription for tasks with active agents.
 *
 * Returns tasks that currently have an active agent working on them,
 * sorted by most recently active first.
 */
export function useActiveAgentTasks(
  projectId: string | null
): {
  tasks: Task[] | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.tasks.getWithActiveAgents,
    projectId ? { projectId } : "skip"
  )

  return {
    tasks: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}

/**
 * Reactive Convex subscription for agent activity history.
 *
 * Returns all tasks that have been worked on by agents (have agent_started_at),
 * sorted by most recently started first. Used by the Agents page.
 */
export function useAgentHistory(
  projectId: string | null
): {
  tasks: Task[] | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.tasks.getAgentHistory,
    projectId ? { projectId } : "skip"
  )

  return {
    tasks: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}
