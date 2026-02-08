'use client'

/**
 * ModelComparisonTable Component
 * Displays model performance metrics in a sortable table with highlighting
 */

import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelComparisonRecord, ModelRoleMetrics } from '@/convex/modelAnalytics'

type SortColumn = 'model' | 'tasks' | 'cost' | 'cycleTime' | 'successRate' | 'tokens'
type SortDirection = 'asc' | 'desc'

interface ModelComparisonTableProps {
  models: ModelComparisonRecord[]
  selectedRole: string | null
}

interface SortState {
  column: SortColumn
  direction: SortDirection
}

interface DisplayRow {
  model: string
  modelShort: string
  tasks: number
  avgCost: number
  avgCycleTimeMs: number
  successRate: number
  avgTokensIn: number
  avgTokensOut: number
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / (1000 * 60))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return String(count)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 0.9) return 'text-green-600 bg-green-50'
  if (rate >= 0.7) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

function SortHeader({
  label,
  column,
  currentSort,
  onSort,
}: {
  label: string
  column: SortColumn
  currentSort: SortState
  onSort: (column: SortColumn) => void
}) {
  const isActive = currentSort.column === column

  return (
    <TableHead
      className={cn(
        'cursor-pointer hover:bg-muted/80 transition-colors select-none',
        isActive && 'bg-muted/60'
      )}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="inline-flex">
          {isActive ? (
            currentSort.direction === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </span>
      </div>
    </TableHead>
  )
}

export function ModelComparisonTable({ models, selectedRole }: ModelComparisonTableProps) {
  const [sort, setSort] = useState<SortState>({ column: 'tasks', direction: 'desc' })

  // Transform models to display rows, applying role filter
  const displayRows = useMemo<DisplayRow[]>(() => {
    return models.map((model) => {
      // If a role is selected, use role-specific metrics
      if (selectedRole && model.byRole[selectedRole]) {
        const roleMetrics: ModelRoleMetrics = model.byRole[selectedRole]
        return {
          model: model.model,
          modelShort: model.modelShort,
          tasks: roleMetrics.count,
          avgCost: roleMetrics.avgCost,
          avgCycleTimeMs: roleMetrics.avgCycleTimeMs,
          successRate: roleMetrics.successRate,
          avgTokensIn: model.avgTokensIn, // Keep overall token stats
          avgTokensOut: model.avgTokensOut,
        }
      }

      // Otherwise use overall metrics
      return {
        model: model.model,
        modelShort: model.modelShort,
        tasks: model.tasksCompleted,
        avgCost: model.avgCostPerTask,
        avgCycleTimeMs: model.avgCycleTimeMs,
        successRate: model.successRate,
        avgTokensIn: model.avgTokensIn,
        avgTokensOut: model.avgTokensOut,
      }
    })
  }, [models, selectedRole])

  // Calculate best values for highlighting
  const bestValues = useMemo(() => {
    if (displayRows.length === 0) return null

    return {
      minCost: Math.min(...displayRows.map((r) => r.avgCost)),
      minCycleTime: Math.min(...displayRows.map((r) => r.avgCycleTimeMs)),
      maxSuccessRate: Math.max(...displayRows.map((r) => r.successRate)),
      maxTasks: Math.max(...displayRows.map((r) => r.tasks)),
    }
  }, [displayRows])

  // Sort rows
  const sortedRows = useMemo(() => {
    const rows = [...displayRows]

    rows.sort((a, b) => {
      let comparison = 0

      switch (sort.column) {
        case 'model':
          comparison = a.modelShort.localeCompare(b.modelShort)
          break
        case 'tasks':
          comparison = a.tasks - b.tasks
          break
        case 'cost':
          comparison = a.avgCost - b.avgCost
          break
        case 'cycleTime':
          comparison = a.avgCycleTimeMs - b.avgCycleTimeMs
          break
        case 'successRate':
          comparison = a.successRate - b.successRate
          break
        case 'tokens':
          comparison = a.avgTokensIn + a.avgTokensOut - (b.avgTokensIn + b.avgTokensOut)
          break
      }

      return sort.direction === 'asc' ? comparison : -comparison
    })

    return rows
  }, [displayRows, sort])

  const handleSort = (column: SortColumn) => {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const isBestInColumn = (row: DisplayRow, column: SortColumn): boolean => {
    if (!bestValues) return false

    switch (column) {
      case 'cost':
        return row.avgCost === bestValues.minCost && row.avgCost > 0
      case 'cycleTime':
        return row.avgCycleTimeMs === bestValues.minCycleTime && row.avgCycleTimeMs > 0
      case 'successRate':
        return row.successRate === bestValues.maxSuccessRate
      case 'tasks':
        return row.tasks === bestValues.maxTasks
      default:
        return false
    }
  }

  if (sortedRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No model data available for the selected filters.</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader
              label="Model"
              column="model"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Tasks"
              column="tasks"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Avg Cost"
              column="cost"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Avg Cycle Time"
              column="cycleTime"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Success Rate"
              column="successRate"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Tokens (in/out)"
              column="tokens"
              currentSort={sort}
              onSort={handleSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={row.model}>
              <TableCell className="font-medium">{row.modelShort}</TableCell>
              <TableCell
                className={cn(
                  isBestInColumn(row, 'tasks') && 'bg-green-50 font-semibold'
                )}
              >
                {row.tasks}
              </TableCell>
              <TableCell
                className={cn(
                  isBestInColumn(row, 'cost') && 'bg-green-50 font-semibold'
                )}
              >
                {formatCurrency(row.avgCost)}
              </TableCell>
              <TableCell
                className={cn(
                  isBestInColumn(row, 'cycleTime') && row.avgCycleTimeMs > 0 && 'bg-green-50 font-semibold'
                )}
              >
                {row.avgCycleTimeMs > 0 ? formatDuration(row.avgCycleTimeMs) : '—'}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                    getSuccessRateColor(row.successRate),
                    isBestInColumn(row, 'successRate') && 'ring-1 ring-green-500'
                  )}
                >
                  {formatPercent(row.successRate)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground">
                  {formatTokens(row.avgTokensIn)} / {formatTokens(row.avgTokensOut)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
