"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Task, TaskStatus } from "@/lib/types"
import { useState, useCallback, useMemo } from "react"

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
    blocked: [],
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
const DONE_COLUMN_PAGE_SIZE = 10  // Smaller initial batch for done column

/**
 * Hook that returns paginated tasks for each board column.
 * Uses a single Convex query for all tasks to ensure real-time updates
 * work correctly when tasks move between columns.
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
  // Done column starts with smaller batch size for performance (can have 100s of tasks)
  const [pageSizes, setPageSizes] = useState<Record<TaskStatus, number>>({
    backlog: DEFAULT_PAGE_SIZE,
    ready: DEFAULT_PAGE_SIZE,
    in_progress: DEFAULT_PAGE_SIZE,
    in_review: DEFAULT_PAGE_SIZE,
    blocked: DEFAULT_PAGE_SIZE,
    done: DONE_COLUMN_PAGE_SIZE,
  })

  // Use a single reactive query for all tasks in the project
  // This ensures real-time updates when tasks move between columns
  const allTasksResult = useQuery(
    api.tasks.getByProject,
    projectId ? { projectId } : "skip"
  )

  const isLoading = allTasksResult === undefined

  // Group tasks by status and apply pagination
  const tasksByStatus = useMemo<Record<TaskStatus, Task[]>>(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      backlog: [],
      ready: [],
      in_progress: [],
      in_review: [],
      blocked: [],
      done: [],
    }

    if (!allTasksResult) {
      return grouped
    }

    // Group tasks by status
    for (const task of allTasksResult) {
      grouped[task.status].push(task)
    }

    // Sort each column: done by completed_at desc, others by position asc
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      if (status === 'done') {
        grouped[status].sort((a, b) => {
          const aTime = a.completed_at ?? a.updated_at
          const bTime = b.completed_at ?? b.updated_at
          return bTime - aTime
        })
      } else {
        grouped[status].sort((a, b) => a.position - b.position)
      }
    }

    // Apply pagination
    return {
      backlog: grouped.backlog.slice(0, pageSizes.backlog),
      ready: grouped.ready.slice(0, pageSizes.ready),
      in_progress: grouped.in_progress.slice(0, pageSizes.in_progress),
      in_review: grouped.in_review.slice(0, pageSizes.in_review),
      blocked: grouped.blocked.slice(0, pageSizes.blocked),
      done: grouped.done.slice(0, pageSizes.done),
    }
  }, [allTasksResult, pageSizes])

  // Calculate total counts for each column
  const totalCounts = useMemo<Record<TaskStatus, number>>(() => {
    const counts: Record<TaskStatus, number> = {
      backlog: 0,
      ready: 0,
      in_progress: 0,
      in_review: 0,
      blocked: 0,
      done: 0,
    }

    if (!allTasksResult) {
      return counts
    }

    for (const task of allTasksResult) {
      counts[task.status]++
    }

    return counts
  }, [allTasksResult])

  // Calculate hasMore for each column
  const hasMore = useMemo<Record<TaskStatus, boolean>>(() => ({
    backlog: tasksByStatus.backlog.length < totalCounts.backlog,
    ready: tasksByStatus.ready.length < totalCounts.ready,
    in_progress: tasksByStatus.in_progress.length < totalCounts.in_progress,
    in_review: tasksByStatus.in_review.length < totalCounts.in_review,
    blocked: tasksByStatus.blocked.length < totalCounts.blocked,
    done: tasksByStatus.done.length < totalCounts.done,
  }), [tasksByStatus, totalCounts])

  // Load more function - increases page size for a specific column
  // Done column increments by smaller batch size (10) vs others (25)
  const loadMore = useCallback((status: TaskStatus) => {
    const increment = status === 'done' ? DONE_COLUMN_PAGE_SIZE : DEFAULT_PAGE_SIZE
    setPageSizes((prev) => ({
      ...prev,
      [status]: prev[status] + increment,
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
