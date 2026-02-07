"use client"

import Link from "next/link"
import type { ProjectWithCount } from "@/lib/stores/project-store"

interface ProjectCardProps {
  project: ProjectWithCount
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link 
      href={`/projects/${project.slug}`}
      prefetch={false}
      className="group block"
    >
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden transition-all duration-150 hover:shadow-lg hover:-translate-y-0.5">
        {/* Color bar */}
        <div 
          className="h-1"
          style={{ backgroundColor: project.color }}
        />
        
        <div className="p-4">
          {/* Name */}
          <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
            {project.name}
          </h3>
          
          {/* Description */}
          {project.description && (
            <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2">
              {project.description}
            </p>
          )}
          
          {/* Task count */}
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
              {project.task_count}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {project.task_count === 1 ? "task" : "tasks"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
