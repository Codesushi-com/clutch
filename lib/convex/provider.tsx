'use client'

/**
 * Convex Provider - Client-side only
 * 
 * This component wraps the app with Convex React context.
 * It MUST be marked with 'use client' and only used in client components.
 * 
 * The ConvexProvider creates a React context (using createContext internally),
 * which will crash if rendered on the server. That's why this file has the
 * 'use client' directive.
 */

import React from "react"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { createConvexClient } from "./client"

interface ConvexProviderWrapperProps {
  children: React.ReactNode
}

/**
 * Convex Provider wrapper component.
 * 
 * This initializes the Convex React client and provides it to all child
 * components via React context. Must be used within a client component
 * boundary (has 'use client' directive).
 * 
 * If NEXT_PUBLIC_CONVEX_URL is not set, renders children without Convex
 * (useful for development or when Convex is not configured).
 */
export function ConvexProviderWrapper({ children }: ConvexProviderWrapperProps) {
  const [client, setClient] = React.useState<ConvexReactClient | null>(null)

  React.useEffect(() => {
    const convexClient = createConvexClient()
    if (convexClient) {
      setClient(convexClient)
    }
  }, [])

  // Wait for client to initialize — rendering children without the provider
  // would crash any component that calls useQuery/useMutation
  if (!client) {
    return null
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

// Re-export for convenience
export { ConvexProvider } from "convex/react"
export { useConvex, useQuery, useMutation } from "convex/react"
export type { ConvexReactClient }
