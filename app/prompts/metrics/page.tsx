'use client'

import dynamic from 'next/dynamic'

const MetricsContent = dynamic(
  () => import('./components/metrics-content').then((mod) => ({ default: mod.MetricsContent })),
  {
    ssr: false,
    loading: () => <MetricsSkeleton />,
  }
)

function MetricsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 bg-muted rounded animate-pulse" />
          <div>
            <div className="h-5 w-36 bg-muted rounded animate-pulse" />
            <div className="h-4 w-56 bg-muted rounded animate-pulse mt-1" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Overview cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="h-4 w-20 bg-muted rounded animate-pulse mb-3" />
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="h-4 w-40 bg-muted rounded animate-pulse mb-4" />
          <div className="h-[300px] bg-muted rounded animate-pulse" />
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="h-4 w-52 bg-muted rounded animate-pulse mb-4" />
          <div className="h-[300px] bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export default function MetricsPage() {
  return (
    <div className="p-6">
      <MetricsContent />
    </div>
  )
}
