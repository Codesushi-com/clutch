'use client'

import { BarChart3 } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="rounded-full p-4 mb-4"
        style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
      >
        <BarChart3 className="h-8 w-8" style={{ color: 'var(--accent-blue)' }} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
        No metrics data yet
      </h3>
      <p className="text-sm text-[var(--text-muted)] max-w-md">
        Metrics will appear here once tasks have been analyzed. The work loop&apos;s analyze phase
        creates task analyses that feed into these dashboards.
      </p>
    </div>
  )
}
