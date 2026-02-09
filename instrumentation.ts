/**
 * Next.js Instrumentation
 * Runs once on server startup for initializing backend services
 */

import { getConvexClient } from "@/lib/convex/server"
import { api } from "@/convex/_generated/api"

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[OpenClutch] Server ready (no background services)')

    // OpenClaw WebSocket client and work loop both run as separate processes
    // to keep the Next.js event loop clean for serving pages.
    //
    // Start them via: ./run.sh start
    //   - Work loop: npx tsx worker/loop.ts
    //   - Chat bridge: TODO — move to separate process
  }
}
