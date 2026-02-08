"use client"

/**
 * Convex Session Sync
 *
 * Syncs sessions from Convex to the global session store (zustand).
 * Replaces HTTP polling with reactive Convex subscriptions.
 *
 * This component is client-only to avoid SSR issues with Convex hooks.
 *
 * Now uses the sessions table instead of deriving sessions from tasks.
 */

import dynamic from "next/dynamic"

// Dynamic import to avoid SSR - the inner component uses Convex hooks
const ConvexSessionSyncInner = dynamic(
  () => import("./convex-session-sync-inner").then((mod) => mod.ConvexSessionSyncInner),
  { ssr: false }
)

interface ConvexSessionSyncProps {
  /** Optional project slug to filter sessions. If not provided, syncs all sessions. */
  projectSlug?: string | null
  /** Optional session type filter */
  sessionType?: "main" | "chat" | "agent" | "cron"
}

export function ConvexSessionSync({ projectSlug, sessionType }: ConvexSessionSyncProps) {
  return <ConvexSessionSyncInner projectSlug={projectSlug} sessionType={sessionType} />
}
