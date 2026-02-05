import { create } from 'zustand'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Project } from '@/lib/db/types'
import type { Id } from '@/convex/_generated/server'

export type ProjectWithCount = Project & { task_count: number }

interface ProjectState {
  // UI state only - data comes from Convex
  selectedProjectId: string | null
  isCreateModalOpen: boolean
  isEditModalOpen: boolean
  editingProject: Project | null

  // Actions
  setSelectedProjectId: (id: string | null) => void
  openCreateModal: () => void
  closeCreateModal: () => void
  openEditModal: (project: Project) => void
  closeEditModal: () => void
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

export const useProjectStore = create<ProjectState>((set) => ({
  selectedProjectId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,
  editingProject: null,

  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  openCreateModal: () => set({ isCreateModalOpen: true }),
  closeCreateModal: () => set({ isCreateModalOpen: false }),
  openEditModal: (project) => set({ isEditModalOpen: true, editingProject: project }),
  closeEditModal: () => set({ isEditModalOpen: false, editingProject: null }),
}))

// ============================================
// Convex Hooks for Data Fetching
// ============================================

/**
 * Hook to fetch all projects with task counts
 * Uses Convex for real-time subscriptions
 */
export function useProjects() {
  return useQuery(api.projects.getAll)
}

/**
 * Hook to fetch a single project by ID
 */
export function useProject(id: Id<'projects'> | null) {
  return useQuery(api.projects.getById, id ? { id } : 'skip')
}

/**
 * Hook to fetch a project by slug
 */
export function useProjectBySlug(slug: string | null) {
  return useQuery(api.projects.getBySlug, slug ? { slug } : 'skip')
}

// ============================================
// Convex Mutations
// ============================================

/**
 * Hook to create a new project
 */
export function useCreateProject() {
  return useMutation(api.projects.create)
}

/**
 * Hook to update a project
 */
export function useUpdateProject() {
  return useMutation(api.projects.update)
}

/**
 * Hook to delete a project
 */
export function useDeleteProject() {
  return useMutation(api.projects.deleteProject)
}
