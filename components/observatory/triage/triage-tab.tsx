'use client'

/**
 * TriageTab Component
 * Main triage queue interface for resolving blocked tasks
 */

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { TriageCard } from './triage-card'
import { ProjectFilter } from '../project-filter'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { TriageTask } from '@/convex/triage'

interface TriageTabProps {
  lockedProjectId?: string
}

export function TriageTab({ lockedProjectId }: TriageTabProps) {
  const [projectFilter, setProjectFilter] = useState<string | null>(lockedProjectId ?? null)

  // Fetch triage queue from Convex
  const queueData = useQuery(api.triage.triageQueue, {
    projectId: projectFilter || undefined,
  })

  // Combine and sort tasks: escalated first, then by time blocked (oldest first)
  const { escalated, normal, totalCount } = useMemo(() => {
    if (!queueData) {
      return { escalated: [], normal: [], totalCount: 0 }
    }
    return {
      escalated: queueData.escalated,
      normal: queueData.normal,
      totalCount: queueData.escalated.length + queueData.normal.length,
    }
  }, [queueData])

  // Loading state
  if (queueData === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading triage queue...</p>
      </div>
    )
  }

  // Empty state
  if (totalCount === 0) {
    return (
      <div className="space-y-6">
        {/* Header with filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Triage Queue</h2>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              0 blocked
            </span>
          </div>
          <ProjectFilter value={projectFilter} onChange={setProjectFilter} locked={lockedProjectId} />
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-lg bg-muted/30">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-medium mb-1">All clear</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            No blocked tasks requiring triage. The work loop is running smoothly.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Triage Queue</h2>
          <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            {totalCount} blocked
          </span>
          {escalated.length > 0 && (
            <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {escalated.length} escalated
            </span>
          )}
        </div>
        <ProjectFilter value={projectFilter} onChange={setProjectFilter} locked={lockedProjectId} />
      </div>

      {/* Triage cards */}
      <div className="space-y-4">
        {/* Escalated tasks (pinned to top) */}
        {escalated.map((task: TriageTask) => (
          <TriageCard key={task.id} task={task} isEscalated={true} />
        ))}

        {/* Normal blocked tasks */}
        {normal.map((task: TriageTask) => (
          <TriageCard key={task.id} task={task} isEscalated={false} />
        ))}
      </div>

      {/* Footer info */}
      <div className="text-xs text-muted-foreground text-center pt-4">
        Tasks are sorted by time blocked (oldest first). Escalated tasks appear at the top.
      </div>
    </div>
  )
}
