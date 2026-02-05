import { create } from "zustand"
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Task, TaskStatus, TaskRole } from "@/lib/db/types"
import type { WebSocketMessage } from "@/lib/websocket/server"
import type { Id } from "@/convex/_generated/dataModel";

interface TaskState {
  tasks: Task[]
  loading: boolean
  error: string | null
  currentProjectId: string | null
  wsConnected: boolean

  // Actions
  setCurrentProjectId: (projectId: string | null) => void
  setTasks: (tasks: Task[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  addTask: (task: Task) => void
  updateTaskInStore: (task: Task) => void
  removeTask: (id: string) => void

  // WebSocket handlers
  handleWebSocketMessage: (message: WebSocketMessage) => void
  setWebSocketConnected: (connected: boolean) => void

  // Selectors
  getTasksByStatus: (status: TaskStatus) => Task[]
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

// Zustand store for local state management
export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  currentProjectId: null,
  wsConnected: false,

  setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),
  setTasks: (tasks) => set({ tasks }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  addTask: (task) => {
    set((state) => ({
      tasks: [task, ...state.tasks],
    }))
  },

  updateTaskInStore: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => t.id === task.id ? task : t),
    }))
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }))
  },

  handleWebSocketMessage: (message: WebSocketMessage) => {
    const { currentProjectId } = get()

    switch (message.type) {
      case 'task:created':
        // Only add if it belongs to current project
        if (message.data.project_id === currentProjectId) {
          set((state) => ({
            tasks: [message.data, ...state.tasks]
          }))
        }
        break

      case 'task:updated':
        // Only update if it belongs to current project
        if (message.data.project_id === currentProjectId) {
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === message.data.id ? message.data : t
            )
          }))
        }
        break

      case 'task:deleted':
        // Only remove if it belongs to current project
        if (message.data.projectId === currentProjectId) {
          set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== message.data.id)
          }))
        }
        break

      case 'task:moved':
        // Only update if it belongs to current project
        if (message.data.projectId === currentProjectId) {
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === message.data.id
                ? { ...t, status: message.data.status, updated_at: Date.now() }
                : t
            )
          }))
        }
        break
    }
  },

  setWebSocketConnected: (connected: boolean) => {
    set({ wsConnected: connected })
  },

  getTasksByStatus: (status) => {
    return get().tasks
      .filter((t) => t.status === status)
      .sort((a, b) => a.position - b.position)
  },
}))

// Hook to fetch tasks from Convex
export function useConvexTasks(projectId: string | null) {
  const convexProjectId = projectId as Id<"projects"> | null;

  const tasks = useQuery(
    api.tasks.getByProject,
    convexProjectId ? { projectId: convexProjectId } : "skip"
  );

  return {
    tasks: tasks ?? [],
    loading: tasks === undefined,
    error: null,
  };
}

// Hook to create a task via Convex
export function useCreateTask() {
  const createMutation = useMutation(api.tasks.create);

  return async (data: CreateTaskData) => {
    const result = await createMutation({
      project_id: data.project_id as Id<"projects">,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      role: data.role,
      assignee: data.assignee,
      requires_human_review: data.requires_human_review,
      tags: data.tags,
    });
    return result;
  };
}

// Hook to update a task via Convex
export function useUpdateTask() {
  const updateMutation = useMutation(api.tasks.update);

  return async (id: string, updates: Omit<Partial<Task>, "id">) => {
    // Convert null values to undefined for Convex compatibility
    const convexUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      convexUpdates[key] = value === null ? undefined : value;
    }

    const result = await updateMutation({
      id: id as Id<"tasks">,
      ...convexUpdates,
    });
    return result;
  };
}

// Hook to move a task via Convex
export function useMoveTask() {
  const moveMutation = useMutation(api.tasks.move);

  return async (id: string, status: TaskStatus, position?: number) => {
    const result = await moveMutation({
      id: id as Id<"tasks">,
      status,
      position,
    });
    return result;
  };
}

// Hook to delete a task via Convex
export function useDeleteTask() {
  const deleteMutation = useMutation(api.tasks.deleteTask);

  return async (id: string) => {
    await deleteMutation({ id: id as Id<"tasks"> });
  };
}
