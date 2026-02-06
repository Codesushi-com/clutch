/**
 * UUID generation utilities
 * 
 * Provides a cross-platform UUID generator that works in both
 * secure contexts (HTTPS) and non-secure contexts (HTTP).
 * 
 * crypto.randomUUID() is only available in secure contexts,
 * so we fall back to a Math.random-based implementation.
 */

/**
 * Generate a UUID v4 string
 * 
 * Uses crypto.randomUUID() when available (secure contexts),
 * falls back to a manual implementation for HTTP/non-secure origins.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
