"use client"

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Project } from "@/lib/types"

interface ProjectWithCount extends Project {
  task_count: number
}

interface ProjectFilterProps {
  /** Current selected project ID (null = All Projects) */
  value: string | null
  /** Callback when selection changes */
  onChange: (projectId: string | null) => void
  /** If provided, the filter is locked to this project (disables dropdown) */
  locked?: string
  /** Optional className for styling */
  className?: string
}

/**
 * Project filter dropdown for Observatory pages.
 * 
 * Features:
 * - Lists all work-loop-enabled projects from Convex
 * - "All Projects" option at the top (value = null)
 * - Shows project color dots next to names
 * - Compact design suitable for header placement
 * - Locked mode for per-project pages (disables dropdown, shows project name)
 */
export function ProjectFilter({
  value,
  onChange,
  locked,
  className,
}: ProjectFilterProps) {
  const projects = useQuery(api.projects.getAll, {})

  // Filter to only work-loop-enabled projects
  const enabledProjects = useMemo(() => {
    if (!projects) return []
    return projects.filter((p: ProjectWithCount) => p.work_loop_enabled)
  }, [projects])

  // Find the locked project name if in locked mode
  const lockedProject = useMemo(() => {
    if (!locked || !projects) return null
    return projects.find((p: ProjectWithCount) => p.id === locked || p.slug === locked)
  }, [locked, projects])

  // Handle selection change
  const handleChange = (selectedValue: string) => {
    onChange(selectedValue === "__all__" ? null : selectedValue)
  }

  // Locked mode: show static display
  if (locked && lockedProject) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground ${className || ""}`}
        title={`Locked to project: ${lockedProject.name}`}
      >
        <ColorDot color={lockedProject.color} />
        <span className="font-medium text-foreground">{lockedProject.name}</span>
      </div>
    )
  }

  // Loading state
  if (projects === undefined) {
    return (
      <div
        className={`h-8 w-40 bg-muted rounded animate-pulse ${className || ""}`}
        aria-label="Loading projects..."
      />
    )
  }

  // No enabled projects
  if (enabledProjects.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className || ""}`}>
        No work loop projects
      </div>
    )
  }

  return (
    <Select
      value={value || "__all__"}
      onValueChange={handleChange}
    >
      <SelectTrigger className={`w-[180px] ${className || ""}`} size="sm">
        <SelectValue placeholder="Select project..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">
          <span className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-gray-400" />
            All Projects
          </span>
        </SelectItem>
        {enabledProjects.map((project: ProjectWithCount) => (
          <SelectItem key={project.id} value={project.id}>
            <span className="flex items-center gap-2">
              <ColorDot color={project.color} />
              {project.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Small color dot component for project indicators.
 */
function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="h-2 w-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  )
}
