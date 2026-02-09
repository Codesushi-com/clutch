/**
 * Server-side Convex client
 * 
 * This module provides a Convex HTTP client for use in server-side API routes.
 * It does NOT use React context and is safe to import in server components/API routes.
 * 
 * IMPORTANT: Only use this in server-side code (API routes, server components).
 * For client-side React components, use lib/convex/client.ts instead.
 */

import { ConvexHttpClient } from "convex/browser"

function getConvexUrl(): string {
  const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error(
      "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable is required for server-side Convex client"
    )
  }
  return url
}

/**
 * Lazy-initialized Convex HTTP client for server-side use.
 * 
 * This client is created on-demand to avoid initialization errors during
 * module load time. Use getConvexClient() to access it.
 */
let convexClient: ConvexHttpClient | null = null

export function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    convexClient = new ConvexHttpClient(getConvexUrl())
  }
  return convexClient
}

/**
 * Type-safe wrapper for calling Convex queries from server-side code.
 * 
 * Usage:
 * ```ts
 * import { getConvexClient } from "@/lib/convex/server"
 * import { api } from "@/convex/_generated/api"
 * 
 * const tasks = await getConvexClient().query(api.tasks.getByProject, { projectId: "..." })
 * ```
 */
export { ConvexHttpClient }
