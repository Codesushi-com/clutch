'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from './status-badge'
import { StatsPanel } from './stats-panel'
import { ActiveAgents } from './active-agents'
import { ActivityLog } from './activity-log'
import { useWorkLoopState } from '@/lib/hooks/use-work-loop'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Pause, Play, RotateCw } from 'lucide-react'

/**
 * Finds the first project with work_loop_enabled from the projects list.
 * Returns null if none found.
 */
function useWorkLoopProject(): { projectId: string; projectSlug: string } | null {
  const projects = useQuery(api.projects.getAll, {})

  if (!projects) return null

  const enabled = projects.find((p) => p.work_loop_enabled)
  if (!enabled) return null

  return { projectId: enabled.id, projectSlug: enabled.slug }
}

export function WorkLoopContent() {
  const project = useWorkLoopProject()
  const { state, isLoading: stateLoading } = useWorkLoopState(project?.projectId ?? null)
  const [isUpdating, setIsUpdating] = useState(false)

  const isLoading = !project || stateLoading

  const handleToggleStatus = async () => {
    if (!state || !project || isUpdating) return

    setIsUpdating(true)
    try {
      const newStatus = state.status === 'running' ? 'paused' : 'running'
      const response = await fetch('/api/work-loop/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.projectId,
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

  if (!project && !stateLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Work Loop</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              No projects with work loop enabled. Enable it in project settings.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isRunning = state?.status === 'running'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Work Loop</h1>
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
      {project && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main area - 3 columns */}
          <div className="lg:col-span-3 space-y-6">
            <ActiveAgents projectId={project.projectId} projectSlug={project.projectSlug} />
            <ActivityLog projectId={project.projectId} projectSlug={project.projectSlug} />
          </div>

          {/* Sidebar - 1 column */}
          <div className="lg:col-span-1 min-w-0">
            <StatsPanel projectId={project.projectId} />
          </div>
        </div>
      )}
    </div>
  )
}
