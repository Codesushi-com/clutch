"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Task, TaskStatus } from "@/lib/types"
import { useState, useCallback } from "react"

/**
 * Reactive Convex subscription for tasks by project and status.
 * 
 * Returns tasks updated in real-time whenever tasks are created,
 * updated, moved, or deleted in Convex.
 * 
 * Falls back gracefully if Convex provider is not available.
 */
export function useConvexTasks(
  projectId: string | null,
  status?: TaskStatus
): {
  tasks: Task[] | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.tasks.getByProject,
    projectId ? { projectId, status } : "skip"
  )

  return {
    tasks: result ?? null,
    isLoading: result === undefined,
    error: null,
  }
}

/**
 * Reactive Convex subscription for a single task with comments.
 * 
 * Returns task data updated in real-time whenever the task or its
 * comments change in Convex.
 */
export function useConvexTask(
  taskId: string | null
): {
  task: Task | null
  comments: unknown[] | null
  isLoading: boolean
  error: Error | null
} {
  const result = useQuery(
    api.tasks.getById,
    taskId ? { id: taskId } : "skip"
  )

  return {
    task: result?.task ?? null,
    comments: result?.comments ?? null,
    isLoading: result === undefined,
    error: null,
  }
}

/**
 * Hook that returns tasks grouped by status for the board columns.
 * 
 * Uses Convex reactive queries for real-time updates.
 */
export function useConvexBoardTasks(
  projectId: string | null
): {
  tasksByStatus: Record<TaskStatus, Task[]>
  isLoading: boolean
  error: Error | null
} {
  // Subscribe to all tasks for the project
  const { tasks, isLoading, error } = useConvexTasks(projectId)

  // Group tasks by status
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    backlog: [],
    ready: [],
    in_progress: [],
    in_review: [],
    done: [],
  }

  if (tasks) {
    for (const task of tasks) {
      tasksByStatus[task.status].push(task)
    }

    // Sort each column
    for (const status of Object.keys(tasksByStatus) as TaskStatus[]) {
      if (status === "done") {
        // Done column: most recently completed first
        tasksByStatus[status].sort((a, b) => {
          const aTime = a.completed_at ?? a.updated_at
          const bTime = b.completed_at ?? b.updated_at
          return bTime - aTime
        })
      } else {
        tasksByStatus[status].sort((a, b) => a.position - b.position)
      }
    }
  }

  return {
    tasksByStatus,
    isLoading,
    error,
  }
}

// Default number of tasks to show per column
const DEFAULT_PAGE_SIZE = 25

/**
 * Hook that returns paginated tasks for each board column.
 * Each column tracks its own pagination state independently.
 */
export function usePaginatedBoardTasks(
  projectId: string | null
): {
  tasksByStatus: Record<TaskStatus, Task[]>
  totalCounts: Record<TaskStatus, number>
  isLoading: boolean
  error: Error | null
  hasMore: Record<TaskStatus, boolean>
  loadMore: (status: TaskStatus) => void
} {
  // Track page size per column (starts at DEFAULT_PAGE_SIZE, grows with "load more")
  const [pageSizes, setPageSizes] = useState<Record<TaskStatus, number>>({
    backlog: DEFAULT_PAGE_SIZE,
    ready: DEFAULT_PAGE_SIZE,
    in_progress: DEFAULT_PAGE_SIZE,
    in_review: DEFAULT_PAGE_SIZE,
    done: DEFAULT_PAGE_SIZE,
  })

  // Fetch paginated data for each status
  const backlogResult = useQuery(
    api.tasks.getByProjectAndStatusPaginated,
    projectId ? { projectId, status: "backlog", limit: pageSizes.backlog, offset: 0 } : "skip"
  )
  const readyResult = useQuery(
    api.tasks.getByProjectAndStatusPaginated,
    projectId ? { projectId, status: "ready", limit: pageSizes.ready, offset: 0 } : "skip"
  )
  const inProgressResult = useQuery(
    api.tasks.getByProjectAndStatusPaginated,
    projectId ? { projectId, status: "in_progress", limit: pageSizes.in_progress, offset: 0 } : "skip"
  )
  const inReviewResult = useQuery(
    api.tasks.getByProjectAndStatusPaginated,
    projectId ? { projectId, status: "in_review", limit: pageSizes.in_review, offset: 0 } : "skip"
  )
  const doneResult = useQuery(
    api.tasks.getByProjectAndStatusPaginated,
    projectId ? { projectId, status: "done", limit: pageSizes.done, offset: 0 } : "skip"
  )

  const results = {
    backlog: backlogResult,
    ready: readyResult,
    in_progress: inProgressResult,
    in_review: inReviewResult,
    done: doneResult,
  }

  // Check if any are still loading
  const isLoading = Object.values(results).some((r) => r === undefined)

  // Build tasksByStatus from results
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    backlog: backlogResult?.tasks ?? [],
    ready: readyResult?.tasks ?? [],
    in_progress: inProgressResult?.tasks ?? [],
    in_review: inReviewResult?.tasks ?? [],
    done: doneResult?.tasks ?? [],
  }

  // Build total counts from results
  const totalCounts: Record<TaskStatus, number> = {
    backlog: backlogResult?.totalCount ?? 0,
    ready: readyResult?.totalCount ?? 0,
    in_progress: inProgressResult?.totalCount ?? 0,
    in_review: inReviewResult?.totalCount ?? 0,
    done: doneResult?.totalCount ?? 0,
  }

  // Calculate hasMore for each column
  const hasMore: Record<TaskStatus, boolean> = {
    backlog: (backlogResult?.tasks.length ?? 0) < (backlogResult?.totalCount ?? 0),
    ready: (readyResult?.tasks.length ?? 0) < (readyResult?.totalCount ?? 0),
    in_progress: (inProgressResult?.tasks.length ?? 0) < (inProgressResult?.totalCount ?? 0),
    in_review: (inReviewResult?.tasks.length ?? 0) < (inReviewResult?.totalCount ?? 0),
    done: (doneResult?.tasks.length ?? 0) < (doneResult?.totalCount ?? 0),
  }

  // Load more function - increases page size for a specific column
  const loadMore = useCallback((status: TaskStatus) => {
    setPageSizes((prev) => ({
      ...prev,
      [status]: prev[status] + DEFAULT_PAGE_SIZE,
    }))
  }, [])

  return {
    tasksByStatus,
    totalCounts,
    isLoading,
    error: null,
    hasMore,
    loadMore,
  }
}
