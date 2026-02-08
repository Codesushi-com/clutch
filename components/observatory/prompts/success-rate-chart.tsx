'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AnalysisRecord } from './types'

const ROLE_COLORS: Record<string, string> = {
  dev: '#3b82f6', // blue
  pm: '#a855f7', // purple
  qa: '#22c55e', // green
  researcher: '#eab308', // yellow
  reviewer: '#f97316', // orange
  pe: '#ec4899', // pink
  analyzer: '#06b6d4', // cyan
}

interface SuccessRateChartProps {
  analyses: AnalysisRecord[]
}

export function SuccessRateChart({ analyses }: SuccessRateChartProps) {
  const { data, roles } = useMemo(() => {
    if (analyses.length === 0) return { data: [], roles: [] }

    // Group by week
    const byWeek = new Map<string, Map<string, { success: number; total: number }>>()
    const allRoles = new Set<string>()

    for (const a of analyses) {
      const weekLabel = getWeekLabel(a.analyzed_at)
      allRoles.add(a.role)

      if (!byWeek.has(weekLabel)) {
        byWeek.set(weekLabel, new Map())
      }
      const weekMap = byWeek.get(weekLabel)!
      if (!weekMap.has(a.role)) {
        weekMap.set(a.role, { success: 0, total: 0 })
      }
      const stats = weekMap.get(a.role)!
      stats.total++
      if (a.outcome === 'success') {
        stats.success++
      }
    }

    // Sort weeks chronologically
    const sortedWeeks = [...byWeek.keys()].sort()
    const roles = [...allRoles].sort()

    const data = sortedWeeks.map((week) => {
      const weekMap = byWeek.get(week)!
      const point: Record<string, string | number> = { week }

      for (const role of roles) {
        const stats = weekMap.get(role)
        if (stats && stats.total > 0) {
          point[role] = Math.round((stats.success / stats.total) * 100)
        }
      }

      return point
    })

    return { data, roles }
  }, [analyses])

  if (data.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
        Success Rate Over Time
      </h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
              formatter={(value) => [`${value}%`]}
            />
            <Legend />
            {roles.map((role) => (
              <Line
                key={role}
                type="monotone"
                dataKey={role}
                stroke={ROLE_COLORS[role] ?? '#71717a'}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function getWeekLabel(epochMs: number): string {
  const date = new Date(epochMs)
  // Get Monday of the week
  const day = date.getUTCDay()
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(date)
  monday.setUTCDate(diff)
  const month = monday.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${monday.getUTCDate()}`
}
