import { create } from "zustand"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Task, TaskStatus, TaskRole } from "@/lib/db/types"
import type { Id } from "@/convex/_generated/server"

interface TaskState {
  // UI state only - data comes from Convex
  currentProjectId: string | null
  loading: boolean
  error: string | null
  
  // Actions
  setCurrentProjectId: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export interface CreateTaskData {
  project_id: string
  title: string
  description?: string
  status?: TaskStatus
  priority?: "low" | "medium" | "high" | "urgent"
  role?: TaskRole
  assignee?: string
  requires_human_review?: boolean
  tags?: string[]
}

export const useTaskStore = create<TaskState>((set) => ({
  currentProjectId: null,
  loading: false,
  error: null,

  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))

// ============================================
// Convex Hooks for Data Fetching
// ============================================

/**
 * Hook to fetch tasks by project with optional status filter
 * Uses Convex for real-time subscriptions
 */
export function useTasks(projectId: Id<"projects"> | null, status?: TaskStatus) {
  return useQuery(
    api.tasks.getByProject,
    projectId ? { projectId, status } : "skip"
  )
}

/**
 * Hook to fetch a single task by ID with its comments
 */
export function useTask(id: Id<"tasks"> | null) {
  return useQuery(api.tasks.getById, id ? { id } : "skip")
}

/**
 * Hook to fetch tasks assigned to a specific user
 */
export function useTasksByAssignee(assignee: string | null) {
  return useQuery(
    api.tasks.getByAssignee,
    assignee ? { assignee } : "skip"
  )
}

/**
 * Hook to fetch a task with its dependencies
 */
export function useTaskWithDependencies(id: Id<"tasks"> | null) {
  return useQuery(
    api.tasks.getWithDependencies,
    id ? { id } : "skip"
  )
}

// ============================================
// Convex Mutations
// ============================================

/**
 * Hook to create a new task
 */
export function useCreateTask() {
  return useMutation(api.tasks.create)
}

/**
 * Hook to update a task
 */
export function useUpdateTask() {
  return useMutation(api.tasks.update)
}

/**
 * Hook to move a task to a different status/column
 */
export function useMoveTask() {
  return useMutation(api.tasks.move)
}

/**
 * Hook to reorder a task within its current column
 */
export function useReorderTask() {
  return useMutation(api.tasks.reorder)
}

/**
 * Hook to delete a task
 */
export function useDeleteTask() {
  return useMutation(api.tasks.deleteTask)
}

// ============================================
// Legacy selector helpers (for compatibility)
// ============================================

/**
 * Get tasks filtered by status, sorted by position
 * Note: This is a helper function - use useTasks() hook for reactive data
 */
export function getTasksByStatus(tasks: Task[] | undefined, status: TaskStatus): Task[] {
  if (!tasks) return []
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => a.position - b.position)
}
