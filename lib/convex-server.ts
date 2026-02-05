import { ConvexHttpClient } from "convex/browser"

const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL

if (!CONVEX_URL) {
  throw new Error("CONVEX_SELF_HOSTED_URL or NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL must be set")
}

/**
 * Create a Convex HTTP client for server-side use.
 * Each request should create a new client to avoid sharing state.
 */
export function createConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL!, {
    skipConvexDeploymentUrlCheck: true,
  })
}

/**
 * Singleton client for cases where creating a new client per request is not feasible.
 * Use with caution - the ConvexHttpClient is stateful (has auth and queues mutations).
 */
export const convexServerClient = createConvexClient()
