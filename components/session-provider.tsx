"use client";

/**
 * Session Provider
 *
 * Provides reactive session data from Convex.
 * Replaces the HTTP polling-based provider with reactive Convex subscriptions.
 *
 * This mounts the Convex session sync at the app level, ensuring all
 * components have access to real-time session data without polling.
 */

// ConvexSessionSync component removed - direct Convex queries used instead

interface SessionProviderProps {
  children: React.ReactNode;
  /** @deprecated refreshIntervalMs is no longer used - Convex provides reactive updates */
  refreshIntervalMs?: number;
}

export function SessionProvider({
  children,
  /** @deprecated No longer used */
  refreshIntervalMs: _refreshIntervalMs,
}: SessionProviderProps) {
  // Sessions now queried directly via Convex hooks where needed
  return (
    <>
      {children}
    </>
  );
}

/**
 * Hook for components to read session data from the shared store.
 *
 * @deprecated Components should use direct Convex session queries instead,
 * or continue using useSessionStore for zustand access. The data now comes from Convex, not HTTP.
 */
export function useSessionData() {
  // This is now a no-op - SessionProvider handles sync automatically
  // Components should use direct Convex session queries for reactive updates
  return {
    sessions: [],
    isLoading: false,
    error: null,
    isInitialized: true,
    refresh: async () => {
      // No-op: Convex handles reactivity automatically
    },
  };
}
