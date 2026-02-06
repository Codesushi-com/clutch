'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from './status-badge'
import { StatsPanel } from './stats-panel'
import { ActiveAgents } from './active-agents'
import { ActivityLog } from './activity-log'
import { useWorkLoopState } from '@/lib/hooks/use-work-loop'
import { Pause, Play, RotateCw } from 'lucide-react'

// Default project ID for the work loop dashboard
// In the future, this could be selectable or from URL params
const DEFAULT_PROJECT_ID = 'trap'

export function WorkLoopContent() {
  const { state, isLoading } = useWorkLoopState(DEFAULT_PROJECT_ID)
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
          projectId: DEFAULT_PROJECT_ID,
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main area - 3 columns */}
        <div className="lg:col-span-3 space-y-6">
          <ActiveAgents projectId={DEFAULT_PROJECT_ID} projectSlug={DEFAULT_PROJECT_ID} />
          <ActivityLog projectId={DEFAULT_PROJECT_ID} projectSlug={DEFAULT_PROJECT_ID} />
        </div>

        {/* Sidebar - 1 column */}
        <div className="lg:col-span-1">
          <StatsPanel projectId={DEFAULT_PROJECT_ID} />
        </div>
      </div>
    </div>
  )
}
