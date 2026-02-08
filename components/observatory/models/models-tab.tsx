'use client'

/**
 * ModelsTab Component
 * Model performance comparison for the Observatory
 * Shows metrics by model with role filtering
 */

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Loader2, Cpu } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ModelComparisonTable } from './model-comparison-table'
import { ProjectFilter } from '../project-filter'
import type { TimeRange } from '../time-range-toggle'
import type { ModelComparisonRecord } from '@/convex/modelAnalytics'

type RoleFilter = 'all' | 'pm' | 'dev' | 'reviewer' | 'research'

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All Roles' },
  { value: 'dev', label: 'Dev' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'pm', label: 'PM' },
  { value: 'research', label: 'Research' },
]

function timeRangeToDates(range: TimeRange): { startDate: number | undefined; endDate: number | undefined } {
  const now = Date.now()

  switch (range) {
    case '24h':
      return { startDate: now - 24 * 60 * 60 * 1000, endDate: now }
    case '7d':
      return { startDate: now - 7 * 24 * 60 * 60 * 1000, endDate: now }
    case '30d':
      return { startDate: now - 30 * 24 * 60 * 60 * 1000, endDate: now }
    case 'all':
      return { startDate: undefined, endDate: undefined }
    default:
      return { startDate: now - 7 * 24 * 60 * 60 * 1000, endDate: now }
  }
}

interface ModelsTabProps {
  timeRange: TimeRange
}

export function ModelsTab({ timeRange }: ModelsTabProps) {
  // Project filter
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // Role filter
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('all')

  // Convert time range to dates
  const dateRange = useMemo(() => timeRangeToDates(timeRange), [timeRange])

  // Fetch model comparison data from Convex
  // Note: modelAnalytics.modelComparison query is defined in convex/modelAnalytics.ts
  // The api object will have modelAnalytics after convex codegen is run
  const modelData = useQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any).modelAnalytics?.modelComparison,
    {
      projectId: selectedProject || undefined,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }
  )

  const isLoading = modelData === undefined

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!modelData) return null

    const models: ModelComparisonRecord[] = modelData.models
    const totalTasks = models.reduce((sum: number, m: ModelComparisonRecord) => sum + m.tasksCompleted, 0)
    const totalCost = models.reduce((sum: number, m: ModelComparisonRecord) => sum + (m.avgCostPerTask * m.tasksCompleted), 0)
    const avgSuccessRate = models.length > 0
      ? models.reduce((sum: number, m: ModelComparisonRecord) => sum + m.successRate, 0) / models.length
      : 0

    return {
      totalTasks,
      totalCost,
      avgSuccessRate,
      modelCount: models.length,
    }
  }, [modelData])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasData = modelData && modelData.models.length > 0

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Model Performance</h2>
            <p className="text-sm text-muted-foreground">
              Compare AI model effectiveness and costs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <ProjectFilter
            value={selectedProject}
            onChange={setSelectedProject}
          />

          <Select
            value={selectedRole}
            onValueChange={(value) => setSelectedRole(value as RoleFilter)}
          >
            <SelectTrigger className="w-[140px]" size="sm">
              <SelectValue placeholder="Select role..." />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary stats */}
      {summaryStats && summaryStats.modelCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Models</p>
            <p className="text-2xl font-semibold">{summaryStats.modelCount}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Total Tasks</p>
            <p className="text-2xl font-semibold">{summaryStats.totalTasks}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Total Cost</p>
            <p className="text-2xl font-semibold">${summaryStats.totalCost.toFixed(2)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Avg Success Rate</p>
            <p className="text-2xl font-semibold">
              {Math.round(summaryStats.avgSuccessRate * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/20">
          <Cpu className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No Model Data</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            No completed tasks with model information found for the selected filters.
            Tasks will appear here once they are completed by agents.
          </p>
        </div>
      )}

      {/* Comparison table */}
      {hasData && (
        <ModelComparisonTable
          models={modelData.models}
          selectedRole={selectedRole === 'all' ? null : selectedRole}
        />
      )}
    </div>
  )
}
