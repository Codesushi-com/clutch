"use client"

/**
 * Convex Session Sync
 *
 * Syncs agent sessions from Convex to the global session store (zustand).
 * Replaces HTTP polling with reactive Convex subscriptions.
 *
 * This component is client-only to avoid SSR issues with Convex hooks.
 */

import dynamic from "next/dynamic"

// Dynamic import to avoid SSR - the inner component uses Convex hooks
const ConvexSessionSyncInner = dynamic(
  () => import("./convex-session-sync-inner").then((mod) => mod.ConvexSessionSyncInner),
  { ssr: false }
)

interface ConvexSessionSyncProps {
  /** Optional project ID to filter sessions. If not provided, syncs all sessions. */
  projectId?: string | null
}

export function ConvexSessionSync({ projectId }: ConvexSessionSyncProps) {
  return <ConvexSessionSyncInner projectId={projectId} />
}
