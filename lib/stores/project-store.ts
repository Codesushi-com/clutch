import { create } from "zustand"
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Project } from "@/lib/db/types"
import type { Id } from "@/convex/_generated/server";

export type ProjectWithCount = Project & { task_count: number }

interface ProjectState {
  projects: ProjectWithCount[]
  loading: boolean
  error: string | null

  // Actions
  setProjects: (projects: ProjectWithCount[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  addProject: (project: ProjectWithCount) => void
  updateProjectInStore: (project: ProjectWithCount) => void
  removeProject: (id: string) => void
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

// Zustand store for local state management
export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  addProject: (project) => {
    set((state) => ({
      projects: [project, ...state.projects],
    }))
  },

  updateProjectInStore: (project) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === project.id ? project : p
      ),
    }))
  },

  removeProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }))
  },
}))

// Hook to fetch all projects from Convex
export function useConvexProjects() {
  const projects = useQuery(api.projects.getAll);

  return {
    projects: projects ?? [],
    loading: projects === undefined,
    error: null,
  };
}

// Hook to get a single project by ID
export function useConvexProject(id: string | null) {
  const project = useQuery(
    api.projects.getById,
    id ? { id: id as Id<"projects"> } : "skip"
  );

  return {
    project: project ?? null,
    loading: project === undefined,
    error: null,
  };
}

// Hook to create a project via Convex
export function useCreateProject() {
  const createMutation = useMutation(api.projects.create);

  return async (data: CreateProjectData) => {
    const result = await createMutation({
      name: data.name,
      slug: data.slug,
      description: data.description,
      color: data.color,
      repo_url: data.repo_url,
      local_path: data.local_path,
      github_repo: data.github_repo,
      chat_layout: data.chat_layout,
    });
    return result;
  };
}

// Hook to update a project via Convex
export function useUpdateProject() {
  const updateMutation = useMutation(api.projects.update);

  return async (id: string, data: Partial<CreateProjectData>) => {
    const result = await updateMutation({
      id: id as Id<"projects">,
      name: data.name,
      slug: data.slug,
      description: data.description,
      color: data.color,
      repo_url: data.repo_url,
      local_path: data.local_path,
      github_repo: data.github_repo,
      chat_layout: data.chat_layout,
    });
    return result;
  };
}

// Hook to delete a project via Convex
export function useDeleteProject() {
  const deleteMutation = useMutation(api.projects.deleteProject);

  return async (id: string) => {
    await deleteMutation({ id: id as Id<"projects"> });
  };
}
