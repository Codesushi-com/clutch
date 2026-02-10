"use client"

/**
 * UsageCostCard Component
 *
 * Dashboard widget showing 24-hour token usage and cost at a glance.
 * Displays total cost (primary), token counts with input/output split,
 * a mini sparkline for usage trend, and cost trend indicator.
 */

import { useMemo } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

interface UsageCostCardProps {
  projectId?: string | null
}

/**
 * Format currency for display
 * Examples: "$4.32", "$12.50", "$0.05"
 */
function formatCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`
  }
  return `$${amount.toFixed(2)}`
}

/**
 * Format token count for display
 * Examples: "1.2M", "850K", "1,234"
 */
function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K`
  }
  return count.toString()
}

/**
 * Calculate trend direction and percentage
 */
function calculateTrend(current: number, previous: number): {
  direction: "up" | "down" | "flat"
  percentage: string
  isBad: boolean
} {
  if (previous === 0) {
    return current > 0
      ? { direction: "up", percentage: "New", isBad: false }
      : { direction: "flat", percentage: "0%", isBad: false }
  }

  const diff = ((current - previous) / previous) * 100
  const absValue = Math.abs(diff).toFixed(1)

  // For cost, up is bad (red), down is good (green)
  if (diff > 0) return { direction: "up", percentage: `+${absValue}%`, isBad: true }
  if (diff < 0) return { direction: "down", percentage: `-${absValue}%`, isBad: false }
  return { direction: "flat", percentage: "0%", isBad: false }
}

/**
 * Generate SVG sparkline path from data points
 * Creates a simple area chart with smooth curve
 */
function generateSparklinePath(
  data: Array<{ cost: number; tokens: number }>,
  width: number,
  height: number,
  type: "cost" | "tokens" = "cost"
): string {
  if (data.length === 0) return ""

  const values = data.map((d) => (type === "cost" ? d.cost : d.tokens))
  const max = Math.max(...values, 0.01) // Avoid division by zero
  const min = Math.min(...values, 0)
  const range = max - min || 1

  const padding = 2
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  // Generate points
  const points = values.map((value, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth
    const y = padding + chartHeight - ((value - min) / range) * chartHeight
    return { x, y }
  })

  if (points.length < 2) {
    // Single point - draw a small line
    const p = points[0] || { x: width / 2, y: height / 2 }
    return `M ${p.x} ${p.y} L ${p.x + 1} ${p.y}`
  }

  // Build path with simple line segments (no smoothing for mini sparkline)
  let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    if (p) {
      path += ` L ${p.x} ${p.y}`
    }
  }

  return path
}

/**
 * Mini Sparkline Component
 * Simple SVG line chart for trend visualization
 */
function MiniSparkline({
  data,
  width = 120,
  height = 40,
  type = "cost",
  color = "hsl(var(--chart-1))",
}: {
  data: Array<{ cost: number; tokens: number }>
  width?: number
  height?: number
  type?: "cost" | "tokens"
  color?: string
}) {
  const pathD = useMemo(
    () => generateSparklinePath(data, width, height, type),
    [data, width, height, type]
  )

  const hasData = data.length > 0 && data.some((d) => (type === "cost" ? d.cost : d.tokens) > 0)

  if (!hasData) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
    )
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      {/* Gradient definition */}
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path
        d={`${pathD} L ${width} ${height} L 0 ${height} Z`}
        fill="url(#sparklineGradient)"
      />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Stacked Bar Component for Input/Output Token Split
 */
function TokenSplitBar({
  input,
  output,
  max,
}: {
  input: number
  output: number
  max: number
}) {
  const inputPercent = max > 0 ? (input / max) * 100 : 0
  const outputPercent = max > 0 ? (output / max) * 100 : 0
  const totalPercent = inputPercent + outputPercent

  return (
    <div className="w-full">
      {/* Bar */}
      <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-blue-500/70 transition-all"
          style={{ width: `${(inputPercent / totalPercent) * 100 || 0}%` }}
        />
        <div
          className="h-full bg-green-500/70 transition-all"
          style={{ width: `${(outputPercent / totalPercent) * 100 || 0}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>In: {formatTokenCount(input)}</span>
        <span>Out: {formatTokenCount(output)}</span>
      </div>
    </div>
  )
}

export function UsageCostCard({ projectId }: UsageCostCardProps) {
  // Fetch 24h session usage data
  const usageData = useQuery(api.analytics.sessionUsage, {
    projectId: projectId || undefined,
    timeRange: "24h",
  })

  const isLoading = usageData === undefined

  // Calculate trend
  const trend = useMemo(() => {
    if (!usageData) return null
    return calculateTrend(usageData.totalCost, usageData.previousCost)
  }, [usageData])

  // Max tokens for bar scaling
  const maxTokens = useMemo(() => {
    if (!usageData) return 1
    return Math.max(usageData.tokensInput, usageData.tokensOutput, 1)
  }, [usageData])

  if (isLoading) {
    return (
      <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 bg-[var(--bg-secondary)] rounded" />
          <div className="h-10 w-32 bg-[var(--bg-secondary)] rounded" />
          <div className="h-8 w-full bg-[var(--bg-secondary)] rounded" />
          <div className="h-10 w-full bg-[var(--bg-secondary)] rounded" />
        </div>
      </div>
    )
  }

  if (!usageData) {
    return (
      <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] p-4">
        <p className="text-sm text-[var(--text-muted)]">Failed to load usage data</p>
      </div>
    )
  }

  const { totalCost, totalTokens, tokensInput, tokensOutput, hourlyData } = usageData
  const hasData = totalCost > 0 || totalTokens > 0

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          24h Usage & Cost
        </h3>
      </div>

      {/* Content */}
      <div className="p-3 space-y-4">
        {!hasData ? (
          <p className="text-sm text-[var(--text-muted)] italic">
            No usage data for the last 24 hours
          </p>
        ) : (
          <>
            {/* Primary metric: Cost */}
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold text-[var(--text-primary)]">
                  {formatCurrency(totalCost)}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  Total cost (24h)
                </div>
              </div>

              {/* Trend indicator */}
              {trend && (
                <div className="flex items-center gap-1 text-sm">
                  {trend.direction === "up" && (
                    <TrendingUp
                      className={`h-4 w-4 ${trend.isBad ? "text-red-500" : "text-green-500"}`}
                    />
                  )}
                  {trend.direction === "down" && (
                    <TrendingDown
                      className={`h-4 w-4 ${trend.isBad ? "text-red-500" : "text-green-500"}`}
                    />
                  )}
                  {trend.direction === "flat" && (
                    <Minus className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span
                    className={`font-medium ${
                      trend.direction === "flat"
                        ? "text-muted-foreground"
                        : trend.isBad
                          ? "text-red-500"
                          : "text-green-500"
                    }`}
                  >
                    {trend.percentage}
                  </span>
                </div>
              )}
            </div>

            {/* Token counts with split */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">
                  {formatTokenCount(totalTokens)} tokens
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  Input / Output
                </span>
              </div>
              <TokenSplitBar input={tokensInput} output={tokensOutput} max={maxTokens} />
            </div>

            {/* Sparkline */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
                <span>Usage trend</span>
                <span>24h</span>
              </div>
              <MiniSparkline
                data={hourlyData}
                width={120}
                height={40}
                type="cost"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
