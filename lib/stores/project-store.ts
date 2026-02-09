import { create } from "zustand"
import type { Project } from "@/lib/types"

export type ProjectWithCount = Project & { task_count: number }

interface ProjectState {
  projects: ProjectWithCount[]
  loading: boolean
  error: string | null
  
  // Actions
  fetchProjects: () => Promise<void>
  createProject: (data: CreateProjectData) => Promise<ProjectWithCount>
  updateProject: (id: string, data: Partial<CreateProjectData>) => Promise<ProjectWithCount>
  deleteProject: (id: string) => Promise<void>
}

export interface CreateProjectData {
  name: string
  slug: string
  description?: string
  color?: string
  repo_url?: string
  local_path?: string
  github_repo?: string
  chat_layout?: 'slack' | 'imessage'
}

// Hook for components that expect a simple create function
export function useCreateProject() {
  const createProject = useProjectStore((s) => s.createProject)
  return createProject
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null })
    
    const response = await fetch("/api/projects")
    
    if (!response.ok) {
      const data = await response.json()
      set({ loading: false, error: data.error || "Failed to fetch projects" })
      throw new Error(data.error || "Failed to fetch projects")
    }
    
    const data = await response.json()
    set({ projects: data.projects, loading: false })
  },

  createProject: async (projectData) => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to create project")
    }
    
    const data = await response.json()
    const newProject = { ...data.project, task_count: 0 }
    
    set((state) => ({
      projects: [newProject, ...state.projects],
    }))
    
    return newProject
  },

  updateProject: async (id, projectData) => {
    const response = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData),
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update project")
    }
    
    const data = await response.json()
    
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...data.project, task_count: p.task_count } : p
      ),
    }))
    
    return data.project
  },

  deleteProject: async (id) => {
    const response = await fetch(`/api/projects/${id}`, {
      method: "DELETE",
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to delete project")
    }
    
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }))
  },
}))
