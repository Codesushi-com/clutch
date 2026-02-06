'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { AnalysisRecord, PromptVersionSummary } from '../types'

interface BeforeAfterChartProps {
  analyses: AnalysisRecord[]
  promptVersions: PromptVersionSummary[]
}

interface TransitionData {
  role: string
  fromVersion: number
  toVersion: number
  beforeRate: number
  afterRate: number
  beforeCount: number
  afterCount: number
}

export function BeforeAfterChart({ analyses, promptVersions }: BeforeAfterChartProps) {
  const transitions = useMemo(() => {
    if (analyses.length === 0 || promptVersions.length === 0) return []

    // Group versions by role, sorted by version number
    const versionsByRole = new Map<string, PromptVersionSummary[]>()
    for (const v of promptVersions) {
      const list = versionsByRole.get(v.role) ?? []
      list.push(v)
      versionsByRole.set(v.role, list)
    }

    const results: TransitionData[] = []

    for (const [role, versions] of versionsByRole) {
      const sorted = [...versions].sort((a, b) => a.version - b.version)
      if (sorted.length < 2) continue

      // Look at adjacent version pairs
      for (let i = 0; i < sorted.length - 1; i++) {
        const before = sorted[i]
        const after = sorted[i + 1]

        const beforeAnalyses = analyses.filter((a) => a.prompt_version_id === before.id)
        const afterAnalyses = analyses.filter((a) => a.prompt_version_id === after.id)

        if (beforeAnalyses.length === 0 || afterAnalyses.length === 0) continue

        const beforeSuccess = beforeAnalyses.filter((a) => a.outcome === 'success').length
        const afterSuccess = afterAnalyses.filter((a) => a.outcome === 'success').length

        results.push({
          role,
          fromVersion: before.version,
          toVersion: after.version,
          beforeRate: (beforeSuccess / beforeAnalyses.length) * 100,
          afterRate: (afterSuccess / afterAnalyses.length) * 100,
          beforeCount: beforeAnalyses.length,
          afterCount: afterAnalyses.length,
        })
      }
    }

    return results
  }, [analyses, promptVersions])

  if (transitions.length === 0) {
    return null
  }

  const data = transitions.map((t) => ({
    name: `${t.role} v${t.fromVersion}→v${t.toVersion}`,
    before: Math.round(t.beforeRate * 10) / 10,
    after: Math.round(t.afterRate * 10) / 10,
    beforeLabel: `v${t.fromVersion} (n=${t.beforeCount})`,
    afterLabel: `v${t.toVersion} (n=${t.afterCount})`,
  }))

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
        Before / After Version Changes
      </h3>
      <div style={{ width: '100%', height: Math.max(200, transitions.length * 60 + 60) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
              width={150}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
              formatter={(value, name) => [`${value}%`, name === 'before' ? 'Before' : 'After']}
            />
            <Legend />
            <Bar dataKey="before" name="Before" fill="#71717a" radius={[0, 4, 4, 0]} barSize={18} />
            <Bar dataKey="after" name="After" radius={[0, 4, 4, 0]} barSize={18}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.after >= entry.before ? 'var(--accent-green)' : 'var(--accent-red)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
