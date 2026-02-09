/**
 * Shared helpers for Convex functions.
 * All tables use string UUIDs as primary keys (not Convex native IDs).
 */

/**
 * Generate a UUID v4 string.
 * Uses a simple implementation compatible with the Convex runtime
 * (which may not have crypto.randomUUID()).
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
