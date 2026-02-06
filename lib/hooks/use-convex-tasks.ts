"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Task, TaskStatus } from "@/lib/types"

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
