'use client'

/**
 * SummaryCards Component
 * Displays 4 key metrics as cards with trend indicators
 * - Total Cost
 * - Avg Cycle Time
 * - Success Rate
 * - Throughput
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, DollarSign, Clock, CheckCircle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SummaryCardsProps {
  /** Total cost in dollars */
  totalCost: number
  /** Previous period cost for trend calculation */
  previousCost?: number
  /** Average cycle time in milliseconds */
  avgCycleTime: number
  /** Previous period cycle time for trend */
  previousCycleTime?: number
  /** Success rate as percentage (0-100) */
  successRate: number
  /** Previous period success rate */
  previousSuccessRate?: number
  /** Tasks per day throughput */
  throughput: number
  /** Previous period throughput */
  previousThroughput?: number
  /** Loading state */
  isLoading?: boolean
}

/**
 * Format milliseconds to human readable duration
 * e.g. "4h 22m", "2d 5h", "45m"
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
 * Format dollar amount
 */
function formatCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`
  }
  return `$${amount.toFixed(2)}`
}

/**
 * Get color class based on success rate
 */
function getSuccessRateColor(rate: number): string {
  if (rate >= 80) return 'text-green-500'
  if (rate >= 60) return 'text-yellow-500'
  return 'text-red-500'
}

type TrendDirection = 'up' | 'down' | 'flat'

/**
 * Calculate trend percentage and direction
 */
function calculateTrend(current: number, previous: number): { direction: TrendDirection; value: string } {
  if (previous === 0) {
    return current > 0 ? { direction: 'up' as const, value: 'New' } : { direction: 'flat' as const, value: '0%' }
  }

  const diff = ((current - previous) / previous) * 100
  const absValue = Math.abs(diff).toFixed(1)

  if (diff > 0) return { direction: 'up' as const, value: `+${absValue}%` }
  if (diff < 0) return { direction: 'down' as const, value: `-${absValue}%` }
  return { direction: 'flat' as const, value: '0%' }
}

interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  trend?: { direction: TrendDirection; value: string }
  trendLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
  isLoading?: boolean
}

function MetricCard({ title, value, icon, trend, trendLabel = 'vs last period', variant = 'default', isLoading }: MetricCardProps) {
  const variantStyles = {
    default: 'bg-card',
    success: 'bg-green-500/5 border-green-500/20',
    warning: 'bg-yellow-500/5 border-yellow-500/20',
    danger: 'bg-red-500/5 border-red-500/20',
  }

  if (isLoading) {
    return (
      <Card className="border animate-pulse">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded-full" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-20 bg-muted rounded mb-2" />
          <div className="h-3 w-32 bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('border', variantStyles[variant])}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <div className="flex items-center gap-1 text-xs mt-1">
            {trend.direction === 'up' && (
              <TrendingUp className={cn(
                'h-3 w-3',
                variant === 'success' ? 'text-green-500' :
                variant === 'danger' ? 'text-red-500' :
                'text-green-500'
              )} />
            )}
            {trend.direction === 'down' && (
              <TrendingDown className={cn(
                'h-3 w-3',
                variant === 'success' ? 'text-red-500' :
                variant === 'danger' ? 'text-green-500' :
                'text-red-500'
              )} />
            )}
            {trend.direction === 'flat' && <Minus className="h-3 w-3 text-muted-foreground" />}
            <span className={cn(
              trend.direction === 'up' ? (
                variant === 'success' ? 'text-green-500' :
                variant === 'danger' ? 'text-red-500' :
                'text-green-500'
              ) : trend.direction === 'down' ? (
                variant === 'success' ? 'text-red-500' :
                variant === 'danger' ? 'text-green-500' :
                'text-red-500'
              ) : 'text-muted-foreground'
            )}>
              {trend.value}
            </span>
            <span className="text-muted-foreground">{trendLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SummaryCards({
  totalCost,
  previousCost,
  avgCycleTime,
  previousCycleTime,
  successRate,
  previousSuccessRate,
  throughput,
  previousThroughput,
  isLoading,
}: SummaryCardsProps) {
  const costTrend = previousCost !== undefined ? calculateTrend(totalCost, previousCost) : undefined
  const cycleTimeTrend = previousCycleTime !== undefined ? calculateTrend(avgCycleTime, previousCycleTime) : undefined
  const successTrend = previousSuccessRate !== undefined ? calculateTrend(successRate, previousSuccessRate) : undefined
  const throughputTrend = previousThroughput !== undefined ? calculateTrend(throughput, previousThroughput) : undefined

  // For cycle time, down is good (faster), so we invert the trend visual
  const cycleTimeTrendVisual: { direction: TrendDirection; value: string } | undefined = cycleTimeTrend
    ? {
        ...cycleTimeTrend,
        direction:
          cycleTimeTrend.direction === 'up'
            ? 'down'
            : cycleTimeTrend.direction === 'down'
              ? 'up'
              : 'flat',
      }
    : undefined

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Cost"
        value={formatCurrency(totalCost)}
        icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        trend={costTrend}
        variant={totalCost > (previousCost || 0) ? 'default' : 'default'}
        isLoading={isLoading}
      />

      <MetricCard
        title="Avg Cycle Time"
        value={formatDuration(avgCycleTime)}
        icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        trend={cycleTimeTrendVisual}
        trendLabel="vs last period"
        variant={avgCycleTime < (previousCycleTime || Infinity) ? 'success' : avgCycleTime > (previousCycleTime || 0) ? 'warning' : 'default'}
        isLoading={isLoading}
      />

      <MetricCard
        title="Success Rate"
        value={`${successRate.toFixed(1)}%`}
        icon={<CheckCircle className={cn('h-4 w-4', getSuccessRateColor(successRate))} />}
        trend={successTrend}
        variant={successRate >= 80 ? 'success' : successRate >= 60 ? 'warning' : 'danger'}
        isLoading={isLoading}
      />

      <MetricCard
        title="Throughput"
        value={`${throughput.toFixed(1)} tasks/day`}
        icon={<Zap className="h-4 w-4 text-muted-foreground" />}
        trend={throughputTrend}
        variant={throughput > (previousThroughput || 0) ? 'success' : throughput < (previousThroughput || Infinity) ? 'warning' : 'default'}
        isLoading={isLoading}
      />
    </div>
  )
}
