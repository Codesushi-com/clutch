"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ProjectListRow } from "@/components/projects/project-list-row"
import { CreateProjectModal } from "@/components/projects/create-project-modal"
import { FeatureBuilderButton } from "@/components/feature-builder"
import { Skeleton } from "@/components/ui/skeleton"

export default function HomeContent() {
  const projects = useQuery(api.projects.getAllWithStats, {})

  return (
    <div className="container mx-auto py-12 px-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Projects
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Organize and manage your AI agent workflows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FeatureBuilderButton variant="outline" />
          <CreateProjectModal />
        </div>
      </div>

      {/* Loading state */}
      {projects === undefined && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] last:border-b-0">
              <Skeleton className="w-2.5 h-2.5 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
              <Skeleton className="h-4 w-32 hidden md:block" />
              <Skeleton className="h-5 w-16 hidden lg:block" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {projects !== undefined && projects.length === 0 && (
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

      {/* Project list */}
      {projects !== undefined && projects.length > 0 && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            <div className="flex-1">Project</div>
            <div className="hidden md:block" style={{ minWidth: "180px" }}>Tickets</div>
            <div className="flex md:hidden">Tasks</div>
            <div className="hidden sm:block" style={{ minWidth: "90px" }}>Agents</div>
            <div className="hidden lg:block" style={{ minWidth: "90px" }}>Loop</div>
            <div className="hidden lg:block" style={{ minWidth: "70px" }}>Activity</div>
            <div style={{ width: "56px" }} />
          </div>

          {projects.map((project) => (
            <ProjectListRow key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
