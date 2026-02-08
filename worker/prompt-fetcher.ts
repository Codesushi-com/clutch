/**
 * Prompt Fetcher
 *
 * Fetches role-specific prompts from Convex promptVersions.
 * This module centralizes prompt fetching and ensures workers always use
 * the currently-active prompt version for each role.
 *
 * Replaces hardcoded prompt builders in prompts.ts and review.ts.
 */

import type { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"

// ============================================
// Types
// ============================================

export interface PromptVersion {
  id: string
  role: string
  model?: string
  version: number
  content: string
  change_summary?: string
  parent_version_id?: string
  created_by: string
  active: boolean
  created_at: number
}

export interface ResolveActiveResult {
  promptVersion: PromptVersion | null
  ab_test: boolean
  ab_variant?: "control" | "challenger"
}

export class PromptNotFoundError extends Error {
  constructor(role: string, model?: string) {
    const modelStr = model ? `, model: ${model}` : ""
    super(`No active prompt version found for role: ${role}${modelStr}`)
    this.name = "PromptNotFoundError"
  }
}

// ============================================
// Prompt Fetching
// ============================================

/**
 * Fetch the active prompt version for a role from Convex.
 *
 * This is the single source of truth for role prompts. All workers should
 * use this function instead of hardcoded prompt builders.
 *
 * @param convex - Convex HTTP client
 * @param role - The role (dev, reviewer, pm, research, conflict_resolver)
 * @param model - Optional model filter
 * @returns The active prompt version
 * @throws PromptNotFoundError if no active prompt exists for the role
 */
export async function fetchActivePrompt(
  convex: ConvexHttpClient,
  role: string,
  model?: string
): Promise<PromptVersion> {
  const rand = Math.floor(Math.random() * 100)

  const result = await convex.query(api.promptVersions.resolveActive, {
    role,
    model,
    rand,
  })

  if (!result.promptVersion) {
    throw new PromptNotFoundError(role, model)
  }

  return result.promptVersion as PromptVersion
}

/**
 * Fetch the active prompt content for a role, with optional fallback.
 *
 * Use this when you need the content string directly and want to handle
 * the missing prompt case gracefully (e.g., with a fallback).
 *
 * @param convex - Convex HTTP client
 * @param role - The role
 * @param options - Optional model and fallback
 * @returns The prompt content, or fallback if provided and prompt not found
 * @throws PromptNotFoundError if no active prompt and no fallback provided
 */
export async function fetchPromptContent(
  convex: ConvexHttpClient,
  role: string,
  options?: {
    model?: string
    fallback?: string
    logError?: (message: string) => void
  }
): Promise<string> {
  try {
    const prompt = await fetchActivePrompt(convex, role, options?.model)
    return prompt.content
  } catch (error) {
    if (error instanceof PromptNotFoundError) {
      if (options?.fallback !== undefined) {
        options.logError?.(
          `[PromptFetcher] No active prompt for role '${role}', using fallback`
        )
        return options.fallback
      }
    }
    throw error
  }
}

// ============================================
// Runtime Guard
// ============================================

/**
 * Verify that all required roles have active prompt versions.
 *
 * Call this during work loop startup to fail fast if prompts are missing.
 *
 * @param convex - Convex HTTP client
 * @param roles - Array of role names to verify
 * @returns Array of missing roles (empty if all found)
 */
export async function verifyPromptsExist(
  convex: ConvexHttpClient,
  roles: string[]
): Promise<string[]> {
  const missing: string[] = []

  for (const role of roles) {
    try {
      await fetchActivePrompt(convex, role)
    } catch (error) {
      if (error instanceof PromptNotFoundError) {
        missing.push(role)
      }
    }
  }

  return missing
}

/**
 * Assert that all required prompts exist, throwing if any are missing.
 *
 * @param convex - Convex HTTP client
 * @param roles - Array of role names to verify
 * @throws Error if any prompts are missing
 */
export async function assertPromptsExist(
  convex: ConvexHttpClient,
  roles: string[]
): Promise<void> {
  const missing = await verifyPromptsExist(convex, roles)

  if (missing.length > 0) {
    throw new Error(
      `Missing active prompt versions for roles: ${missing.join(", ")}. ` +
      `Run POST /api/prompts/seed to initialize prompts.`
    )
  }
}

// ============================================
// v2 Role Constants
// ============================================

/**
 * Valid v2 work loop roles. Aligns with TaskRole type in lib/types/index.ts.
 */
export const V2_ROLES = [
  "pm",
  "dev",
  "research",
  "reviewer",
  "conflict_resolver",
] as const

export type V2Role = (typeof V2_ROLES)[number]

/**
 * Check if a role is a valid v2 role.
 */
export function isValidV2Role(role: string): role is V2Role {
  return V2_ROLES.includes(role as V2Role)
}
