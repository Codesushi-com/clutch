'use client'

/**
 * TimeRangeToggle Component
 * Reusable toggle for 24h/7d/30d/All time ranges
 * Used across Analytics, Models, and Prompts tabs
 */

import { cn } from '@/lib/utils'

type TimeRange = '24h' | '7d' | '30d' | 'all'

interface TimeRangeToggleProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
  className?: string
}

const RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
]

export function TimeRangeToggle({ value, onChange, className }: TimeRangeToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1',
        className
      )}
    >
      {RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            'px-3 py-1 text-sm font-medium rounded-md transition-colors',
            value === range.value
              ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  )
}

export type { TimeRange }
