'use client'

/**
 * ThroughputChart Component
 * Bar chart showing tasks completed over time with optional cost overlay
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
  ComposedChart,
  Line,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ThroughputDataPoint } from '@/convex/analytics'

interface ThroughputChartProps {
  /** Array of data points from Convex throughput query */
  data: ThroughputDataPoint[]
  /** Current time range for labeling */
  timeRange: '24h' | '7d' | '30d' | 'all'
  /** Show cost line overlay */
  showCost?: boolean
  /** Loading state */
  isLoading?: boolean
}

/**
 * Format date label based on time range
 */
function formatDateLabel(dateStr: string, timeRange: '24h' | '7d' | '30d' | 'all'): string {
  if (timeRange === '24h') {
    // Format: "3PM", "11AM"
    const hour = parseInt(dateStr.slice(11, 13), 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}${ampm}`
  }

  // Format: "Jan 15", "Feb 3"
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Custom tooltip for the chart
 */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-2">{label}</div>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {entry.name === 'Cost'
              ? `$${entry.value.toFixed(2)}`
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ThroughputChart({ data, timeRange, showCost = false, isLoading }: ThroughputChartProps) {
  // Transform data for chart
  const chartData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      label: formatDateLabel(point.date, timeRange),
    }))
  }, [data, timeRange])

  // Calculate summary stats
  const totalTasks = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data])
  const totalCost = useMemo(() => data.reduce((sum, d) => sum + d.cost, 0), [data])
  const avgTasks = useMemo(() => (data.length > 0 ? totalTasks / data.length : 0), [data, totalTasks])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] min-h-[300px] bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Throughput</CardTitle>
          <CardDescription>Tasks completed per {timeRange === '24h' ? 'hour' : 'day'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-sm">No data for selected time range</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const ChartComponent = showCost ? ComposedChart : BarChart

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Throughput</CardTitle>
            <CardDescription>
              Tasks completed per {timeRange === '24h' ? 'hour' : 'day'}
            </CardDescription>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-right">
              <div className="text-2xl font-bold">{totalTasks}</div>
              <div className="text-muted-foreground text-xs">Total Tasks</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{avgTasks.toFixed(1)}</div>
              <div className="text-muted-foreground text-xs">Avg per {timeRange === '24h' ? 'hour' : 'day'}</div>
            </div>
            {showCost && (
              <div className="text-right">
                <div className="text-2xl font-bold">${totalCost.toFixed(0)}</div>
                <div className="text-muted-foreground text-xs">Total Cost</div>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] min-h-[300px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
            <ChartComponent data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              {showCost && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
              )}
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              />
              <Bar
                yAxisId="left"
                dataKey="count"
                name="Tasks"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
              />
              {showCost && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cost"
                  name="Cost"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--chart-2))', strokeWidth: 2, r: 3 }}
                />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
