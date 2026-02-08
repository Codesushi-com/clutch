'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './status-badge'
import { StatsPanel } from './stats-panel'
import { ActiveAgents } from './active-agents'
import { ActivityLog } from './activity-log'
import { useWorkLoopState } from '@/lib/hooks/use-work-loop'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Pause, Play, RotateCw } from 'lucide-react'
import type { Project } from '@/lib/types'


interface LiveTabProps {
  selectedProjectId: string | null
}

export function LiveTab({ selectedProjectId }: LiveTabProps) {
  const projects = useQuery(api.projects.getAll, {})
  const enabledProjects = useMemo(() => {
    if (!projects) return []
    return projects.filter((p) => p.work_loop_enabled === 1)
  }, [projects])

  const selectedProject = useMemo(() => {
    if (selectedProjectId === null) return null
    return enabledProjects.find(p => p.id === selectedProjectId) || null
  }, [selectedProjectId, enabledProjects])

  // Single project view
  if (selectedProject) {
    return <SingleProjectView project={selectedProject} />
  }

  // All projects view
  return <AllProjectsView projects={enabledProjects} />
}

interface SingleProjectViewProps {
  project: Project
}

function SingleProjectView({ project }: SingleProjectViewProps) {
  const { state, isLoading: stateLoading } = useWorkLoopState(project.id)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleStatus = async () => {
    if (!state || isUpdating) return

    setIsUpdating(true)
    try {
      const newStatus = state.status === 'running' ? 'paused' : 'running'
      const response = await fetch('/api/work-loop/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          status: newStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }
    } catch (error) {
      console.error('Failed to toggle status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const isLoading = stateLoading
  const isRunning = state?.status === 'running'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">{project.name}</h2>
          {isLoading ? (
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          ) : state ? (
            <StatusBadge status={state.status} />
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          {state && (
            <div className="text-sm text-muted-foreground">
              Cycle <span className="font-medium text-foreground">{state.current_cycle}</span>
            </div>
          )}
          <Button
            onClick={handleToggleStatus}
            disabled={isLoading || isUpdating || !state}
            variant={isRunning ? 'outline' : 'default'}
            size="sm"
          >
            {isUpdating ? (
              <RotateCw className="h-4 w-4 animate-spin mr-2" />
            ) : isRunning ? (
              <Pause className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isRunning ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      {/* Error message */}
      {state?.error_message && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="text-sm text-red-600">{state.error_message}</div>
          </CardContent>
        </Card>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main area - 3 columns */}
        <div className="lg:col-span-3 space-y-6">
          <ActiveAgents 
            projectId={project.id} 
            projectSlug={project.slug} 
          />
          <ActivityLog 
            projectId={project.id} 
            projectSlug={project.slug} 
          />
        </div>

        {/* Sidebar - 1 column */}
        <div className="lg:col-span-1 min-w-0">
          <StatsPanel projectId={project.id} />
        </div>
      </div>
    </div>
  )
}

interface AllProjectsViewProps {
  projects: Project[]
}

function AllProjectsView({ projects }: AllProjectsViewProps) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12 text-muted-foreground">
            No projects with work loop enabled. Enable it in project settings.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {projects.map((project) => (
        <ProjectSection key={project.id} project={project} />
      ))}
    </div>
  )
}

interface ProjectSectionProps {
  project: Project
}

function ProjectSection({ project }: ProjectSectionProps) {
  const { state, isLoading: stateLoading } = useWorkLoopState(project.id)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleStatus = async () => {
    if (!state || isUpdating) return

    setIsUpdating(true)
    try {
      const newStatus = state.status === 'running' ? 'paused' : 'running'
      const response = await fetch('/api/work-loop/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          status: newStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }
    } catch (error) {
      console.error('Failed to toggle status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const isLoading = stateLoading
  const isRunning = state?.status === 'running'

  return (
    <div className="space-y-4 border rounded-lg p-4">
      {/* Project header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{project.name}</h3>
          <Badge variant="outline" className="text-xs">{project.slug}</Badge>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted rounded animate-pulse" />
          ) : state ? (
            <StatusBadge status={state.status} />
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {state && (
            <div className="text-sm text-muted-foreground">
              Cycle <span className="font-medium text-foreground">{state.current_cycle}</span>
            </div>
          )}
          <Button
            onClick={handleToggleStatus}
            disabled={isLoading || isUpdating || !state}
            variant={isRunning ? 'outline' : 'default'}
            size="sm"
          >
            {isUpdating ? (
              <RotateCw className="h-3 w-3 animate-spin mr-1" />
            ) : isRunning ? (
              <Pause className="h-3 w-3 mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            {isRunning ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      {/* Error message */}
      {state?.error_message && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <div className="text-sm text-red-600">{state.error_message}</div>
          </CardContent>
        </Card>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main area */}
        <div className="lg:col-span-3 space-y-4">
          <ActiveAgents 
            projectId={project.id} 
            projectSlug={project.slug}
            projectName={project.name}
          />
          <ActivityLog 
            projectId={project.id} 
            projectSlug={project.slug} 
          />
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 min-w-0">
          <StatsPanel projectId={project.id} />
        </div>
      </div>
    </div>
  )
}
