'use client'

/**
 * PromptsTab Component
 * Prompt metrics and effectiveness analysis for the Observatory
 * Migrated from /prompts/metrics page
 */

import { useState, useEffect, useMemo } from 'react'
import { Loader2, BarChart3 } from 'lucide-react'
import { OverviewCards } from './overview-cards'
import { SuccessRateChart } from './success-rate-chart'
import { TokenEfficiencyChart } from './token-efficiency-chart'
import { FailureHeatmap } from './failure-heatmap'
import { BeforeAfterChart } from './before-after-chart'
import { VersionComparison } from './version-comparison'
import { FilterBar } from './filter-bar'
import { EmptyState } from './empty-state'
import { ProjectFilter } from '../project-filter'
import type { TimeRange } from '../time-range-toggle'
import type { MetricsData } from './types'

// Extended time range to match Observatory's 24h/7d/30d/all
type ExtendedTimeRange = TimeRange | '90d'

function timeRangeToMs(range: ExtendedTimeRange): number | null {
  const now = Date.now()
  switch (range) {
    case '24h':
      return now - 24 * 60 * 60 * 1000
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000
    case '90d':
      return now - 90 * 24 * 60 * 60 * 1000
    case 'all':
      return null
  }
}

async function fetchMetrics(
  role: string,
  model: string,
  timeRange: ExtendedTimeRange,
  projectId: string | null
): Promise<MetricsData> {
  const params = new URLSearchParams()
  if (role !== 'all') params.set('role', role)
  if (model !== 'all') params.set('model', model)
  if (projectId) params.set('projectId', projectId)
  const since = timeRangeToMs(timeRange)
  if (since !== null) params.set('since', String(since))

  const res = await fetch(`/api/metrics?${params}`)
  if (!res.ok) {
    throw new Error(`Failed to load metrics: ${res.statusText}`)
  }
  return res.json()
}

interface FetchState {
  data: MetricsData | null
  isLoading: boolean
  error: string | null
  fetchId: number
}

function useMetricsData(
  role: string,
  model: string,
  timeRange: ExtendedTimeRange,
  projectId: string | null
) {
  const [state, setState] = useState<FetchState>({
    data: null,
    isLoading: true,
    error: null,
    fetchId: 0,
  })

  useEffect(() => {
    let cancelled = false

    fetchMetrics(role, model, timeRange, projectId)
      .then((result) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            data: result,
            isLoading: false,
            error: null,
          }))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : String(err),
            isLoading: false,
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [role, model, timeRange, projectId, state.fetchId])

  const retry = () => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      fetchId: prev.fetchId + 1,
    }))
  }

  return { data: state.data, isLoading: state.isLoading, error: state.error, retry }
}

interface PromptsTabProps {
  timeRange: TimeRange
}

export function PromptsTab({ timeRange }: PromptsTabProps) {
  // Project filter
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // Role/Model filters
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedModel, setSelectedModel] = useState<string>('all')

  // Convert observatory time range to extended range (adds 90d option)
  const extendedTimeRange: ExtendedTimeRange = useMemo(() => {
    // Observatory uses 24h/7d/30d/all, we also support 90d
    if (timeRange === '24h') return '24h'
    if (timeRange === '7d') return '7d'
    if (timeRange === '30d') return '30d'
    return 'all'
  }, [timeRange])

  const { data, isLoading, error, retry } = useMetricsData(
    selectedRole,
    selectedModel,
    extendedTimeRange,
    selectedProject
  )

  // Filtered analyses for display
  const filteredAnalyses = useMemo(() => {
    if (!data) return []
    return data.analyses
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-sm text-[var(--accent-red)]">{error}</p>
          <button
            onClick={retry}
            className="mt-2 text-sm text-[var(--accent-blue)] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const hasData = filteredAnalyses.length > 0

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Prompt Metrics
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Effectiveness trends and version comparisons
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <ProjectFilter value={selectedProject} onChange={setSelectedProject} />
          <FilterBar
            roles={data?.filterOptions.roles ?? []}
            models={data?.filterOptions.models ?? []}
            selectedRole={selectedRole}
            selectedModel={selectedModel}
            onRoleChange={setSelectedRole}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>

      {!hasData && <EmptyState />}

      {hasData && (
        <>
          {/* Overview cards */}
          <OverviewCards analyses={filteredAnalyses} />

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SuccessRateChart analyses={filteredAnalyses} />
            <TokenEfficiencyChart
              analyses={filteredAnalyses}
              promptVersions={data?.promptVersions ?? []}
            />
          </div>

          {/* Full-width charts */}
          <FailureHeatmap analyses={filteredAnalyses} />
          <BeforeAfterChart
            analyses={filteredAnalyses}
            promptVersions={data?.promptVersions ?? []}
          />

          {/* Version comparison */}
          <VersionComparison
            analyses={filteredAnalyses}
            promptVersions={data?.promptVersions ?? []}
          />
        </>
      )}
    </div>
  )
}
