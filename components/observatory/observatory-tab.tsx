'use client'

/**
 * ObservatoryTab Component
 * Tab wrapper with loading states and consistent styling
 */

import { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ObservatoryTabProps {
  children: ReactNode
  isLoading?: boolean
  className?: string
}

export function ObservatoryTab({ children, isLoading, className }: ObservatoryTabProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  return <div className={className}>{children}</div>
}

/**
 * Placeholder content for tabs under construction
 */
interface ComingSoonProps {
  title: string
  description?: string
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-4">🚧</div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
      {description ? (
        <p className="text-sm text-[var(--text-secondary)] max-w-md">{description}</p>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">This section is coming soon.</p>
      )}
    </div>
  )
}
