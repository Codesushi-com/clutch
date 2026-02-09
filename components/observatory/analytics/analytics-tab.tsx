'use client'

/**
 * AnalyticsTab Component
 * Main analytics dashboard with summary cards and charts
 */

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { SummaryCards } from './summary-cards'
import { ThroughputChart } from './throughput-chart'
import { CostBreakdownChart } from './cost-breakdown-chart'
import { CycleTimeChart } from './cycle-time-chart'
import { ProjectFilter } from '../project-filter'
import { TimeRange, TimeRangeToggle } from '../time-range-toggle'
import { Loader2 } from 'lucide-react'
import type { CostSummary, CycleTimesResult, SuccessRateResult, ThroughputDataPoint } from '@/convex/analytics'

interface AnalyticsTabProps {
  /** Time range from parent (optional - if not provided, uses internal state) */
  timeRange?: TimeRange
  /** Callback when time range changes */
  onTimeRangeChange?: (range: TimeRange) => void
  /** If provided, locks the tab to this project */
  lockedProjectId?: string
}

export function AnalyticsTab({ timeRange: externalTimeRange, onTimeRangeChange, lockedProjectId }: AnalyticsTabProps) {
  // Internal state if not controlled externally
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>('24h')
  const [projectFilter, setProjectFilter] = useState<string | null>(lockedProjectId ?? null)

  // Use external or internal time range
  const timeRange = externalTimeRange ?? internalTimeRange
  const setTimeRange = onTimeRangeChange ?? setInternalTimeRange

  // Fetch analytics data
  const costData = useQuery(api.analytics.costSummary, {
    projectId: projectFilter || undefined,
    timeRange,
  }) as CostSummary | undefined

  const cycleTimeData = useQuery(api.analytics.cycleTimes, {
    projectId: projectFilter || undefined,
    timeRange,
  }) as CycleTimesResult | undefined

  const successRateData = useQuery(api.analytics.successRate, {
    projectId: projectFilter || undefined,
    timeRange,
  }) as SuccessRateResult | undefined

  const throughputData = useQuery(api.analytics.throughput, {
    projectId: projectFilter || undefined,
    timeRange,
  }) as ThroughputDataPoint[] | undefined

  const isLoading =
    costData === undefined ||
    cycleTimeData === undefined ||
    successRateData === undefined ||
    throughputData === undefined

  // Calculate derived metrics
  const totalCost = costData?.totalCost ?? 0
  const avgCycleTime = cycleTimeData?.total.average ?? 0
  const successRate = successRateData?.success.percentage ?? 0

  // Calculate throughput (tasks per day)
  const throughput = (() => {
    if (!throughputData || throughputData.length === 0) return 0
    const totalTasks = throughputData.reduce((sum, d) => sum + d.count, 0)
    const days = Math.max(1, throughputData.length)
    return totalTasks / days
  })()

  // Check if we have any data at all
  const hasAnyData =
    !isLoading &&
    (costData.totalTasks > 0 ||
      cycleTimeData.total.average > 0 ||
      successRateData.total > 0 ||
      throughputData.length > 0)

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Performance metrics and trends
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ProjectFilter value={projectFilter} onChange={setProjectFilter} locked={lockedProjectId} />
          {!externalTimeRange && (
            <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasAnyData && (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-lg bg-muted/30">
          <p className="text-muted-foreground text-center max-w-sm">
            No analytics data available for the selected time range and project.
            <br />
            Try adjusting the filters or check back later.
          </p>
        </div>
      )}

      {/* Analytics content */}
      {!isLoading && hasAnyData && (
        <>
          {/* Summary Cards */}
          <SummaryCards
            totalCost={totalCost}
            avgCycleTime={avgCycleTime}
            successRate={successRate}
            throughput={throughput}
          />

          {/* Charts Grid */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Throughput Chart - Full width on mobile, spans 2 cols on large screens */}
            <div className="lg:col-span-2">
              <ThroughputChart
                data={throughputData ?? []}
                timeRange={timeRange}
                showCost={true}
              />
            </div>

            {/* Cost Breakdown */}
            <CostBreakdownChart data={costData ?? { totalCost: 0, averageCostPerTask: 0, totalTasks: 0, byRole: { pm: { count: 0, cost: 0 }, dev: { count: 0, cost: 0 }, research: { count: 0, cost: 0 }, reviewer: { count: 0, cost: 0 } }, byProject: {} }} />

            {/* Cycle Time */}
            <CycleTimeChart
              data={cycleTimeData ?? { total: { average: 0, median: 0, p90: 0 }, phases: { ready: { average: 0, median: 0, p90: 0 }, in_progress: { average: 0, median: 0, p90: 0 }, in_review: { average: 0, median: 0, p90: 0 } } }}
            />
          </div>
        </>
      )}
    </div>
  )
}
