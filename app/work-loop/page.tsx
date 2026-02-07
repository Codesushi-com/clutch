'use client'

/**
 * Work Loop Dashboard Page
 * Real-time status of the work loop orchestrator
 */

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Dynamically import WorkLoopContent to avoid SSR issues with Convex
const WorkLoopContent = dynamic(
  () => import('./components/work-loop-content').then(mod => ({ default: mod.WorkLoopContent })),
  {
    ssr: false,
    loading: () => <WorkLoopSkeleton />,
  }
)

function WorkLoopSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          <div className="h-6 w-16 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-9 w-24 bg-muted rounded animate-pulse" />
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="h-48 bg-muted rounded animate-pulse" />
          <div className="h-96 bg-muted rounded animate-pulse" />
        </div>
        <div className="lg:col-span-1 min-w-0 space-y-4">
          <div className="h-32 bg-muted rounded animate-pulse" />
          <div className="h-32 bg-muted rounded animate-pulse" />
          <div className="h-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export default function WorkLoopPage() {
  return <WorkLoopContent />
}
