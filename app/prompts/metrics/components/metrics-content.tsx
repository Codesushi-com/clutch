'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, BarChart3, ArrowLeft } from 'lucide-react'
import { OverviewCards } from './overview-cards'
import { SuccessRateChart } from './success-rate-chart'
import { TokenEfficiencyChart } from './token-efficiency-chart'
import { FailureHeatmap } from './failure-heatmap'
import { BeforeAfterChart } from './before-after-chart'
import { VersionComparison } from './version-comparison'
import { FilterBar } from './filter-bar'
import { EmptyState } from './empty-state'
import type { MetricsData, TimeRange } from '../types'
import { timeRangeToMs } from '../types'

async function fetchMetrics(role: string, model: string, timeRange: TimeRange): Promise<MetricsData> {
  const params = new URLSearchParams()
  if (role !== 'all') params.set('role', role)
  if (model !== 'all') params.set('model', model)
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

function useMetricsData(role: string, model: string, timeRange: TimeRange) {
  const [state, setState] = useState<FetchState>({
    data: null,
    isLoading: true,
    error: null,
    fetchId: 0,
  })

  useEffect(() => {
    let cancelled = false

    fetchMetrics(role, model, timeRange)
      .then((result) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, data: result, isLoading: false, error: null }))
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

    return () => { cancelled = true }
  }, [role, model, timeRange, state.fetchId])

  const retry = () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null, fetchId: prev.fetchId + 1 }))
  }

  return { data: state.data, isLoading: state.isLoading, error: state.error, retry }
}

export function MetricsContent() {
  // Filters
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedModel, setSelectedModel] = useState<string>('all')
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('30d')

  const { data, isLoading, error, retry } = useMetricsData(
    selectedRole,
    selectedModel,
    selectedTimeRange,
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/prompts"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <BarChart3 className="h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              Prompt Metrics
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Effectiveness trends and version comparisons
            </p>
          </div>
        </div>
        <FilterBar
          roles={data?.filterOptions.roles ?? []}
          models={data?.filterOptions.models ?? []}
          selectedRole={selectedRole}
          selectedModel={selectedModel}
          selectedTimeRange={selectedTimeRange}
          onRoleChange={setSelectedRole}
          onModelChange={setSelectedModel}
          onTimeRangeChange={setSelectedTimeRange}
        />
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
