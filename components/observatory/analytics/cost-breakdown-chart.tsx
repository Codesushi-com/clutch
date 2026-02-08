'use client'

/**
 * CostBreakdownChart Component
 * Pie/donut chart showing cost breakdown by role
 */

import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CostSummary } from '@/convex/analytics'

type TaskRole = 'pm' | 'dev' | 'research' | 'reviewer'

interface CostBreakdownChartProps {
  /** Cost summary data from Convex */
  data: CostSummary
  /** Loading state */
  isLoading?: boolean
}

const ROLE_COLORS: Record<TaskRole, string> = {
  pm: 'hsl(var(--chart-1))',
  dev: 'hsl(var(--chart-2))',
  research: 'hsl(var(--chart-3))',
  reviewer: 'hsl(var(--chart-4))',
}

const ROLE_LABELS: Record<TaskRole, string> = {
  pm: 'PM',
  dev: 'Dev',
  research: 'Research',
  reviewer: 'Reviewer',
}

/**
 * Custom tooltip for the pie chart
 */
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { count: number; percentage: number } }>
}) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0]

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium mb-2">{data.name}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Cost:</span>
          <span className="font-medium">${data.value.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Tasks:</span>
          <span className="font-medium">{data.payload.count}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Share:</span>
          <span className="font-medium">{data.payload.percentage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Custom legend with values
 */
function CustomLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string; payload: { count: number; cost: number; percentage: number } }>
}) {
  if (!payload) return null

  return (
    <div className="grid grid-cols-2 gap-2 mt-4">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}:</span>
          <span className="font-medium">${entry.payload.cost.toFixed(2)}</span>
          <span className="text-muted-foreground text-xs">({entry.payload.percentage.toFixed(1)}%)</span>
        </div>
      ))}
    </div>
  )
}

export function CostBreakdownChart({ data, isLoading }: CostBreakdownChartProps) {
  // Transform data for chart
  const chartData = useMemo(() => {
    const roles: TaskRole[] = ['pm', 'dev', 'research', 'reviewer']
    const totalCost = data.totalCost || 1 // Avoid division by zero

    return roles
      .filter((role) => data.byRole[role]?.count > 0) // Only show roles with data
      .map((role) => ({
        name: ROLE_LABELS[role],
        value: data.byRole[role].cost,
        count: data.byRole[role].count,
        percentage: (data.byRole[role].cost / totalCost) * 100,
        color: ROLE_COLORS[role],
      }))
  }, [data])

  // Check if there's any data
  const hasData = data.totalTasks > 0

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
  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
          <CardDescription>Cost distribution by role</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg bg-muted/30">
            <p className="text-muted-foreground text-sm">No cost data available</p>
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
            <CardTitle>Cost Breakdown</CardTitle>
            <CardDescription>Cost distribution by role</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">${data.totalCost.toFixed(2)}</div>
            <div className="text-muted-foreground text-xs">Total Cost</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] min-h-[300px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={60}
                content={<CustomLegend />}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
