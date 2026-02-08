'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, Target, Zap, Award, AlertTriangle } from 'lucide-react'
import type { AnalysisRecord } from './types'

interface OverviewCardsProps {
  analyses: AnalysisRecord[]
}

export function OverviewCards({ analyses }: OverviewCardsProps) {
  if (analyses.length === 0) {
    return null
  }

  // Overall success rate
  const successCount = analyses.filter((a) => a.outcome === 'success').length
  const successRate = analyses.length > 0 ? (successCount / analyses.length) * 100 : 0

  // Average tokens per task
  const withTokens = analyses.filter((a) => a.token_count !== null)
  const avgTokens =
    withTokens.length > 0
      ? Math.round(withTokens.reduce((sum, a) => sum + (a.token_count ?? 0), 0) / withTokens.length)
      : null

  // Token trend: compare first half vs second half
  const tokenTrend = computeTokenTrend(withTokens)

  // Most improved role: compare success rate in first vs second half of data
  const mostImproved = computeMostImproved(analyses)

  // Most common failure mode
  const topFailure = computeTopFailureMode(analyses)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Success rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-[var(--text-secondary)]">
            <Target className="h-4 w-4" />
            Success Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{successRate.toFixed(1)}%</div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {successCount} of {analyses.length} tasks
          </p>
        </CardContent>
      </Card>

      {/* Average tokens */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-[var(--text-secondary)]">
            <Zap className="h-4 w-4" />
            Avg Tokens / Task
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--text-primary)]">
              {avgTokens !== null ? avgTokens.toLocaleString() : '—'}
            </span>
            {tokenTrend !== null && <TrendIndicator value={tokenTrend} inverted />}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {withTokens.length} tasks with token data
          </p>
        </CardContent>
      </Card>

      {/* Most improved role */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-[var(--text-secondary)]">
            <Award className="h-4 w-4" />
            Most Improved
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {mostImproved?.role ?? '—'}
          </div>
          {mostImproved && (
            <p className="text-xs mt-1" style={{ color: 'var(--accent-green)' }}>
              +{mostImproved.gain.toFixed(1)}% success rate
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top failure mode */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-[var(--text-secondary)]">
            <AlertTriangle className="h-4 w-4" />
            Top Failure Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="text-lg font-bold text-[var(--text-primary)] truncate"
            title={topFailure?.mode}
          >
            {topFailure?.mode ?? '—'}
          </div>
          {topFailure && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {topFailure.count} occurrence{topFailure.count !== 1 ? 's' : ''}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TrendIndicator({ value, inverted }: { value: number; inverted?: boolean }) {
  // inverted: for tokens, going down is good
  const isPositive = inverted ? value < 0 : value > 0
  const isNeutral = Math.abs(value) < 1

  if (isNeutral) {
    return <Minus className="h-4 w-4 text-[var(--text-muted)]" />
  }

  if (isPositive) {
    return (
      <span className="flex items-center text-xs" style={{ color: 'var(--accent-green)' }}>
        <TrendingDown className="h-3 w-3 mr-0.5" />
        {Math.abs(value).toFixed(0)}%
      </span>
    )
  }

  return (
    <span className="flex items-center text-xs" style={{ color: 'var(--accent-red)' }}>
      <TrendingUp className="h-3 w-3 mr-0.5" />
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}

function computeTokenTrend(analyses: AnalysisRecord[]): number | null {
  if (analyses.length < 4) return null

  const sorted = [...analyses].sort((a, b) => a.analyzed_at - b.analyzed_at)
  const mid = Math.floor(sorted.length / 2)
  const firstHalf = sorted.slice(0, mid)
  const secondHalf = sorted.slice(mid)

  const avgFirst = firstHalf.reduce((s, a) => s + (a.token_count ?? 0), 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((s, a) => s + (a.token_count ?? 0), 0) / secondHalf.length

  if (avgFirst === 0) return null
  return ((avgSecond - avgFirst) / avgFirst) * 100
}

function computeMostImproved(
  analyses: AnalysisRecord[]
): { role: string; gain: number } | null {
  const byRole = new Map<string, AnalysisRecord[]>()
  for (const a of analyses) {
    const list = byRole.get(a.role) ?? []
    list.push(a)
    byRole.set(a.role, list)
  }

  let best: { role: string; gain: number } | null = null

  for (const [role, records] of byRole) {
    if (records.length < 4) continue

    const sorted = [...records].sort((a, b) => a.analyzed_at - b.analyzed_at)
    const mid = Math.floor(sorted.length / 2)
    const firstHalf = sorted.slice(0, mid)
    const secondHalf = sorted.slice(mid)

    const rateFirst = (firstHalf.filter((a) => a.outcome === 'success').length / firstHalf.length) * 100
    const rateSecond = (secondHalf.filter((a) => a.outcome === 'success').length / secondHalf.length) * 100
    const gain = rateSecond - rateFirst

    if (gain > 0 && (best === null || gain > best.gain)) {
      best = { role, gain }
    }
  }

  return best
}

function computeTopFailureMode(analyses: AnalysisRecord[]): { mode: string; count: number } | null {
  const counts = new Map<string, number>()

  for (const a of analyses) {
    if (a.failure_modes.length === 0) continue
    for (const mode of a.failure_modes) {
      counts.set(mode, (counts.get(mode) ?? 0) + 1)
    }
  }

  if (counts.size === 0) return null

  let topMode = ''
  let topCount = 0
  for (const [mode, count] of counts) {
    if (count > topCount) {
      topMode = mode
      topCount = count
    }
  }

  return { mode: topMode, count: topCount }
}
