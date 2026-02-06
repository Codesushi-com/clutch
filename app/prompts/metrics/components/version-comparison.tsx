'use client'

import { useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AnalysisRecord, PromptVersionSummary } from '../types'

interface VersionComparisonProps {
  analyses: AnalysisRecord[]
  promptVersions: PromptVersionSummary[]
}

interface VersionStats {
  total: number
  successRate: number
  avgTokens: number | null
  avgDuration: number | null
  failureModes: Map<string, number>
}

export function VersionComparison({ analyses, promptVersions }: VersionComparisonProps) {
  const [versionA, setVersionA] = useState<string>('')
  const [versionB, setVersionB] = useState<string>('')

  // Build selectable versions grouped by role
  const versionOptions = useMemo(() => {
    return promptVersions
      .sort((a, b) => {
        if (a.role !== b.role) return a.role.localeCompare(b.role)
        return a.version - b.version
      })
      .map((v) => ({
        id: v.id,
        label: `${v.role} v${v.version}${v.active ? ' (active)' : ''}`,
        role: v.role,
        version: v.version,
      }))
  }, [promptVersions])

  const statsA = useMemo(() => computeStats(analyses, versionA), [analyses, versionA])
  const statsB = useMemo(() => computeStats(analyses, versionB), [analyses, versionB])

  // Statistical significance: simple check based on sample size
  const isSignificant = statsA !== null && statsB !== null && statsA.total >= 10 && statsB.total >= 10

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
        Version Comparison
      </h3>

      {/* Version selectors */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Version A</label>
          <Select value={versionA} onValueChange={setVersionA}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select version..." />
            </SelectTrigger>
            <SelectContent>
              {versionOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end pb-2 text-[var(--text-muted)] font-medium">vs</div>

        <div className="flex-1">
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Version B</label>
          <Select value={versionB} onValueChange={setVersionB}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select version..." />
            </SelectTrigger>
            <SelectContent>
              {versionOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comparison table */}
      {(statsA || statsB) && (
        <>
          {!isSignificant && statsA !== null && statsB !== null && (
            <div
              className="text-xs rounded px-3 py-2 mb-4"
              style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', color: 'var(--accent-yellow)' }}
            >
              ⚠️ Low sample size — results may not be statistically significant
              ({statsA.total} + {statsB.total} tasks, recommend 10+ each)
            </div>
          )}

          {isSignificant && (
            <div
              className="text-xs rounded px-3 py-2 mb-4"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent-green)' }}
            >
              ✓ Sufficient data for meaningful comparison ({statsA.total} + {statsB.total} tasks)
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 text-[var(--text-muted)] font-medium">Metric</th>
                  <th className="text-right py-2 text-[var(--text-muted)] font-medium">
                    {versionA ? versionOptions.find((v) => v.id === versionA)?.label ?? 'A' : 'A'}
                  </th>
                  <th className="text-right py-2 text-[var(--text-muted)] font-medium">
                    {versionB ? versionOptions.find((v) => v.id === versionB)?.label ?? 'B' : 'B'}
                  </th>
                  <th className="text-right py-2 text-[var(--text-muted)] font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  label="Tasks Analyzed"
                  valueA={statsA?.total ?? null}
                  valueB={statsB?.total ?? null}
                  format="number"
                />
                <ComparisonRow
                  label="Success Rate"
                  valueA={statsA?.successRate ?? null}
                  valueB={statsB?.successRate ?? null}
                  format="percent"
                  higherIsBetter
                />
                <ComparisonRow
                  label="Avg Tokens"
                  valueA={statsA?.avgTokens ?? null}
                  valueB={statsB?.avgTokens ?? null}
                  format="number"
                  higherIsBetter={false}
                />
                <ComparisonRow
                  label="Avg Duration"
                  valueA={statsA?.avgDuration ?? null}
                  valueB={statsB?.avgDuration ?? null}
                  format="duration"
                  higherIsBetter={false}
                />
              </tbody>
            </table>
          </div>
        </>
      )}

      {!versionA && !versionB && (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">
          Select two prompt versions to compare their metrics
        </p>
      )}
    </div>
  )
}

function ComparisonRow({
  label,
  valueA,
  valueB,
  format,
  higherIsBetter,
}: {
  label: string
  valueA: number | null
  valueB: number | null
  format: 'number' | 'percent' | 'duration'
  higherIsBetter?: boolean
}) {
  const formatValue = (v: number | null): string => {
    if (v === null) return '—'
    switch (format) {
      case 'percent': return `${v.toFixed(1)}%`
      case 'duration': return formatDuration(v)
      case 'number': return v.toLocaleString()
    }
  }

  const delta = valueA !== null && valueB !== null ? valueB - valueA : null
  const deltaColor = delta === null
    ? 'var(--text-muted)'
    : higherIsBetter !== undefined
      ? (higherIsBetter ? delta > 0 : delta < 0)
        ? 'var(--accent-green)'
        : delta === 0
          ? 'var(--text-muted)'
          : 'var(--accent-red)'
      : 'var(--text-muted)'

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2 text-[var(--text-secondary)]">{label}</td>
      <td className="py-2 text-right text-[var(--text-primary)] font-mono">{formatValue(valueA)}</td>
      <td className="py-2 text-right text-[var(--text-primary)] font-mono">{formatValue(valueB)}</td>
      <td className="py-2 text-right font-mono" style={{ color: deltaColor }}>
        {delta !== null ? (delta > 0 ? '+' : '') + formatValue(delta) : '—'}
      </td>
    </tr>
  )
}

function computeStats(analyses: AnalysisRecord[], versionId: string): VersionStats | null {
  if (!versionId) return null

  const filtered = analyses.filter((a) => a.prompt_version_id === versionId)
  if (filtered.length === 0) return null

  const successCount = filtered.filter((a) => a.outcome === 'success').length
  const withTokens = filtered.filter((a) => a.token_count !== null)
  const withDuration = filtered.filter((a) => a.duration_ms !== null)

  const failureModes = new Map<string, number>()
  for (const a of filtered) {
    for (const mode of a.failure_modes) {
      failureModes.set(mode, (failureModes.get(mode) ?? 0) + 1)
    }
  }

  return {
    total: filtered.length,
    successRate: (successCount / filtered.length) * 100,
    avgTokens: withTokens.length > 0
      ? Math.round(withTokens.reduce((s, a) => s + (a.token_count ?? 0), 0) / withTokens.length)
      : null,
    avgDuration: withDuration.length > 0
      ? Math.round(withDuration.reduce((s, a) => s + (a.duration_ms ?? 0), 0) / withDuration.length)
      : null,
    failureModes,
  }
}

function formatDuration(ms: number): string {
  if (ms < 0) {
    return '-' + formatDuration(Math.abs(ms))
  }
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
