/**
 * Convex client exports
 * 
 * This module provides the public API for Convex clients.
 * 
 * IMPORTANT: Choose the right client for your use case:
 * 
 * - Server-side (API routes, server components): Use `@/lib/convex/server`
 * - Client-side (React components): Use `@/lib/convex/client` or `@/lib/convex/provider`
 * 
 * Never import from `convex/react` in server-side code - it uses React context
 * which will crash in server components. Always use the HTTP client from
 * `convex/browser` (re-exported as `ConvexHttpClient` from server.ts).
 */

// Server-side exports (safe for API routes)
export { getConvexClient, ConvexHttpClient } from "./server"

// Client-side exports (React components only)
export { ConvexProviderWrapper, useConvex, useQuery, useMutation } from "./provider"
export { createConvexClient, ConvexReactClient } from "./client"
export type { ConvexClientType } from "./client"
