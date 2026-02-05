import { ConvexHttpClient } from 'convex/browser'

// Self-hosted Convex URL from environment
const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL

if (!CONVEX_URL) {
  throw new Error('CONVEX_SELF_HOSTED_URL or NEXT_PUBLIC_CONVEX_SELF_HOSTED_URL is not set')
}

// Create the Convex HTTP client for server-side use
export const convexServerClient = new ConvexHttpClient(CONVEX_URL)

// Export for convenience
export { ConvexHttpClient }
