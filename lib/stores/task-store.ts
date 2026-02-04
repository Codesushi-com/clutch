import { create } from "zustand"
import type { Task, TaskStatus } from "@/lib/db/types"
import type { WebSocketMessage } from "@/lib/websocket/server"

interface TaskState {
  tasks: Task[]
  loading: boolean
  error: string | null
  currentProjectId: string | null
  wsConnected: boolean
  
  // Actions
  fetchTasks: (projectId: string) => Promise<void>
  createTask: (data: CreateTaskData) => Promise<Task>
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  moveTask: (id: string, status: TaskStatus, newIndex?: number) => Promise<void>
  reorderTask: (id: string, status: TaskStatus, newIndex: number) => Promise<void>
  
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
  assignee?: string
  requires_human_review?: boolean
  tags?: string[]
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  currentProjectId: null,
  wsConnected: false,

  fetchTasks: async (projectId) => {
    set({ loading: true, error: null, currentProjectId: projectId })
    
    const response = await fetch(`/api/tasks?projectId=${projectId}`)
    
    if (!response.ok) {
      const data = await response.json()
      set({ loading: false, error: data.error || "Failed to fetch tasks" })
      throw new Error(data.error || "Failed to fetch tasks")
    }
    
    const data = await response.json()
    set({ tasks: data.tasks, loading: false })
  },

  createTask: async (taskData) => {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to create task")
    }
    
    const data = await response.json()
    
    set((state) => ({
      tasks: [data.task, ...state.tasks],
    }))
    
    return data.task
  },

  updateTask: async (id, updates) => {
    const response = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update task")
    }
    
    const data = await response.json()
    
    set((state) => ({
      tasks: state.tasks.map((t) => t.id === id ? data.task : t),
    }))
    
    return data.task
  },

  deleteTask: async (id) => {
    const response = await fetch(`/api/tasks/${id}`, {
      method: "DELETE",
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to delete task")
    }
    
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }))
  },

  moveTask: async (id, status, newIndex) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return
    
    const isSameColumn = task.status === status
    
    // Simplified optimistic update - just move the task visually
    // Server will be the source of truth for exact positions
    const originalTasks = get().tasks
    set((state) => {
      if (isSameColumn && newIndex !== undefined) {
        // Reordering within same column - do a simple visual reorder
        const columnTasks = state.tasks
          .filter(t => t.status === status)
          .sort((a, b) => a.position - b.position)
        
        const oldIndex = columnTasks.findIndex(t => t.id === id)
        if (oldIndex === -1) return state
        
        // Simple array reorder for immediate visual feedback
        const [movedTask] = columnTasks.splice(oldIndex, 1)
        columnTasks.splice(newIndex, 0, movedTask)
        
        // Replace tasks in the same column with reordered ones
        const otherTasks = state.tasks.filter(t => t.status !== status)
        return { tasks: [...otherTasks, ...columnTasks] }
      } else {
        // Moving to different column - just update status
        return {
          tasks: state.tasks.map((t) => 
            t.id === id ? { ...t, status, updated_at: Date.now() } : t
          )
        }
      }
    })
    
    try {
      if (isSameColumn && newIndex !== undefined) {
        // Call reorder API
        const response = await fetch("/api/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: get().currentProjectId,
            status,
            task_id: id,
            new_index: newIndex,
          }),
        })
        
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to reorder task")
        }
        
        // Refresh tasks from server to get correct positions
        await get().fetchTasks(get().currentProjectId!)
      } else {
        // Call move API (regular status update)
        const response = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
        
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to move task")
        }
        
        // Refresh tasks from server to get updated positions for new column
        await get().fetchTasks(get().currentProjectId!)
      }
    } catch (error) {
      // Revert to original state on any failure
      set({ tasks: originalTasks })
      throw error
    }
  },

  reorderTask: async (id, status, newIndex) => {
    // This is just an alias to moveTask with newIndex
    await get().moveTask(id, status, newIndex)
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
