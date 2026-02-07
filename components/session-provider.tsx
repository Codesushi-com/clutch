"use client";

/**
 * Session Provider
 *
 * Mounts the SINGLE poller for session data at the app level.
 * This ensures only ONE fetch happens every 30 seconds, shared by all components.
 *
 * Place this in your root layout to enable session polling across the app.
 */

import { useSessionList } from "@/lib/hooks/use-openclaw-http";

interface SessionProviderProps {
  children: React.ReactNode;
  refreshIntervalMs?: number;
}

export function SessionProvider({
  children,
  refreshIntervalMs = 30000,
}: SessionProviderProps) {
  // This is the ONLY place that should mount the poller (shouldPoll=true)
  // All other components use useSessionStore or useSessionData (shouldPoll=false)
  useSessionList(refreshIntervalMs, true);

  return <>{children}</>;
}

/**
 * Hook for components to read session data from the shared store.
 *
 * This does NOT mount a poller - it only reads from the store.
 * The SessionProvider (mounted in root layout) handles the polling.
 */
export function useSessionData() {
  // Pass shouldPoll=false to ensure we don't create multiple pollers
  return useSessionList(30000, false);
}
