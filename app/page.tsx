"use client"

import { useEffect } from "react"
import { useProjectStore } from "@/lib/stores/project-store"
import { ProjectCard } from "@/components/projects/project-card"
import { CreateProjectModal } from "@/components/projects/create-project-modal"
import { Skeleton } from "@/components/ui/skeleton"

export default function Home() {
  const { projects, loading, error, fetchProjects } = useProjectStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  return (
    <div className="container mx-auto py-12 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Projects
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Organize and manage your AI agent workflows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CreateProjectModal />
        </div>
      </div>

        {/* Error state */}
        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && projects.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden">
                <Skeleton className="h-1 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              No projects yet
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Create your first project to start organizing work.
            </p>
            <CreateProjectModal />
          </div>
        )}

      {/* Project grid */}
      {projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
