"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Session } from "@/convex/sessions"

export type { Session }

/**
 * Reactive Convex subscription for a single session by session_key.
 *
 * Returns the session data updated in real-time whenever the session
 * is updated in Convex.
 *
 * @param sessionKey - The session key to subscribe to (e.g., "clutch:project:chat123")
 */
export function useSession(sessionKey: string): {
  session: Session | null
  isLoading: boolean
} {
  const result = useQuery(api.sessions.get, { sessionKey })

  return {
    session: result ?? null,
    isLoading: result === undefined,
  }
}
