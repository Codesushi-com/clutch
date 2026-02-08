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
} from 'recharts'
import type { AnalysisRecord, PromptVersionSummary } from './types'

const VERSION_COLORS = [
  '#3b82f6',
  '#a855f7',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
]

interface TokenEfficiencyChartProps {
  analyses: AnalysisRecord[]
  promptVersions: PromptVersionSummary[]
}

export function TokenEfficiencyChart({ analyses, promptVersions }: TokenEfficiencyChartProps) {
  const { data, versionKeys } = useMemo(() => {
    const withTokens = analyses.filter((a) => a.token_count !== null)
    if (withTokens.length === 0) return { data: [], versionKeys: [] }

    // Build a map of version id → label
    const versionMap = new Map<string, string>()
    for (const v of promptVersions) {
      versionMap.set(v.id, `v${v.version}`)
    }

    // Group by role + version
    const groups = new Map<string, Map<string, number[]>>()
    const allVersionLabels = new Set<string>()

    for (const a of withTokens) {
      const vLabel = versionMap.get(a.prompt_version_id) ?? 'unknown'
      allVersionLabels.add(vLabel)

      if (!groups.has(a.role)) {
        groups.set(a.role, new Map())
      }
      const roleMap = groups.get(a.role)!
      if (!roleMap.has(vLabel)) {
        roleMap.set(vLabel, [])
      }
      roleMap.get(vLabel)!.push(a.token_count!)
    }

    const sortedRoles = [...groups.keys()].sort()
    const versionKeys = [...allVersionLabels].sort()

    const data = sortedRoles.map((role) => {
      const roleMap = groups.get(role)!
      const point: Record<string, string | number> = { role }

      for (const vLabel of versionKeys) {
        const tokens = roleMap.get(vLabel)
        if (tokens && tokens.length > 0) {
          point[vLabel] = Math.round(tokens.reduce((s, t) => s + t, 0) / tokens.length)
        }
      }

      return point
    })

    return { data, versionKeys }
  }, [analyses, promptVersions])

  if (data.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
        Token Efficiency by Role & Version
      </h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="role"
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
              formatter={(value) => [Number(value).toLocaleString()]}
            />
            <Legend />
            {versionKeys.map((vKey, i) => (
              <Bar
                key={vKey}
                dataKey={vKey}
                fill={VERSION_COLORS[i % VERSION_COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
