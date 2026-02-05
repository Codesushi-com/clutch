'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ReactNode } from 'react'
import { convexClient } from './client'

interface ConvexProviderProps {
  children: ReactNode
}

export function ConvexClientProvider({ children }: ConvexProviderProps) {
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>
}

// Re-export for convenience
export { convexClient, ConvexReactClient }
