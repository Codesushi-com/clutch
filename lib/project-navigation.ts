/**
 * Project navigation utilities for tab segment handling
 */

/**
 * Valid tab segments for project navigation.
 * These represent the main sections within a project.
 */
export const VALID_TAB_SEGMENTS = ["chat", "board", "roadmap", "sessions", "work-loop", "settings"] as const

/**
 * Type representing a valid tab segment
 */
export type ValidTabSegment = (typeof VALID_TAB_SEGMENTS)[number]

/**
 * Extract the tab segment from a pathname.
 * Returns the first path segment after `/projects/{slug}/` if it's a valid tab,
 * otherwise falls back to "chat".
 *
 * @param pathname - The current URL pathname (or null if not available)
 * @returns The valid tab segment, defaults to "chat"
 */
export function getTabSegment(pathname: string | null): ValidTabSegment {
  if (!pathname) return "chat"
  const match = pathname.match(/^\/projects\/[^\/]+\/([^\/]+)/)
  const segment = match?.[1]
  if (segment && VALID_TAB_SEGMENTS.includes(segment as ValidTabSegment)) {
    return segment as ValidTabSegment
  }
  return "chat"
}
