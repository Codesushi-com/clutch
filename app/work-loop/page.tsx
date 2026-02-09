'use client'

/**
 * Observatory Page
 * Tabbed dashboard for monitoring and analyzing AI agents
 * Replaces the old Work Loop page
 */

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Dynamically import ObservatoryShell to avoid SSR issues
const ObservatoryShell = dynamic(
  () =>
    import('@/components/observatory/observatory-shell').then((mod) => ({
      default: mod.ObservatoryShell,
    })),
  {
    ssr: false,
    loading: () => <ObservatorySkeleton />,
  }
)

function ObservatorySkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {['Live', 'Triage', 'Analytics', 'Models', 'Prompts'].map((tab) => (
          <div key={tab} className="px-4 py-2">
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

export default function ObservatoryPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <ObservatoryShell />
    </div>
  )
}
