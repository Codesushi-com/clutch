import { ConvexReactClient } from 'convex/react'

// Self-hosted Convex URL from environment
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL

if (!CONVEX_URL) {
  throw new Error('NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL is not set')
}

// Create the Convex React client
export const convexClient = new ConvexReactClient(CONVEX_URL)

// Export for convenience
export { ConvexReactClient }
