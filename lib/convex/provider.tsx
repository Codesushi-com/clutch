'use client'

import React from "react"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { createConvexClient } from "./client"

interface ConvexProviderWrapperProps {
  children: React.ReactNode
}

export function ConvexProviderWrapper({ children }: ConvexProviderWrapperProps) {
  // Use state to track if we're mounted on the client
  // This ensures SSR and initial client render match, avoiding hydration errors
  const [mounted, setMounted] = React.useState(false)
  const [client, setClient] = React.useState<ConvexReactClient | null>(null)

  React.useEffect(() => {
    // Only create client after mount to ensure SSR/hydration match
    const newClient = createConvexClient()
    setClient(newClient)
    setMounted(true)
  }, [])

  // During SSR and initial client render (before useEffect runs),
  // render children without provider to match SSR output
  if (!mounted || !client) {
    return <>{children}</>
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

export { ConvexProvider } from "convex/react"
export { useConvex, useQuery, useMutation } from "convex/react"
export type { ConvexReactClient }
