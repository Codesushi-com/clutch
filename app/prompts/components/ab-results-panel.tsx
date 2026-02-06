'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, BarChart3, Loader2, Trophy, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ABTestState, ABTestMetrics } from '../types'

interface ABResultsPanelProps {
  state: ABTestState
  onEnd: () => void
}

function MetricBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="text-[var(--text-secondary)]">{value}/{total} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function MetricsCard({ label, metrics, variant }: { label: string; metrics: ABTestMetrics | null; variant: 'control' | 'challenger' }) {
  if (!metrics) {
    return (
      <Card className="p-4 flex-1">
        <div className="text-sm font-medium text-[var(--text-muted)] mb-2">{label}</div>
        <p className="text-xs text-[var(--text-muted)]">No data yet</p>
      </Card>
    )
  }

  const borderColor = variant === 'control' ? 'var(--accent-blue)' : 'var(--accent-purple)'

  return (
    <Card className="p-4 flex-1" style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {label}
          <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">v{metrics.version}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {metrics.total_tasks} tasks
        </Badge>
      </div>

      <div className="space-y-3">
        <MetricBar
          label="Success"
          value={metrics.successes}
          total={metrics.total_tasks}
          color="var(--accent-green)"
        />
        <MetricBar
          label="Failure"
          value={metrics.failures}
          total={metrics.total_tasks}
          color="var(--accent-red, #ef4444)"
        />
        <MetricBar
          label="Partial"
          value={metrics.partials}
          total={metrics.total_tasks}
          color="var(--accent-yellow)"
        />

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
          <div>
            <p className="text-[10px] uppercase text-[var(--text-muted)]">Avg Confidence</p>
            <p className="text-sm font-mono text-[var(--text-primary)]">
              {(metrics.avg_confidence * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[var(--text-muted)]">Avg Duration</p>
            <p className="text-sm font-mono text-[var(--text-primary)]">
              {metrics.avg_duration_ms != null
                ? `${(metrics.avg_duration_ms / 1000).toFixed(1)}s`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[var(--text-muted)]">Avg Tokens</p>
            <p className="text-sm font-mono text-[var(--text-primary)]">
              {metrics.avg_tokens != null
                ? metrics.avg_tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[var(--text-muted)]">Success Rate</p>
            <p className="text-sm font-mono text-[var(--text-primary)]">
              {(metrics.success_rate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function ABResultsPanel({ state, onEnd }: ABResultsPanelProps) {
  const [isEnding, setIsEnding] = useState<'promote' | 'reject' | null>(null)

  const totalTasks = (state.control_metrics?.total_tasks ?? 0) + (state.challenger_metrics?.total_tasks ?? 0)
  const minTasks = state.min_tasks
  const enoughData = totalTasks >= minTasks

  const handleEnd = async (action: 'promote' | 'reject') => {
    setIsEnding(action)
    try {
      const res = await fetch('/api/prompts/ab-test', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: state.role,
          model: state.model,
          action,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to end A/B test')
      }

      toast.success(
        action === 'promote'
          ? 'Challenger promoted to active version'
          : 'Challenger rejected, control remains active'
      )
      onEnd()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to end A/B test')
    } finally {
      setIsEnding(null)
    }
  }

  return (
    <Card className="p-4 mb-6 border-[var(--accent-purple)]/30 bg-[var(--accent-purple)]/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[var(--accent-purple)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">A/B Test Running</h3>
          <Badge variant="outline" className="text-[10px]">
            {state.split_percent}% challenger / {100 - state.split_percent}% control
          </Badge>
        </div>
        {state.started_at && (
          <span className="text-xs text-[var(--text-muted)]">
            Started {format(state.started_at, 'MMM d, h:mm a')}
          </span>
        )}
      </div>

      {/* Progress to min tasks */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--text-muted)]">
            Progress: {totalTasks} / {minTasks} minimum tasks
          </span>
          {!enoughData && (
            <span className="flex items-center gap-1 text-[var(--accent-yellow)]">
              <AlertTriangle className="h-3 w-3" />
              Insufficient data
            </span>
          )}
        </div>
        <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent-purple)] transition-all"
            style={{ width: `${Math.min(100, (totalTasks / minTasks) * 100)}%` }}
          />
        </div>
      </div>

      {/* Side-by-side metrics */}
      <div className="flex gap-4 mb-4">
        <MetricsCard
          label="Control"
          metrics={state.control_metrics}
          variant="control"
        />
        <MetricsCard
          label="Challenger"
          metrics={state.challenger_metrics}
          variant="challenger"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleEnd('reject')}
          disabled={isEnding !== null}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          {isEnding === 'reject' ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <X className="h-4 w-4 mr-1" />
          )}
          Reject Challenger
        </Button>
        <Button
          size="sm"
          onClick={() => handleEnd('promote')}
          disabled={isEnding !== null}
          className="bg-[var(--accent-green)] hover:bg-[var(--accent-green)]/80 text-white"
        >
          {isEnding === 'promote' ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Trophy className="h-4 w-4 mr-1" />
          )}
          Promote Challenger
        </Button>
      </div>
    </Card>
  )
}
