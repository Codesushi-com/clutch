'use client'

/**
 * CycleTimeChart Component
 * Horizontal bar chart showing average time spent in each phase
 */

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CycleTimesResult } from '@/convex/analytics'

interface CycleTimeChartProps {
  /** Cycle time data from Convex */
  data: CycleTimesResult
  /** Loading state */
  isLoading?: boolean
}

type PhaseKey = 'ready' | 'in_progress' | 'in_review'

interface PhaseData {
  name: string
  key: PhaseKey
  avg: number
  median: number
  p90: number
  color: string
}

const PHASE_CONFIG: Record<PhaseKey, { label: string; color: string }> = {
  ready: { label: 'Waiting (Ready)', color: 'hsl(var(--chart-1))' },
  in_progress: { label: 'Working (In Progress)', color: 'hsl(var(--chart-2))' },
  in_review: { label: 'Reviewing', color: 'hsl(var(--chart-3))' },
}

/**
 * Format milliseconds to human readable duration
 */
function formatDuration(ms: number): string {
  if (ms === 0) return '0m'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }

  return `${minutes}m`
}

/**
 * Format for axis labels (shorter)
 */
function formatAxisLabel(ms: number): string {
  if (ms === 0) return '0'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d`
  return `${hours}h`
}

/**
 * Custom tooltip
 */
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: PhaseData }>
}) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-2">{data.name}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Average:</span>
          <span className="font-medium">{formatDuration(data.avg)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Median:</span>
          <span className="font-medium">{formatDuration(data.median)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">P90:</span>
          <span className="font-medium">{formatDuration(data.p90)}</span>
        </div>
      </div>
    </div>
  )
}

export function CycleTimeChart({ data, isLoading }: CycleTimeChartProps) {
  // Transform data for chart
  const chartData: PhaseData[] = useMemo(() => {
    const phases: PhaseKey[] = ['ready', 'in_progress', 'in_review']

    return phases.map((phase) => ({
      name: PHASE_CONFIG[phase].label,
      key: phase,
      avg: data.phases[phase].average,
      median: data.phases[phase].median,
      p90: data.phases[phase].p90,
      color: PHASE_CONFIG[phase].color,
    }))
  }, [data])

  // Calculate totals
  const totalAvg = useMemo(
    () => chartData.reduce((sum, d) => sum + d.avg, 0),
    [chartData]
  )

  // Check if there's any data (at least one phase has non-zero time)
  const hasData = chartData.some((d) => d.avg > 0)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-[250px] min-h-[250px] bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cycle Time Distribution</CardTitle>
          <CardDescription>Average time spent in each phase</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] min-h-[250px] flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-sm">No cycle time data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Cycle Time Distribution</CardTitle>
            <CardDescription>Average time spent in each phase</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{formatDuration(totalAvg)}</div>
            <div className="text-muted-foreground text-xs">Total Avg Cycle Time</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] min-h-[250px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 120, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={formatAxisLabel}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
              <Bar dataKey="avg" name="Average Time" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
