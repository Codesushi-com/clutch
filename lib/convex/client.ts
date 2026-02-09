/**
 * Client-side Convex client
 * 
 * This module provides a Convex React client for use in browser components.
 * It uses React context and MUST NOT be imported in server-side code.
 * 
 * IMPORTANT: Only use this in client-side React components.
 * For server-side API routes, use lib/convex/server.ts instead.
 */

import { ConvexReactClient } from "convex/react"

/**
 * Resolve the Convex URL at call time (not module load time).
 * 
 * Must be called inside a browser context (useEffect, event handler, etc.)
 * so that window.location is available. Falls back to 127.0.0.1 for SSR.
 */
function resolveConvexUrl(): string {
  // Explicit env var takes priority
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CONVEX_URL) {
    return process.env.NEXT_PUBLIC_CONVEX_URL
  }
  // In the browser: same host as the page, port 3210
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:3210`
  }
  // Server-side / SSR fallback
  return "http://127.0.0.1:3210"
}

/**
 * Convex React client for browser use.
 * 
 * Called from the provider's useEffect (client-side only), so
 * window.location is always available when this runs.
 */
export function createConvexClient(): ConvexReactClient | null {
  const url = resolveConvexUrl()
  if (!url) return null
  console.log("[Convex] Creating client with URL:", url)
  return new ConvexReactClient(url)
}

export { ConvexReactClient }
export type { ConvexReactClient as ConvexClientType }
